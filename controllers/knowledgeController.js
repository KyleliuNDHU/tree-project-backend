/**
 * 樹木知識管理控制器
 * 負責樹木知識的添加、查詢和管理
 */

const { OpenAI } = require('openai');

// 初始化 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 生成嵌入向量的函數
async function getEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('獲取嵌入向量時發生錯誤:', err);
    return null;
  }
}

/**
 * 添加新的樹木知識
 */
exports.addKnowledge = async (req, res) => {
  try {
    const { source_type, source_id, summary_cn, summary_en } = req.body;
    
    // 參數檢查
    if (!source_type || !source_id || !summary_cn) {
      return res.status(400).json({
        success: false,
        message: '缺少必要參數: source_type, source_id, summary_cn'
      });
    }
    
    // 生成嵌入向量
    console.log('生成知識嵌入向量...');
    const embedding = await getEmbedding(summary_cn);
    
    if (!embedding) {
      return res.status(500).json({
        success: false,
        message: '生成嵌入向量失敗'
      });
    }
    
    // 將嵌入向量轉換為 JSON 字串
    const embeddingJson = JSON.stringify(embedding);
    
    // 插入新記錄到資料庫
    req.app.locals.db.query(
      `INSERT INTO tree_knowledge_embeddings 
       (source_type, source_id, summary_cn, summary_en, embedding, updated_at) 
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
       summary_cn = VALUES(summary_cn),
       summary_en = VALUES(summary_en),
       embedding = VALUES(embedding),
       updated_at = NOW()`,
      [source_type, source_id, summary_cn, summary_en || null, embeddingJson],
      (err, result) => {
        if (err) {
          console.error('新增樹木知識時發生錯誤:', err);
          return res.status(500).json({
            success: false,
            message: '新增樹木知識時發生錯誤',
            error: err.message
          });
        }
        
        res.status(201).json({
          success: true,
          message: '樹木知識已成功添加',
          data: {
            id: result.insertId,
            source_type,
            source_id,
            vectorSize: embedding.length
          }
        });
      }
    );
  } catch (error) {
    console.error('處理添加樹木知識請求時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '處理請求時發生錯誤',
      error: error.message
    });
  }
};

/**
 * 查詢樹木知識
 */
exports.getKnowledge = (req, res) => {
  try {
    // 查詢參數
    const { source_type, source_id, limit = 100 } = req.query;
    
    // 構建 SQL 查詢
    let sql = 'SELECT id, source_type, source_id, summary_cn, summary_en, updated_at FROM tree_knowledge_embeddings';
    const params = [];
    
    // 添加篩選條件
    if (source_type || source_id) {
      sql += ' WHERE';
      
      if (source_type) {
        sql += ' source_type = ?';
        params.push(source_type);
      }
      
      if (source_id) {
        if (source_type) sql += ' AND';
        sql += ' source_id = ?';
        params.push(source_id);
      }
    }
    
    // 添加排序和限制
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(parseInt(limit, 10));
    
    // 執行查詢
    req.app.locals.db.query(sql, params, (err, results) => {
      if (err) {
        console.error('查詢樹木知識時發生錯誤:', err);
        return res.status(500).json({
          success: false,
          message: '查詢樹木知識時發生錯誤',
          error: err.message
        });
      }
      
      res.json({
        success: true,
        data: results
      });
    });
  } catch (error) {
    console.error('處理查詢樹木知識請求時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '處理請求時發生錯誤',
      error: error.message
    });
  }
};

/**
 * 刪除樹木知識
 */
exports.deleteKnowledge = (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: '缺少必要參數: id'
      });
    }
    
    // 執行刪除
    req.app.locals.db.query(
      'DELETE FROM tree_knowledge_embeddings WHERE id = ?',
      [id],
      (err, result) => {
        if (err) {
          console.error('刪除樹木知識時發生錯誤:', err);
          return res.status(500).json({
            success: false,
            message: '刪除樹木知識時發生錯誤',
            error: err.message
          });
        }
        
        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            message: '找不到指定的樹木知識記錄'
          });
        }
        
        res.json({
          success: true,
          message: '樹木知識已成功刪除'
        });
      }
    );
  } catch (error) {
    console.error('處理刪除樹木知識請求時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '處理請求時發生錯誤',
      error: error.message
    });
  }
};

/**
 * 搜索相關樹木知識
 */
exports.searchKnowledge = async (req, res) => {
  try {
    const { query, limit = 5 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: '缺少必要參數: query'
      });
    }
    
    // 生成查詢的嵌入向量
    const queryEmbedding = await getEmbedding(query);
    
    if (!queryEmbedding) {
      return res.status(500).json({
        success: false,
        message: '生成查詢嵌入向量失敗'
      });
    }
    
    // 從資料庫獲取所有嵌入向量
    req.app.locals.db.query(
      'SELECT id, source_type, source_id, summary_cn, embedding FROM tree_knowledge_embeddings',
      [],
      (err, results) => {
        if (err) {
          console.error('獲取樹木知識嵌入向量時發生錯誤:', err);
          return res.status(500).json({
            success: false,
            message: '獲取樹木知識嵌入向量時發生錯誤',
            error: err.message
          });
        }
        
        // 計算相似度並排序
        const scoredResults = results.map(item => {
          try {
            // 將 MySQL BLOB/TEXT 轉為向量
            const embedding = JSON.parse(item.embedding.toString());
            
            // 計算餘弦相似度
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            
            for (let i = 0; i < queryEmbedding.length; i++) {
              dotProduct += queryEmbedding[i] * embedding[i];
              normA += queryEmbedding[i] * queryEmbedding[i];
              normB += embedding[i] * embedding[i];
            }
            
            const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            
            return {
              id: item.id,
              source_type: item.source_type,
              source_id: item.source_id,
              summary: item.summary_cn,
              similarity
            };
          } catch (e) {
            console.error('計算相似度時發生錯誤:', e);
            return {
              id: item.id,
              source_type: item.source_type,
              source_id: item.source_id,
              summary: item.summary_cn,
              similarity: 0
            };
          }
        }).sort((a, b) => b.similarity - a.similarity);
        
        // 返回前 N 個結果
        const limitedResults = scoredResults.slice(0, parseInt(limit, 10));
        
        res.json({
          success: true,
          query,
          data: limitedResults
        });
      }
    );
  } catch (error) {
    console.error('處理搜索樹木知識請求時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '處理請求時發生錯誤',
      error: error.message
    });
  }
};

/**
 * 初始化默認樹木知識
 */
exports.initializeDefaultKnowledge = async (req, res) => {
  try {
    const treeKnowledgeData = require('../data/tree_knowledge_data');
    let success = 0;
    let failed = 0;
    
    // 處理每一筆數據
    for (const item of treeKnowledgeData) {
      try {
        // 生成嵌入向量
        const embedding = await getEmbedding(item.summary_cn);
        
        if (!embedding) {
          console.log(`無法為項目 ${item.id} 生成嵌入向量，跳過`);
          failed++;
          continue;
        }
        
        // 將嵌入向量轉換為 JSON 字串
        const embeddingJson = JSON.stringify(embedding);
        
        // 插入或更新資料
        await new Promise((resolve, reject) => {
          req.app.locals.db.query(
            `INSERT INTO tree_knowledge_embeddings 
             (id, source_type, source_id, summary_cn, summary_en, embedding, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE 
             source_type = VALUES(source_type),
             summary_cn = VALUES(summary_cn),
             summary_en = VALUES(summary_en),
             embedding = VALUES(embedding),
             updated_at = NOW()`,
            [
              item.id,
              item.source_type,
              item.source_id,
              item.summary_cn,
              item.summary_en,
              embeddingJson
            ],
            (err) => {
              if (err) {
                console.error(`插入/更新項目 ${item.id} 時發生錯誤:`, err);
                reject(err);
              } else {
                success++;
                resolve();
              }
            }
          );
        });
        
        // 添加延遲以避免 API 限制
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`處理項目 ${item.id} 時發生錯誤:`, error);
        failed++;
      }
    }
    
    res.json({
      success: true,
      message: '默認樹木知識初始化完成',
      data: { total: treeKnowledgeData.length, success, failed }
    });
  } catch (error) {
    console.error('初始化默認樹木知識時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '初始化默認樹木知識時發生錯誤',
      error: error.message
    });
  }
}; 