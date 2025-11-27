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

        // 優化：分批次讀取與計算，避免 OOM (Out of Memory)。
        // 由於 Render 免費實例只有 512MB RAM，無法一次性加載所有 Embedding。
        
        const BATCH_SIZE = 500; // 每次讀取 500 筆
        let offset = 0;
        let hasMore = true;
        
        // 維護一個全局的候選列表 (僅存 ID 和 Score)
        let allCandidates = [];

        console.log('[KnowledgeService] 開始分批檢索相似度...');

        while (hasMore) {
            const batchSql = `
                SELECT id, embedding, internal_source_record_id
                FROM tree_knowledge_embeddings_v2
                ORDER BY id
                LIMIT ${BATCH_SIZE} OFFSET ${offset}
            `;
            
            const { rows: batchEntries } = await db.query(batchSql);

            if (!batchEntries || batchEntries.length === 0) {
                hasMore = false;
                break;
            }

            // 在當前批次中計算相似度
            for (const entry of batchEntries) {
                let dbEmbedding;
                try {
                    if (entry.embedding instanceof Buffer) {
                        dbEmbedding = JSON.parse(entry.embedding.toString());
                    } else if (typeof entry.embedding === 'string') { 
                        dbEmbedding = JSON.parse(entry.embedding);
                    } else if (Array.isArray(entry.embedding)) {
                        dbEmbedding = entry.embedding;
                    } else {
                        continue; 
                    }
                } catch (e) {
                    continue;
                }

                if (!dbEmbedding || !Array.isArray(dbEmbedding)) {
                    continue;
                }

                const similarity = cosineSimilarity(queryEmbedding, dbEmbedding);
                if (similarity >= similarityThreshold) {
                    allCandidates.push({
                        id: entry.id,
                        score: similarity,
                        internal_source_record_id: entry.internal_source_record_id
                    });
                }
            }

            // 記憶體保護：如果候選名單太大，先進行一次修剪，只保留前 2 * TopN
            // 這能防止在大量匹配的情況下 allCandidates 撐爆記憶體
            if (allCandidates.length > topN * 50) {
                 allCandidates.sort((a, b) => b.score - a.score);
                 allCandidates = allCandidates.slice(0, topN * 20);
                 if (global.gc) { global.gc(); } // 提示 GC 回收 (如果有啟用 --expose-gc)
            }

            offset += BATCH_SIZE;
            
            // 簡單的進度日誌，避免刷屏
            if (offset % 2000 === 0) {
                 console.log(`[KnowledgeService] 已處理 ${offset} 筆記錄...`);
            }
        }

        // 最終排序並取 Top N
        allCandidates.sort((a, b) => b.score - a.score);
        const topScores = allCandidates.slice(0, topN);

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

        // 再次排序確保順序正確
        finalResults.sort((a, b) => b.score - a.score);

        console.log(`[KnowledgeService] 檢索完成。從 ${offset} 筆資料中找到 ${finalResults.length} 個相關片段。`);
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