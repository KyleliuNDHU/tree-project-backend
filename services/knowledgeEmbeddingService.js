const openai = require('./openaiService');
const db = require('../config/db'); // *** 已改為使用 pg 連接池 ***

// 將資料庫中 BLOB / TEXT 形式的 embedding 轉為數值陣列
function bufferToVector(buf) {
    try {
        // 可能是 JSON 字串或二進位 Buffer
        const str = buf.toString('utf8');
        return JSON.parse(str);
    } catch (e) {
        console.error('[knowledgeEmbeddingService] 解析 embedding 失敗:', e);
        return [];
    }
}

// 計算餘弦相似度
function cosineSimilarity(vecA, vecB) {
    if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 取得文字的 OpenAI embedding
async function getEmbedding(text) {
    const resp = await openai.embeddings.create({
        // alternative model: 'text-embedding-3-small' (original model)
        model: 'text-embedding-3-large',
        input: text
    });
    return resp.data[0].embedding;
}

/**
 * 依問題文字檢索最相似的知識片段
 * @param {string} queryText - 使用者問題
 * @param {number} topN - 回傳前 N 筆 (預設3)
 * @param {number} similarityThreshold - 相似度閾值 (預設0.50)
 * @returns {Promise<Array<{id:number, text_content:string, summary_cn:string, source_type:string, internal_source_table_name:string, internal_source_record_id:string, original_source_title:string, original_source_author:string, original_source_publication_year:string, original_source_url_or_doi:string, original_source_type_detailed:string, keywords:string, confidence_score:string, last_verified_at:string, score:number}>>}
 */
async function getSimilarPassages(queryText, topN = 5, similarityThreshold = 0.50) {
    if (!queryText || typeof queryText !== 'string') {
        console.error('[KnowledgeService] 錯誤：查詢文本無效。');
        return [];
    }
    console.log(`[KnowledgeService] 接收到查詢: "${queryText.substring(0, 50)}...", topN: ${topN}, threshold: ${similarityThreshold}`);

    try {
        const queryEmbeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-large",
            input: queryText,
        });

        if (!queryEmbeddingResponse || !queryEmbeddingResponse.data || queryEmbeddingResponse.data.length === 0) {
            console.error('[KnowledgeService] 錯誤：無法從 OpenAI API 獲取查詢文本的嵌入向量。');
            return [];
        }
        const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

        const sql = `
            SELECT 
                id, text_content, summary_cn, embedding, source_type, 
                internal_source_table_name, internal_source_record_id,
                original_source_title, original_source_author,
                original_source_publication_year, original_source_url_or_doi,
                original_source_type_detailed, keywords, confidence_score,
                last_verified_at
            FROM tree_knowledge_embeddings_v2
        `;
        
        const { rows: knowledgeEntries } = await db.query(sql); 

        if (!knowledgeEntries || knowledgeEntries.length === 0) {
            console.log('[KnowledgeService] 資料庫中沒有知識片段。');
            return [];
        }
        
        const passagesWithSimilarity = knowledgeEntries.map(entry => {
            let dbEmbedding;
            try {
                if (entry.embedding instanceof Buffer) {
                    dbEmbedding = JSON.parse(entry.embedding.toString());
                } else if (typeof entry.embedding === 'string') { 
                    dbEmbedding = JSON.parse(entry.embedding);
                } else {
                    return null; 
                }
            } catch (e) {
                console.error(`[KnowledgeService] 解析知識片段 (ID: ${entry.id}) 的 embedding 時發生錯誤:`, e);
                return null;
            }

            if (!dbEmbedding || !Array.isArray(dbEmbedding) || dbEmbedding.some(isNaN)) {
                return null;
            }

            const similarity = cosineSimilarity(queryEmbedding, dbEmbedding);
            return {
                id: entry.id,
                text_content: entry.text_content,
                summary_cn: entry.summary_cn,
                source_type: entry.source_type,
                internal_source_table_name: entry.internal_source_table_name,
                internal_source_record_id: entry.internal_source_record_id,
                original_source_title: entry.original_source_title,
                original_source_author: entry.original_source_author,
                original_source_publication_year: entry.original_source_publication_year,
                original_source_url_or_doi: entry.original_source_url_or_doi,
                original_source_type_detailed: entry.original_source_type_detailed,
                keywords: entry.keywords,
                confidence_score: entry.confidence_score,
                last_verified_at: entry.last_verified_at,
                score: similarity
            };
        }).filter(p => p !== null); 

        if (passagesWithSimilarity.length > 0) {
            console.log(`[KnowledgeService] 計算出的相似度分數 (未過濾，僅顯示 > 0.3):`);
            passagesWithSimilarity.forEach(p => {
                if (p.score > 0.3) { 
                    console.log(`  - ID: ${p.id}, 原始source_id: ${p.internal_source_record_id}, 標題: ${(p.original_source_title || p.summary_cn || 'N/A').substring(0,30)}, 相似度: ${p.score.toFixed(4)}`);
                }
            });
        }
        const filteredPassages = passagesWithSimilarity.filter(p => p.score >= similarityThreshold);
        filteredPassages.sort((a, b) => b.score - a.score);
        const topPassages = filteredPassages.slice(0, topN);

        console.log(`[KnowledgeService] 檢索到 ${topPassages.length} 個相關知識片段 (閾值: ${similarityThreshold}, TopN: ${topN})。`);
        if (topPassages.length > 0) {
            console.log('[KnowledgeService] 最終選取的片段 (部分資訊):');
            topPassages.forEach(p => console.log(`  - ID: ${p.id}, 原始source_id: ${p.internal_source_record_id}, 相似度: ${p.score.toFixed(4)}, 標題: ${(p.original_source_title || p.summary_cn || 'N/A').substring(0,30)}...`));
        }
        return topPassages;

    } catch (error) {
        console.error('[KnowledgeService] getSimilarPassages 過程中發生錯誤:', error);
        return [];
    }
}

module.exports = {
    getSimilarPassages,
    getEmbedding
}; 