require('dotenv').config({ path: '../.env' }); // 確保能載入 .env
const db = require('../config/database'); // db 現在包含 { query, pool }
const { getEmbedding } = require('../services/knowledgeEmbeddingService'); // 引入嵌入生成函數

async function processTreeSurveyData() {
    console.log('開始處理 tree_survey 數據並填充到知識庫 (優化版)...');

    try {
        // 使用 db.query 函數，它直接返回結果对象，包含 rows 屬性
        const result = await db.query('SELECT * FROM tree_survey'); 
        const rows = result.rows;

        if (!rows || typeof rows.length === 'undefined') {
             console.error('從資料庫讀取數據失敗，未返回有效的 rows 陣列。');
             console.log('收到的 rows 結構:', rows);
             // 確保在 finally 中關閉連接池
             return; 
        }

        console.log(`從 tree_survey 讀取到 ${rows.length} 條記錄。`);

        for (const row of rows) {
            let textContent = `關於樹木調查記錄 ID ${row.id} 的詳細資料：\n`;
            textContent += `此樹位於專案區位 \"${row.project_location || '未知區位'}\"（專案代碼: ${row.project_code || 'N/A'}，專案名稱: ${row.project_name || '未知專案'}）。\n`;
            textContent += `系統樹木編號為 \"${row.system_tree_id || '無'}\"，專案樹木編號是 \"${row.project_tree_id || '無'}\"。\n`;
            textContent += `樹種為 \"${row.species_name || '未知樹種'}\" (樹種編號: ${row.species_id || 'N/A'})。\n`;
            textContent += `地理座標 X=${row.x_coord || 'N/A'}, Y=${row.y_coord || 'N/A'}。\n`;
            textContent += `健康狀況評估為 \"${row.status || '未記錄'}\"。`;
            if (row.notes && row.notes.toLowerCase() !== '無' && row.notes.trim() !== '') textContent += ` 重要註記: \"${row.notes}\"。`;
            textContent += `\n`; // 換行
            if (row.tree_notes && row.tree_notes.toLowerCase() !== '無' && row.tree_notes.trim() !== '') textContent += `樹木本身備註: \"${row.tree_notes}\"。\n`;
            textContent += `主要測量數據：樹高約 ${row.tree_height_m || 0} 公尺，胸高直徑 (DBH) 約 ${row.dbh_cm || 0} 公分。\n`;
            if (row.survey_notes && row.survey_notes.toLowerCase() !== '無' && row.survey_notes.trim() !== '') textContent += `調查時的額外備註: \"${row.survey_notes}\"。\n`;
            
            let surveyTimeText = '調查時間未明確記錄。';
            try {
                if (row.survey_time) {
                     const surveyDate = new Date(row.survey_time);
                     if (!isNaN(surveyDate.getTime()) && surveyDate.getFullYear() > 1900) { // 增加年份檢查
                        surveyTimeText = `此記錄的調查時間為 ${surveyDate.getFullYear()}年${surveyDate.getMonth() + 1}月${surveyDate.getDate()}日。`;
                     } else {
                        surveyTimeText = `調查時間原始記錄為 \"${row.survey_time}\" (格式無法直接轉換或日期無效)。`;
                     }
                }
            } catch (e) {
                 surveyTimeText = `調查時間解析時發生錯誤 (原始記錄: \"${row.survey_time}\")。`;
            }
            textContent += surveyTimeText + "\n";
            textContent += `估算的碳匯效益：此樹木的碳儲存量約為 ${row.carbon_storage || 0} 公斤，推估的年碳吸存量為 ${row.carbon_sequestration_per_year || 0} 公斤/年。\n`;

            const keywordsArray = [
                `樹木ID:${row.id}`,
                row.project_location,
                row.project_name,
                row.species_name,
                row.system_tree_id ? `系統樹木:${row.system_tree_id}` : null,
                row.project_tree_id ? `專案樹木:${row.project_tree_id}` : null,
                row.status,
                "樹木調查數據"
            ].filter(k => k && k.toString().trim() !== '' && k.toString().toLowerCase() !== '無');

            const knowledgeEntry = {
                text_content: textContent,
                summary_cn: `樹木ID ${row.id} (${row.species_name || '未知'}) 於 \"${row.project_location || '未知'}\" 的詳細調查記錄。樹高 ${row.tree_height_m || 0}m, 胸徑 ${row.dbh_cm || 0}cm。`,
                // embedding: null, // Embedding generated later if needed
                source_type: 'INTERNAL_DB_TREE_SURVEY',
                internal_source_table_name: 'tree_survey',
                internal_source_record_id: row.id.toString(),
                original_source_title: `樹木調查記錄 - ID ${row.id} (${row.project_name || 'N/A'} - ${row.species_name || 'N/A'})`,
                original_source_author: '系統數據轉換',
                original_source_publication_year: (row.survey_time && !isNaN(new Date(row.survey_time).getFullYear()) && new Date(row.survey_time).getFullYear() > 1900) ? new Date(row.survey_time).getFullYear().toString() : null,
                keywords: keywordsArray.join(','),
                confidence_score: 5, 
                last_verified_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            };
            
            const existingResult = await db.query(
                'SELECT id, text_content FROM tree_knowledge_embeddings_v2 WHERE internal_source_table_name = $1 AND internal_source_record_id = $2 AND source_type = $3',
                [knowledgeEntry.internal_source_table_name, knowledgeEntry.internal_source_record_id, knowledgeEntry.source_type]
            );
            const existing = existingResult.rows;

            if (existing.length > 0) {
                // 檢查內容是否有變更
                if (existing[0].text_content === knowledgeEntry.text_content) {
                    console.log(`tree_survey ID: ${row.id} 內容未變更，跳過更新 (知識庫 ID: ${existing[0].id})`);
                    continue; // 跳過本次迴圈，不執行 Embedding 與 Update
                }

                console.log(`更新 tree_survey ID: ${row.id} 的知識庫記錄 (知識庫 ID: ${existing[0].id}) - 內容已變更，重新生成 Embedding...`);
                
                // 內容有變更，生成新的 Embedding
                const embeddingVector = await getEmbedding(textContent.substring(0, 8191));
                knowledgeEntry.embedding = JSON.stringify(embeddingVector);

                // 構建 UPDATE 查詢
                const updateQuery = `
                    UPDATE tree_knowledge_embeddings_v2 
                    SET text_content = $1, summary_cn = $2, embedding = $3, 
                        original_source_title = $4, original_source_author = $5, 
                        original_source_publication_year = $6, keywords = $7, 
                        confidence_score = $8, last_verified_at = $9 
                    WHERE id = $10
                `;
                await db.query(updateQuery, [
                    knowledgeEntry.text_content, knowledgeEntry.summary_cn, knowledgeEntry.embedding,
                    knowledgeEntry.original_source_title, knowledgeEntry.original_source_author,
                    knowledgeEntry.original_source_publication_year, knowledgeEntry.keywords,
                    knowledgeEntry.confidence_score, knowledgeEntry.last_verified_at,
                    existing[0].id
                ]);
            } else {
                console.log(`插入 tree_survey ID: ${row.id} 到知識庫 - 生成 Embedding...`);
                
                // 新記錄，生成 Embedding
                const embeddingVector = await getEmbedding(textContent.substring(0, 8191));
                knowledgeEntry.embedding = JSON.stringify(embeddingVector);

                // 構建 INSERT 查詢
                const insertQuery = `
                    INSERT INTO tree_knowledge_embeddings_v2 
                    (text_content, summary_cn, embedding, source_type, internal_source_table_name, 
                     internal_source_record_id, original_source_title, original_source_author, 
                     original_source_publication_year, keywords, confidence_score, last_verified_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `;
                await db.query(insertQuery, [
                    knowledgeEntry.text_content, knowledgeEntry.summary_cn, knowledgeEntry.embedding,
                    knowledgeEntry.source_type, knowledgeEntry.internal_source_table_name,
                    knowledgeEntry.internal_source_record_id, knowledgeEntry.original_source_title,
                    knowledgeEntry.original_source_author, knowledgeEntry.original_source_publication_year,
                    knowledgeEntry.keywords, knowledgeEntry.confidence_score, knowledgeEntry.last_verified_at
                ]);
            }
            console.log(`已處理 tree_survey ID: ${row.id} - ${row.樹種名稱}`);
        }
        console.log('所有 tree_survey 記錄處理完成。');

    } catch (error) {
        console.error('處理 tree_survey 數據時發生錯誤:', error);
    } finally {
        if (db.pool && typeof db.pool.end === 'function') {
            db.pool.end(err => { // 使用回調函數處理關閉錯誤
                if (err) {
                    console.error('關閉資料庫連接池時發生錯誤:', err);
                } else {
                    console.log('資料庫連接池已關閉。');
                }
            });
        } else {
            console.log('db.pool.end 不是一個函數，無法關閉連接池。');
        }
    }
}

processTreeSurveyData(); 