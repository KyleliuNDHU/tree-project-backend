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

        // 優化：分兩步查詢。
        // 第一步：只查詢 ID 和 Embedding，避免一次性加載大量文本導致內存溢出 (OOM)。
        const embeddingSql = `
            SELECT id, embedding, internal_source_record_id
            FROM tree_knowledge_embeddings_v2
        `;
        
        const { rows: embeddingEntries } = await db.query(embeddingSql); 

        if (!embeddingEntries || embeddingEntries.length === 0) {
            console.log('[KnowledgeService] 資料庫中沒有知識片段。');
            return [];
        }
        
        // 在內存中計算相似度 (僅保留 ID 和 分數)
        const scores = [];
        
        for (const entry of embeddingEntries) {
            let dbEmbedding;
            try {
                if (entry.embedding instanceof Buffer) {
                    dbEmbedding = JSON.parse(entry.embedding.toString());
                } else if (typeof entry.embedding === 'string') { 
                    dbEmbedding = JSON.parse(entry.embedding);
                } else if (Array.isArray(entry.embedding)) {
                    // 如果 pg driver 自動解析了 json
                    dbEmbedding = entry.embedding;
                } else {
                    continue; 
                }
            } catch (e) {
                // 靜默失敗個別錯誤，避免日誌爆炸
                continue;
            }

            if (!dbEmbedding || !Array.isArray(dbEmbedding)) {
                continue;
            }

            const similarity = cosineSimilarity(queryEmbedding, dbEmbedding);
            if (similarity >= similarityThreshold) {
                scores.push({
                    id: entry.id,
                    score: similarity,
                    internal_source_record_id: entry.internal_source_record_id
                });
            }
        }

        // 排序並取 Top N
        scores.sort((a, b) => b.score - a.score);
        const topScores = scores.slice(0, topN);

        if (topScores.length === 0) {
            console.log(`[KnowledgeService] 沒有找到相似度高於 ${similarityThreshold} 的片段。`);
            return [];
        }

        // 第二步：根據 ID 獲取詳細內容
        const topIds = topScores.map(s => s.id);
        const contentSql = `
            SELECT 
                id, text_content, summary_cn, source_type, 
                internal_source_table_name, internal_source_record_id,
                original_source_title, original_source_author,
                original_source_publication_year, original_source_url_or_doi,
                original_source_type_detailed, keywords, confidence_score,
                last_verified_at
            FROM tree_knowledge_embeddings_v2
            WHERE id IN (${topIds.join(',')})
        `;

        const { rows: details } = await db.query(contentSql);

        // 合併分數與詳細內容
        const finalResults = details.map(detail => {
            const scoreEntry = topScores.find(s => s.id === detail.id);
            return {
                ...detail,
                score: scoreEntry ? scoreEntry.score : 0
            };
        });

        // 再次排序確保順序正確 (因為 SQL IN 不保證順序)
        finalResults.sort((a, b) => b.score - a.score);

        console.log(`[KnowledgeService] 檢索到 ${finalResults.length} 個相關知識片段 (閾值: ${similarityThreshold}, TopN: ${topN})。`);
        if (finalResults.length > 0) {
            console.log('[KnowledgeService] 最終選取的片段 (部分資訊):');
            finalResults.forEach(p => console.log(`  - ID: ${p.id}, 原始source_id: ${p.internal_source_record_id}, 相似度: ${p.score.toFixed(4)}, 標題: ${(p.original_source_title || p.summary_cn || 'N/A').substring(0,30)}...`));
        }
        return finalResults;

    } catch (error) {
        console.error('[KnowledgeService] getSimilarPassages 過程中發生錯誤:', error);
        return [];
    }
}

module.exports = {
    getSimilarPassages,
    getEmbedding
}; 