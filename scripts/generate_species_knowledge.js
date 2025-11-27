require('dotenv').config({ path: '../.env' });
const db = require('../config/database');
const { getEmbedding } = require('../services/knowledgeEmbeddingService');

// 引入 OpenAI SDK 用於文本生成 和 SiliconFlow 兼容API
const { OpenAI } = require('openai');

// 配置 SiliconFlow (Qwen3)
const siliconFlowApiKey = process.env.SiliconFlow_API_KEY;
const siliconFlowBaseUrl = 'https://api.siliconflow.cn/v1'; // 請確認這是正確的 SiliconFlow API 端點

let qwenLlm;
if (siliconFlowApiKey) {
    qwenLlm = new OpenAI({
        apiKey: siliconFlowApiKey,
        baseURL: siliconFlowBaseUrl,
    });
} else {
    console.warn("SiliconFlow API Key 未設定，Qwen3 功能將不可用。");
}

// 配置 Claude (備用)
const Anthropic = require('@anthropic-ai/sdk');
const claudeApiKey = process.env.Claude_API_KEY;
let anthropic;
if (claudeApiKey) {
    anthropic = new Anthropic({ apiKey: claudeApiKey });
} else {
    console.warn("Claude API Key 未設定，Claude 功能將不可用。");
}

// OpenAI 客戶端，用於 gpt-3.5-turbo 分塊
const openaiForChunking = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chunkTextWithLLM(longText, targetModel = "gpt-4.1-mini") {
    console.log(`調用 ${targetModel} 對文本進行分塊 (文本前50字): ${longText.substring(0, 50)}...`);
    const chunkPrompt = `請將以下提供的關於樹木的詳細描述文本，智能地分割成多個語義連貫的知識片段。
每個片段應該圍繞一個清晰的小主題（例如，形態特徵、特定生態習性、碳吸存的某個方面、某項栽培技術等）。
請確保每個片段的長度大致在150到300字之間。
使用 "---CHUNK_SEPARATOR---" 作為每個片段之間的分隔符。請直接輸出分割後的片段，不要添加任何額外的解釋或開場白。

文本如下：
${longText}`;

    try {
        const completion = await openaiForChunking.chat.completions.create({
            model: targetModel,
            messages: [{ role: "user", content: chunkPrompt }],
            max_tokens: 2048, // 調整以適應可能的長文本分割需求
            temperature: 0.3, 
        });
        if (completion.choices && completion.choices.length > 0 && completion.choices[0].message.content) {
            const chunks = completion.choices[0].message.content.split("---CHUNK_SEPARATOR---")
                                .map(chunk => chunk.trim())
                                .filter(chunk => chunk.length > 50); // 過濾掉太短的片段 (例如少於50字符)
            console.log(`文本已成功分割成 ${chunks.length} 個片段。`);
            return chunks.length > 0 ? chunks : [longText]; // 如果沒有有效片段，返回原文
        }
        console.error(`${targetModel} 未能成功分割文本或返回空內容。`);
        return [longText]; 
    } catch (error) {
        console.error(`使用 ${targetModel} 分割文本時發生錯誤:`, error.message);
        return [longText]; 
    }
}

async function generateDetailedTextWithLLM(prompt, llmChoice = "qwen", modelForQwen = "Qwen/Qwen3-235B-A22B", modelForClaude = "claude-3-7-sonnet@20250219") {
    try {
        if (llmChoice === "qwen") {
            if (!qwenLlm) {
                console.error("Qwen LLM 未初始化 (API Key 可能缺失)。");
                return null;
            }
            console.log(`Calling Qwen3 (${modelForQwen} via SiliconFlow) with prompt (first 100 chars): ${prompt.substring(0,100)}...`);
            const completion = await qwenLlm.chat.completions.create({
                model: modelForQwen,
                messages: [
                    { role: "system", content: "你是一位資深的林業科學家和編輯，請根據提供的結構化數據，撰寫一段全面而詳細的樹種介紹文本。請深入思考各數據點之間的關聯，並提供有洞察力的分析。" },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1200, 
                temperature: 0.6,
                top_p: 0.95,
            });
            if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
                let content = completion.choices[0].message.content;
                console.log("Raw LLM Qwen3 output (first 300 chars):", content.substring(0,300));
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                return content;
            }
            console.error("Qwen3 LLM did not return expected choices structure.");
            return null;
        } else if (llmChoice === "claude") {
            if (!anthropic) {
                console.error("Claude LLM 未初始化 (API Key 可能缺失)。");
                return null;
            }
            console.log(`Calling Claude (${modelForClaude}) with prompt (first 100 chars): ${prompt.substring(0,100)}...`);
            const msg = await anthropic.messages.create({
                model: modelForClaude,
                max_tokens: 1200,
                system: "你是一位資深的林業科學家和編輯，請根據提供的結構化數據，撰寫一段全面而詳細的樹種介紹文本。請深入思考各數據點之間的關聯，並提供有洞察力的分析。",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
            });
            if (msg.content && msg.content.length > 0 && msg.content[0].text) {
                return msg.content[0].text;
            }
             console.error("Claude LLM did not return expected content structure.");
            return null;
        } else {
            console.error(`未知的 LLM 選擇: ${llmChoice}`);
            return null;
        }
    } catch (error) {
        console.error(`Error calling LLM (${llmChoice}):`, error.message);
        if (error.response && error.response.data) { 
            console.error("LLM API Error Details (OpenAI/SiliconFlow Style):", error.response.data);
        } else if (error.error && error.error.message) { 
            console.error("LLM API Error Details (Anthropic Style):", error.error.message);
        } else {
            console.error("LLM API Error Details (Unknown format):", error);
        }
        return null; 
    }
}

function formatBoolean(value) {
    if (value === null || typeof value === 'undefined') return '未知';
    return value == 1 ? '是' : '否';
}

async function processTreeCarbonData() {
    console.log('開始處理 tree_carbon_data 數據並生成知識庫條目 (使用LLM分塊，先刪後插策略)...');
    try {
        const result = await db.query('SELECT * FROM tree_carbon_data'); 
        const speciesData = result.rows;
        console.log(`從 tree_carbon_data 讀取到 ${speciesData.length} 條樹種記錄。`);

        // 防崩潰優化：逐一處理並強制休息
        for (let i = 0; i < speciesData.length; i++) {
            const species = speciesData[i];
            console.log(`\n[${i + 1}/${speciesData.length}] 開始處理樹種: ${species.common_name_zh}...`);
            
            // 1. 強制冷卻：每處理完一個樹種，休息 5 秒，讓 GC 回收記憶體
            if (i > 0) {
                 console.log('冷卻中 (Cooling down for 5s)...');
                 await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // 2. 記憶體管理：手動觸發 GC
            if (global.gc) {
                try { global.gc(); } catch (e) { console.log("GC unavailable"); }
            }

            let prompt = `請你扮演一位資深的林業科學家和編輯。根據以下提供的關於某一樹種的結構化數據，請撰寫一段全面而詳細的介紹文本 (約 400-600 字)。
這段文本將被用於一個知識庫，以輔助 AI 聊天機器人回答相關問題。請確保文本內容科學、準確、流暢，並將提供的數據點自然地融入到描述中，並進行適當的關聯性思考和擴展。

**樹種數據：**
*   中文常用名: ${species.common_name_zh || '未知'}
*   學名: ${species.scientific_name || '未知'}
*   木材密度範圍: ${species.wood_density_min !== null ? species.wood_density_min : 'N/A'} - ${species.wood_density_max !== null ? species.wood_density_max : 'N/A'} g/cm³
*   碳含量比例範圍: ${species.carbon_content_min !== null ? species.carbon_content_min : 'N/A'} - ${species.carbon_content_max !== null ? species.carbon_content_max : 'N/A'}
*   年胸徑生長範圍: ${species.dbh_growth_min !== null ? species.dbh_growth_min : 'N/A'} - ${species.dbh_growth_max !== null ? species.dbh_growth_max : 'N/A'} 公分/年
*   年高度生長範圍: ${species.height_growth_min !== null ? species.height_growth_min : 'N/A'} - ${species.height_growth_max !== null ? species.height_growth_max : 'N/A'} 公尺/年
*   預期壽命範圍: ${species.lifespan_min !== null ? species.lifespan_min : 'N/A'} - ${species.lifespan_max !== null ? species.lifespan_max : 'N/A'} 年
*   平均最大樹高範圍: ${species.max_height_min !== null ? species.max_height_min : 'N/A'} - ${species.max_height_max !== null ? species.max_height_max : 'N/A'} 公尺
*   平均最大胸徑範圍: ${species.max_dbh_min !== null ? species.max_dbh_min : 'N/A'} - ${species.max_dbh_max !== null ? species.max_dbh_max : 'N/A'} 公分
*   年碳吸收率範圍: ${species.carbon_absorption_min !== null ? species.carbon_absorption_min : 'N/A'} - ${species.carbon_absorption_max !== null ? species.carbon_absorption_max : 'N/A'} kgCO₂/株/年
*   每公頃純林年碳吸收量範圍: ${species.hectare_absorption_min !== null ? species.hectare_absorption_min : 'N/A'} - ${species.hectare_absorption_max !== null ? species.hectare_absorption_max : 'N/A'} 噸CO₂/公頃/年
*   碳吸收效率評級: ${species.carbon_efficiency || '未知'}
*   生長速率評級: ${species.growth_rate || '未知'}
*   適合生長的氣候條件: ${species.climate_conditions || '未提供'}
*   耐旱性: ${species.drought_tolerance || '未知'}
*   耐濕性: ${species.wet_tolerance || '未知'}
*   耐鹽性: ${species.salt_tolerance || '未知'}
*   抗污染能力: ${species.pollution_resistance || '未知'}
*   適合的土壤類型: ${species.soil_types || '未提供'}
*   理想植株間距範圍: ${species.ideal_spacing_min !== null ? species.ideal_spacing_min : 'N/A'} - ${species.ideal_spacing_max !== null ? species.ideal_spacing_max : 'N/A'} 公尺
*   最適宜的經營管理方式: ${species.management_approach || '未提供'}
*   提高碳吸收的特殊管理措施: ${species.carbon_enhancement || '未提供'}
*   最佳疏伐或修剪時機: ${species.pruning_time || '未提供'}
*   適合台灣北部: ${formatBoolean(species.north_taiwan)}
*   適合台灣中部: ${formatBoolean(species.central_taiwan)}
*   適合台灣南部: ${formatBoolean(species.south_taiwan)}
*   適合台灣東部: ${formatBoolean(species.east_taiwan)}
*   適合沿海地區: ${formatBoolean(species.coastal_area)}
*   適合山區: ${formatBoolean(species.mountain_area)}
*   適合都市地區: ${formatBoolean(species.urban_area)}
*   經濟價值評級: ${species.economic_value || '未知'}
*   生態價值評級: ${species.ecological_value || '未知'}
*   備註說明: ${species.notes || '無'}

**生成的介紹文本應至少包含以下幾個方面，並自然地使用上述數據：**
1.  **基本介紹與形態特徵**
2.  **生態習性與分佈**
3.  **碳匯能力與生長特性** (請深入解釋數據背後的意義和關聯性)
4.  **栽培管理與應用** (請提供具體建議)
5.  **生態與經濟價值總結** (請進行綜合評估)

請以專業且易於理解的方式組織這些信息，使其成為一段連貫的描述。如果某些數據為空或不適用，請在生成文本時自然地跳過或稍作說明，並嘗試從您的知識庫中補充相關的通用知識以使描述更完整。`;

            console.log(`為樹種 ${species.common_name_zh} (ID: ${species.id}) 生成描述文本 (by Qwen3)...`);
            let detailedText = await generateDetailedTextWithLLM(prompt, "qwen");

            if (!detailedText || detailedText.trim() === '') {
                console.error(`未能為樹種 ${species.common_name_zh} 生成長描述文本。跳過此樹種。`);
                continue;
            }
            
            console.log(`為樹種 ${species.common_name_zh} 的長文本進行分塊 (by gpt-4.1-mini)...`);
            let textChunks = await chunkTextWithLLM(detailedText, "gpt-4.1-mini");
            
            // 釋放原始長文本記憶體
            detailedText = null;

            // 在處理該樹種的新片段之前，先刪除所有舊的相關片段
            console.log(`正在刪除樹種 ${species.common_name_zh} (原始ID: ${species.id}) 的舊知識庫片段...`);
            const deleteResult = await db.query(
                'DELETE FROM tree_knowledge_embeddings_v2 WHERE internal_source_table_name = $1 AND internal_source_record_id = $2 AND source_type = $3',
                ['tree_carbon_data', species.id.toString(), 'INTERNAL_DB_TREE_CARBON']
            );
            console.log(`樹種 ${species.common_name_zh} (原始ID: ${species.id}) 的舊片段已刪除 ${deleteResult.rowCount || 0} 條。`);

            let validChunksProcessed = 0;
            for (let j = 0; j < textChunks.length; j++) {
                const chunk = textChunks[j];
                if (chunk.length < 30) { 
                    console.log(`片段 ${j+1} (樹種ID ${species.id}) 內容過短 ('${chunk}')，跳過。`);
                    continue;
                }

                console.log(`為樹種 ${species.common_name_zh} 的片段 ${j+1} 生成 Embedding...`);
                let embeddingVector = await getEmbedding(chunk.substring(0, 8191)); 
                
                if (!embeddingVector) {
                    console.warn('Embedding generation failed, skipping chunk.');
                    continue;
                }

                const knowledgeEntry = {
                    text_content: chunk,
                    summary_cn: chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''),
                    embedding: JSON.stringify(embeddingVector),
                    source_type: 'INTERNAL_DB_TREE_CARBON',
                    internal_source_table_name: 'tree_carbon_data',
                    internal_source_record_id: species.id.toString(), 
                    original_source_title: `樹種詳解: ${species.common_name_zh} - 片段 ${j + 1}/${textChunks.length}`,
                    original_source_author: 'AI模型綜合生成 (Qwen3 + GPT4.1-mini)',
                    original_source_publication_year: new Date().getFullYear().toString(),
                    keywords: `${species.common_name_zh},${species.scientific_name || ''},碳匯,樹種特性,片段${j+1}`.split(',').filter(k => k).join(','),
                    confidence_score: 4, 
                    last_verified_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
                };
                
                // 釋放 Embedding 記憶體
                embeddingVector = null;
                                
                // 因為前面已經刪除了該樹種的所有舊片段，這裡總是執行插入
                console.log(`插入樹種 ${species.common_name_zh} 的知識庫片段 ${j + 1} (Title: ${knowledgeEntry.original_source_title})`);
                
                // FIX: Make internal_source_record_id UNIQUE per chunk to satisfy unique constraint
                // The unique constraint is (source_type, internal_source_record_id)
                // Original ID "1" is used for multiple chunks, causing violation on 2nd chunk.
                const uniqueChunkId = `${species.id}_chunk_${j + 1}`;

                const insertQuery = `
                    INSERT INTO tree_knowledge_embeddings_v2 
                    (text_content, summary_cn, embedding, source_type, internal_source_table_name, 
                     internal_source_record_id, original_source_title, original_source_author, 
                     original_source_publication_year, keywords, confidence_score, last_verified_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `;
                
                await db.query(insertQuery, [
                    knowledgeEntry.text_content,
                    knowledgeEntry.summary_cn,
                    knowledgeEntry.embedding,
                    knowledgeEntry.source_type,
                    knowledgeEntry.internal_source_table_name,
                    uniqueChunkId, // Use the unique ID
                    knowledgeEntry.original_source_title,
                    knowledgeEntry.original_source_author,
                    knowledgeEntry.original_source_publication_year,
                    knowledgeEntry.keywords,
                    knowledgeEntry.confidence_score,
                    knowledgeEntry.last_verified_at
                ]);
                validChunksProcessed++;
                console.log(`已處理樹種 ${species.common_name_zh} 的片段 ${j + 1}`);
            }
            
            // 釋放片段陣列記憶體
            textChunks = null;
            
            console.log(`已完成處理樹種: ${species.common_name_zh}，共生成和處理 ${validChunksProcessed} 個有效片段。`);
        }
        console.log('所有 tree_carbon_data 記錄處理完成。');

    } catch (error) {
        console.error('處理 tree_carbon_data 時發生錯誤:', error);
    } finally {
        if (db.pool && typeof db.pool.end === 'function') {
            db.pool.end(err => { 
                if (err) console.error('關閉資料庫連接池時發生錯誤:', err);
                else console.log('資料庫連接池已關閉。');
            });
        }
    }
}

processTreeCarbonData(); 