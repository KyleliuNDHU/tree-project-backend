/**
 * 待測量樹木 API 路由
 * 
 * 處理 VLGEO2 數據的暫存和第二階段 DBH 測量
 * 
 * 資料表：pending_tree_measurements
 * 功能：
 * 1. 批量創建待測量記錄
 * 2. 獲取測量批次列表
 * 3. 獲取待測量樹木列表
 * 4. 更新測量結果
 * 5. 轉移已完成數據到 tree_survey
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * 初始化資料表 (如果不存在)
 */
async function initTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS pending_tree_measurements (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(50) NOT NULL,
      original_record_id VARCHAR(50),
      
      -- 專案資訊
      project_area VARCHAR(255),
      project_code VARCHAR(50),
      project_name VARCHAR(255),
      
      -- 樹木基本資料
      species_name VARCHAR(100),
      tree_height DOUBLE PRECISION NOT NULL,
      dbh_cm DOUBLE PRECISION,
      
      -- 樹木位置
      tree_latitude DOUBLE PRECISION NOT NULL,
      tree_longitude DOUBLE PRECISION NOT NULL,
      
      -- 測站位置
      station_latitude DOUBLE PRECISION NOT NULL,
      station_longitude DOUBLE PRECISION NOT NULL,
      
      -- VLGEO2 測量數據
      horizontal_distance DOUBLE PRECISION NOT NULL,
      slope_distance DOUBLE PRECISION NOT NULL,
      azimuth DOUBLE PRECISION NOT NULL,
      pitch DOUBLE PRECISION NOT NULL,
      altitude DOUBLE PRECISION,
      
      -- 狀態資訊
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      assigned_to VARCHAR(100),
      priority INTEGER DEFAULT 3,
      
      -- AR 測量結果
      measured_dbh_cm DOUBLE PRECISION,
      measurement_confidence DOUBLE PRECISION,
      measurement_method VARCHAR(50),
      measurement_notes TEXT,
      
      -- 索引
      CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed'))
    );
    
    -- 創建索引
    CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_tree_measurements(session_id);
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_tree_measurements(status);
    CREATE INDEX IF NOT EXISTS idx_pending_location ON pending_tree_measurements(tree_latitude, tree_longitude);
  `;
  
  try {
    await pool.query(createTableSQL);
    console.log('[pending-measurements] 資料表初始化完成');
  } catch (error) {
    console.error('[pending-measurements] 資料表初始化失敗:', error);
  }
}

// 啟動時初始化資料表
initTable();

/**
 * POST /api/pending-measurements/batch
 * 批量創建待測量記錄
 */
router.post('/batch', async (req, res) => {
  const { measurements } = req.body;
  
  if (!measurements || !Array.isArray(measurements) || measurements.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: '請提供測量記錄陣列' 
    });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const insertedIds = [];
    
    for (const m of measurements) {
      const result = await client.query(`
        INSERT INTO pending_tree_measurements (
          session_id, original_record_id,
          project_area, project_code, project_name,
          species_name, tree_height, dbh_cm,
          tree_latitude, tree_longitude,
          station_latitude, station_longitude,
          horizontal_distance, slope_distance, azimuth, pitch, altitude,
          status, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING id
      `, [
        m.session_id,
        m.original_record_id,
        m.project_area,
        m.project_code,
        m.project_name,
        m.species_name,
        m.tree_height,
        m.dbh_cm,
        m.tree_latitude,
        m.tree_longitude,
        m.station_latitude,
        m.station_longitude,
        m.horizontal_distance,
        m.slope_distance,
        m.azimuth,
        m.pitch,
        m.altitude,
        m.status || 'pending',
        m.priority || 3
      ]);
      
      insertedIds.push(result.rows[0].id);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: `成功創建 ${insertedIds.length} 筆待測量記錄`,
      session_id: measurements[0].session_id,
      inserted_ids: insertedIds
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[pending-measurements] 批量創建失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '創建失敗',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/pending-measurements/sessions
 * 獲取所有測量批次
 */
router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        session_id,
        MIN(project_area) as project_area,
        MIN(project_code) as project_code,
        MIN(project_name) as project_name,
        MIN(created_at) as created_at,
        COUNT(*) as total_trees,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_trees,
        'system' as created_by
      FROM pending_tree_measurements
      GROUP BY session_id
      ORDER BY MIN(created_at) DESC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('[pending-measurements] 獲取批次失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '獲取失敗',
      error: error.message 
    });
  }
});

/**
 * GET /api/pending-measurements/trees
 * 獲取待測量樹木列表
 */
router.get('/trees', async (req, res) => {
  const { session_id, status } = req.query;
  
  try {
    let query = 'SELECT * FROM pending_tree_measurements WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (session_id) {
      query += ` AND session_id = $${paramIndex++}`;
      params.push(session_id);
    }
    
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    query += ' ORDER BY priority ASC, created_at ASC';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('[pending-measurements] 獲取樹木失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '獲取失敗',
      error: error.message 
    });
  }
});

/**
 * GET /api/pending-measurements/:id
 * 獲取單筆待測量記錄
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM pending_tree_measurements WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '記錄不存在' 
      });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('[pending-measurements] 獲取記錄失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '獲取失敗',
      error: error.message 
    });
  }
});

/**
 * PATCH /api/pending-measurements/:id
 * 更新測量結果
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // 允許更新的欄位
  const allowedFields = [
    'status', 'measured_dbh_cm', 'measurement_confidence',
    'measurement_method', 'measurement_notes', 'completed_at',
    'assigned_to', 'species_name'
  ];
  
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex++}`);
      values.push(updates[field]);
    }
  }
  
  if (setClauses.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: '沒有可更新的欄位' 
    });
  }
  
  values.push(id);
  
  try {
    const result = await pool.query(`
      UPDATE pending_tree_measurements 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '記錄不存在' 
      });
    }
    
    res.json({
      success: true,
      message: '更新成功',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('[pending-measurements] 更新失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '更新失敗',
      error: error.message 
    });
  }
});

/**
 * POST /api/pending-measurements/transfer
 * 將已完成的測量轉移到 tree_survey 表
 */
router.post('/transfer', async (req, res) => {
  const { session_id } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ 
      success: false, 
      message: '請提供 session_id' 
    });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 獲取已完成的記錄
    const pendingResult = await client.query(`
      SELECT * FROM pending_tree_measurements 
      WHERE session_id = $1 AND status = 'completed'
    `, [session_id]);
    
    if (pendingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: '沒有已完成的記錄可轉移' 
      });
    }
    
    const transferredIds = [];
    
    for (const p of pendingResult.rows) {
      // 插入到 tree_survey
      const insertResult = await client.query(`
        INSERT INTO tree_survey (
          project_location, project_code, project_name,
          species_name, tree_height_m, dbh_cm,
          x_coord, y_coord,
          survey_notes, survey_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        p.project_area,
        p.project_code,
        p.project_name,
        p.species_name || '待辨識',
        p.tree_height,
        p.measured_dbh_cm || p.dbh_cm,
        p.tree_longitude,  // x_coord = lon
        p.tree_latitude,   // y_coord = lat
        `VLGEO2+AR測量 | 方法: ${p.measurement_method} | 信心度: ${(p.measurement_confidence * 100).toFixed(0)}%`,
        p.completed_at || new Date()
      ]);
      
      transferredIds.push(insertResult.rows[0].id);
      
      // 同時插入 tree_measurement_raw (保留儀器數據)
      await client.query(`
        INSERT INTO tree_measurement_raw (
          tree_id, instrument_type,
          horizontal_dist, slope_dist, vertical_angle, azimuth,
          raw_lat, raw_lon, altitude,
          measured_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        insertResult.rows[0].id,
        'VLGEO2+AR',
        p.horizontal_distance,
        p.slope_distance,
        p.pitch,
        p.azimuth,
        p.tree_latitude,
        p.tree_longitude,
        p.altitude,
        p.completed_at || new Date()
      ]);
    }
    
    // 標記為已轉移 (或刪除)
    await client.query(`
      UPDATE pending_tree_measurements 
      SET status = 'transferred'
      WHERE session_id = $1 AND status = 'completed'
    `, [session_id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `成功轉移 ${transferredIds.length} 筆記錄到 tree_survey`,
      transferred_tree_ids: transferredIds
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[pending-measurements] 轉移失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '轉移失敗',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/pending-measurements/session/:sessionId
 * 刪除整個測量批次
 */
router.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM pending_tree_measurements WHERE session_id = $1 RETURNING id',
      [sessionId]
    );
    
    res.json({
      success: true,
      message: `已刪除 ${result.rows.length} 筆記錄`,
      deleted_count: result.rows.length
    });
    
  } catch (error) {
    console.error('[pending-measurements] 刪除失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '刪除失敗',
      error: error.message 
    });
  }
});

/**
 * GET /api/pending-measurements/stats
 * 獲取統計資訊
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(DISTINCT session_id) as total_sessions
      FROM pending_tree_measurements
    `);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('[pending-measurements] 獲取統計失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '獲取失敗',
      error: error.message 
    });
  }
});

module.exports = router;
