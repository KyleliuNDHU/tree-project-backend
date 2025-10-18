/**
 * 樹木知識管理控制器
 * 負責樹木知識的添加、查詢和管理
 */

const db = require('../config/db');
const { getEmbedding, getSimilarPassages } = require('../services/knowledgeEmbeddingService');


/**
 * 添加新的樹木知識
 */
exports.addKnowledge = async (req, res) => {
  try {
    const { 
        source_type, 
        internal_source_record_id, 
        text_content, 
        summary_cn,
        original_source_title,
        original_source_author,
        original_source_publication_year,
        original_source_url_or_doi,
        original_source_type_detailed,
        keywords,
        confidence_score
    } = req.body;
    
    const contentToEmbed = text_content || summary_cn;
    if (!source_type || !internal_source_record_id || !contentToEmbed) {
      return res.status(400).json({ success: false, message: '缺少必要參數: source_type, internal_source_record_id, and text_content/summary_cn' });
    }
    
    const embedding = await getEmbedding(contentToEmbed);
    if (!embedding) {
      return res.status(500).json({ success: false, message: '生成嵌入向量失敗' });
    }
    const embeddingJson = JSON.stringify(embedding);
    
    const insertQuery = `
      INSERT INTO tree_knowledge_embeddings_v2 
      (source_type, internal_source_record_id, text_content, summary_cn, embedding, updated_at,
       original_source_title, original_source_author, original_source_publication_year,
       original_source_url_or_doi, original_source_type_detailed, keywords, confidence_score) 
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (source_type, internal_source_record_id) 
      DO UPDATE SET 
        text_content = EXCLUDED.text_content,
        summary_cn = EXCLUDED.summary_cn,
        embedding = EXCLUDED.embedding,
        updated_at = NOW(),
        original_source_title = EXCLUDED.original_source_title,
        original_source_author = EXCLUDED.original_source_author,
        original_source_publication_year = EXCLUDED.original_source_publication_year,
        original_source_url_or_doi = EXCLUDED.original_source_url_or_doi,
        original_source_type_detailed = EXCLUDED.original_source_type_detailed,
        keywords = EXCLUDED.keywords,
        confidence_score = EXCLUDED.confidence_score
      RETURNING id;
    `;
    
    const { rows } = await db.query(insertQuery, [
        source_type, internal_source_record_id, text_content, summary_cn, embeddingJson,
        original_source_title, original_source_author, original_source_publication_year,
        original_source_url_or_doi, original_source_type_detailed, keywords, confidence_score
    ]);

    res.status(201).json({
      success: true,
      message: '樹木知識已成功添加/更新',
      data: { id: rows[0].id }
    });
  } catch (error) {
    console.error('處理添加樹木知識請求時發生錯誤:', error);
    res.status(500).json({ success: false, message: '處理請求時發生錯誤', error: error.message });
  }
};

/**
 * 查詢樹木知識
 */
exports.getKnowledge = async (req, res) => {
  try {
    const { source_type, source_id, limit = 100 } = req.query;
    
    let sql = 'SELECT id, source_type, internal_source_record_id, text_content, summary_cn, updated_at FROM tree_knowledge_embeddings_v2';
    const params = [];
    let paramIndex = 1;
    
    if (source_type || source_id) {
      sql += ' WHERE';
      if (source_type) {
        sql += ` source_type = $${paramIndex++}`;
        params.push(source_type);
      }
      if (source_id) {
        if (source_type) sql += ' AND';
        sql += ` internal_source_record_id = $${paramIndex++}`;
        params.push(source_id);
      }
    }
    
    sql += ` ORDER BY id DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit, 10));
    
    const { rows } = await db.query(sql, params);
      
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('處理查詢樹木知識請求時發生錯誤:', error);
    res.status(500).json({ success: false, message: '處理請求時發生錯誤', error: error.message });
  }
};

/**
 * 刪除樹木知識
 */
exports.deleteKnowledge = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ success: false, message: '缺少必要參數: id' });
    }
    
    const { rowCount } = await db.query('DELETE FROM tree_knowledge_embeddings_v2 WHERE id = $1', [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: '找不到指定的樹木知識記錄' });
    }
    
    res.json({ success: true, message: '樹木知識已成功刪除' });
  } catch (error) {
    console.error('處理刪除樹木知識請求時發生錯誤:', error);
    res.status(500).json({ success: false, message: '處理請求時發生錯誤', error: error.message });
  }
};

/**
 * 搜索相關樹木知識
 */
exports.searchKnowledge = async (req, res) => {
    try {
        const { query, limit = 5 } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, message: '缺少必要參數: query' });
        }
        
        const results = await getSimilarPassages(query, parseInt(limit, 10));
        res.json({ success: true, query, data: results });

    } catch (error) {
        console.error('處理搜索樹木知識請求時發生錯誤:', error);
        res.status(500).json({ success: false, message: '處理請求時發生錯誤', error: error.message });
    }
};

/**
 * 初始化默認樹木知識
 */
exports.initializeDefaultKnowledge = async (req, res) => {
    const treeKnowledgeData = require('../data/tree_knowledge_data');
    let success = 0;
    let failed = 0;
    
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        
        const insertQuery = `
          INSERT INTO tree_knowledge_embeddings_v2
          (id, source_type, internal_source_record_id, text_content, summary_cn, embedding, updated_at, 
           original_source_title, original_source_author, original_source_publication_year, 
           original_source_url_or_doi, original_source_type_detailed, keywords, confidence_score) 
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) 
          DO UPDATE SET 
            source_type = EXCLUDED.source_type,
            internal_source_record_id = EXCLUDED.internal_source_record_id,
            text_content = EXCLUDED.text_content,
            summary_cn = EXCLUDED.summary_cn,
            embedding = EXCLUDED.embedding,
            updated_at = NOW(),
            original_source_title = EXCLUDED.original_source_title,
            original_source_author = EXCLUDED.original_source_author,
            original_source_publication_year = EXCLUDED.original_source_publication_year,
            original_source_url_or_doi = EXCLUDED.original_source_url_or_doi,
            original_source_type_detailed = EXCLUDED.original_source_type_detailed,
            keywords = EXCLUDED.keywords,
            confidence_score = EXCLUDED.confidence_score
            `;

        for (const item of treeKnowledgeData) {
          try {
            const contentToEmbed = item.text_content || item.summary_cn;
            if (!contentToEmbed) {
                failed++;
                continue;
            }
            const embedding = await getEmbedding(contentToEmbed);
            if (!embedding) {
              failed++;
              continue;
            }
            const embeddingJson = JSON.stringify(embedding);
            
            await client.query(insertQuery, [
              item.id,
              item.source_type,
              item.source_id, // 假設 data/tree_knowledge_data.js 中的 source_id 對應 internal_source_record_id
              item.text_content,
              item.summary_cn,
              embeddingJson,
              item.original_source_title,
              item.original_source_author,
              item.original_source_publication_year,
              item.original_source_url_or_doi,
              item.original_source_type_detailed,
              item.keywords,
              item.confidence_score
            ]);
            success++;
            await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
          } catch (error) {
            console.error(`處理項目 ${item.id} 時發生錯誤:`, error);
            failed++;
          }
        }
        
        await client.query('COMMIT');
        res.json({ success: true, message: '默認樹木知識初始化完成', data: { total: treeKnowledgeData.length, success, failed } });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('初始化默認樹木知識時發生錯誤:', error);
        res.status(500).json({ success: false, message: '初始化默認樹木知識時發生錯誤', error: error.message });
    } finally {
        client.release();
    }
}; 