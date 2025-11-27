require('dotenv').config({ path: '../.env' });
const db = require('../config/database');
const { getEmbedding } = require('../services/knowledgeEmbeddingService');
const { OpenAI } = require('openai');

// 使用 SiliconFlow (Qwen) 或是 OpenAI 來進行翻譯與擴充
const siliconFlowApiKey = process.env.SiliconFlow_API_KEY;
const siliconFlowBaseUrl = 'https://api.siliconflow.cn/v1';

let llmClient;
let modelName;

if (siliconFlowApiKey) {
    llmClient = new OpenAI({
        apiKey: siliconFlowApiKey,
        baseURL: siliconFlowBaseUrl,
    });
    modelName = "Qwen/Qwen3-235B-A22B"; // 使用強大的模型來確保翻譯準確
} else {
    llmClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    modelName = "gpt-4-turbo";
}

async function enrichSpeciesSynonyms() {
    console.log('開始執行樹種同義詞擴充任務...');
    let client;
    
    try {
        // 1. 獲取所有樹種名稱 (從 tree_species 或 tree_carbon_data)
        // 這裡我們選擇 tree_species 作為權威來源，或者 tree_carbon_data 的 distinct common_name_zh
        const result = await db.query('SELECT DISTINCT common_name_zh FROM tree_carbon_data WHERE common_name_zh IS NOT NULL');
        const speciesList = result.rows.map(r => r.common_name_zh);

        console.log(`找到 ${speciesList.length} 個樹種需要處理。`);

        // 2. 分批處理，避免 LLM Token 爆炸與記憶體溢出
        const BATCH_SIZE = 3; // 降低批次大小，減輕記憶體壓力 (原為 5)
        
        for (let i = 0; i < speciesList.length; i += BATCH_SIZE) {
            const batch = speciesList.slice(i, i + BATCH_SIZE);
            console.log(`[${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(speciesList.length/BATCH_SIZE)}] 正在處理批次: ${batch.join(', ')}`);

            // 手動觸發 Garbage Collection (如果 Node 啟動時帶有 --expose-gc)
            if (global.gc) {
                global.gc();
            }
            
            // 讓 Event Loop 喘息，釋放上一批次的資源
            await new Promise(resolve => setTimeout(resolve, 2000));

            const prompt = `
            請作為一位植物學家與翻譯專家。我會給你一組樹木的中文俗名。
            請為每一個樹種提供以下資訊：
            1. 學名 (Scientific Name)
            2. 英文俗名 (Common Names in English, 多個用逗號分隔)
            3. 中文別名 (其他常見的中文稱呼)
            4. 科屬分類 (Family/Genus)

            請嚴格按照以下 JSON 格式返回陣列，不要包含 markdown 格式標記：
            [
                {
                    "input_name": "中文俗名",
                    "scientific_name": "Latin Name",
                    "english_names": "Name 1, Name 2",
                    "chinese_aliases": "別名1, 別名2",
                    "taxonomy": "科名"
                },
                ...
            ]

            待處理列表: ${JSON.stringify(batch)}
            `;

            try {
                const completion = await llmClient.chat.completions.create({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3, // 低溫度以確保格式準確
                });

                let content = completion.choices[0].message.content;
                // 清理可能存在的 markdown 標記
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                
                const enrichedData = JSON.parse(content);

                // 3. 為每個擴充後的數據生成 Embedding 並存入知識庫
                for (const item of enrichedData) {
                    try {
                        // 構建豐富的索引文本
                        // 格式：[索引] 相思樹 (Acacia confusa). EN: Taiwan Acacia. Alias: 台灣相思. Taxonomy: 豆科.
                        const indexText = `[樹種索引] ${item.input_name} (${item.scientific_name}). 英文名: ${item.english_names}. 中文別名: ${item.chinese_aliases}. 分類: ${item.taxonomy}.`;
                        
                        console.log(`生成索引: ${indexText.substring(0, 50)}...`);
                        
                        let embeddingVector = await getEmbedding(indexText);
                        
                        if (!embeddingVector || embeddingVector.length === 0) {
                             console.warn(`Skipping ${item.input_name}: Embedding generation failed.`);
                             continue;
                        }

                        const embeddingJson = JSON.stringify(embeddingVector);
                        embeddingVector = null; // 明確釋放記憶體

                        // 存入 tree_knowledge_embeddings_v2
                        // 使用特殊的 source_type 區分
                        const insertQuery = `
                            INSERT INTO tree_knowledge_embeddings_v2 
                            (source_type, internal_source_record_id, text_content, summary_cn, embedding, 
                             original_source_title, keywords, confidence_score, last_verified_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                            ON CONFLICT (source_type, internal_source_record_id) 
                            DO UPDATE SET 
                                text_content = EXCLUDED.text_content,
                                embedding = EXCLUDED.embedding,
                                last_verified_at = NOW()
                        `;

                        await db.query(insertQuery, [
                            'SPECIES_SYNONYM_INDEX', // 特殊來源類型
                            item.input_name,         // ID 使用中文名即可
                            indexText,               // 完整文本作為內容
                            `樹種多語言對照索引: ${item.input_name}`, // 摘要
                            embeddingJson,
                            `索引: ${item.input_name}`,
                            `${item.input_name},${item.scientific_name},${item.english_names},${item.chinese_aliases}`, // 關鍵字
                            10 // 給予極高的置信度，讓它在檢索時優先浮現
                        ]);
                    } catch (innerErr) {
                        console.error(`處理單一項目失敗 (${item.input_name}):`, innerErr.message);
                    }
                }

                enrichedData = null; // 釋放批次資料記憶體
                content = null;      // 釋放 LLM 回應記憶體

            } catch (err) {
                console.error(`批次處理失敗 (${batch.join(', ')}):`, err.message);
                // 失敗後稍微暫停更久
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log('所有樹種同義詞擴充完成。');

    } catch (error) {
        console.error('enrichSpeciesSynonyms 執行錯誤:', error);
    } finally {
        if (require.main === module && db.pool) {
            db.pool.end();
        }
    }
}

if (require.main === module) {
    enrichSpeciesSynonyms();
}

module.exports = enrichSpeciesSynonyms;

