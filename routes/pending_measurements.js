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
const db = require('../config/db');
const pool = db.pool;

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
      measurement_type VARCHAR(10),
      
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
      CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed', 'transferred'))
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

// 啟動時依序初始化資料表及執行 migrations
(async () => {
  await initTable();

  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'valid_status'
          AND table_name = 'pending_tree_measurements'
        ) THEN
          ALTER TABLE pending_tree_measurements DROP CONSTRAINT valid_status;
          ALTER TABLE pending_tree_measurements ADD CONSTRAINT valid_status
            CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed', 'transferred'));
        END IF;
      END $$;
    `);
  } catch (e) {
    console.warn('[pending-measurements] Constraint migration skipped:', e.message);
  }

  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pending_tree_measurements'
          AND column_name = 'measurement_type'
        ) THEN
          ALTER TABLE pending_tree_measurements ADD COLUMN measurement_type VARCHAR(10);
        END IF;
      END $$;
    `);
    console.log('[pending-measurements] measurement_type 欄位確認完成');
  } catch (e) {
    console.warn('[pending-measurements] measurement_type migration skipped:', e.message);
  }

  // Migration: instrument_dbh_cm + dbh_source columns
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pending_tree_measurements'
          AND column_name = 'instrument_dbh_cm'
        ) THEN
          ALTER TABLE pending_tree_measurements ADD COLUMN instrument_dbh_cm DOUBLE PRECISION;
          ALTER TABLE pending_tree_measurements ADD COLUMN dbh_source VARCHAR(30);
          COMMENT ON COLUMN pending_tree_measurements.instrument_dbh_cm IS 'VLGEO2 Remote Diameter 量測值 (cm)';
          COMMENT ON COLUMN pending_tree_measurements.dbh_source IS 'DBH 來源: remote_diameter, vision, manual';
        END IF;
      END $$;
    `);
    console.log('[pending-measurements] instrument_dbh_cm 欄位確認完成');
  } catch (e) {
    console.warn('[pending-measurements] instrument_dbh migration skipped:', e.message);
  }

  // [v19.0] Migration: 新增 VLGEO2 儀器參數欄位
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pending_tree_measurements'
          AND column_name = 'gps_hdop'
        ) THEN
          ALTER TABLE pending_tree_measurements ADD COLUMN gps_hdop DOUBLE PRECISION;
          ALTER TABLE pending_tree_measurements ADD COLUMN device_sn VARCHAR(50);
          ALTER TABLE pending_tree_measurements ADD COLUMN ref_height DOUBLE PRECISION;
          ALTER TABLE pending_tree_measurements ADD COLUMN utm_zone VARCHAR(10);
          ALTER TABLE pending_tree_measurements ADD COLUMN raw_data_snapshot JSONB;
          COMMENT ON COLUMN pending_tree_measurements.gps_hdop IS 'GPS HDOP 精度指標';
          COMMENT ON COLUMN pending_tree_measurements.device_sn IS '儀器序號 (SNR)';
          COMMENT ON COLUMN pending_tree_measurements.ref_height IS '儀器參考高度 REFH (m)';
          COMMENT ON COLUMN pending_tree_measurements.utm_zone IS 'UTM 帶區';
          COMMENT ON COLUMN pending_tree_measurements.raw_data_snapshot IS '完整原始數據快照 (JSON)';
        END IF;
      END $$;
    `);
    console.log('[pending-measurements] v19.0 儀器參數欄位確認完成');
  } catch (e) {
    console.warn('[pending-measurements] v19.0 migration skipped:', e.message);
  }
})();

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

  if (measurements.length > 500) {
    return res.status(400).json({ success: false, message: '批次上限 500 筆' });
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
          measurement_type, status, priority,
          instrument_dbh_cm, dbh_source,
          gps_hdop, device_sn, ref_height, utm_zone, raw_data_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
        m.measurement_type || null,
        m.status ?? 'pending',
        m.priority ?? 3,
        m.instrument_dbh_cm ?? null,
        m.dbh_source ?? null,
        m.gps_hdop ?? null,
        m.device_sn ?? null,
        m.ref_height ?? null,
        m.utm_zone ?? null,
        m.raw_data_snapshot ? JSON.stringify(m.raw_data_snapshot) : null
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
      error: '操作失敗，請稍後再試' 
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
      error: '操作失敗，請稍後再試' 
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
      error: '操作失敗，請稍後再試' 
    });
  }
});

/**
 * GET /api/pending-measurements/stats/overview
 * 獲取統計資訊（必須在 /:id 之前，否則 'stats' 會被當作 id）
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
        COUNT(*) FILTER (WHERE status = 'transferred') as transferred,
        COUNT(DISTINCT session_id) as total_sessions
      FROM pending_tree_measurements
    `);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('[pending-measurements] 獲取統計失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '獲取失敗',
      error: '操作失敗，請稍後再試' 
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
      error: '操作失敗，請稍後再試' 
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
  
  const allowedFields = [
    'status', 'measured_dbh_cm', 'measurement_confidence',
    'measurement_method', 'measurement_notes', 'completed_at',
    'assigned_to', 'species_name', 'measurement_type',
    'project_area', 'project_code', 'project_name'
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
      error: '操作失敗，請稍後再試' 
    });
  }
});

/**
 * 建構 survey_notes 字串，安全處理 null 值
 */
function buildSurveyNotes(p) {
  const parts = ['VLGEO2+Vision測量'];
  if (p.measurement_method) {
    parts.push(`方法: ${p.measurement_method}`);
  }
  if (p.measurement_confidence != null) {
    parts.push(`信心度: ${(p.measurement_confidence * 100).toFixed(0)}%`);
  }
  if (p.measurement_notes) {
    parts.push(p.measurement_notes);
  }
  return parts.join(' | ');
}

/**
 * POST /api/pending-measurements/transfer
 * 將已完成的測量轉移到 tree_survey 表
 * 
 * 修正：
 * - 生成 system_tree_id (NOT NULL) 和 project_tree_id
 * - 使用 advisory lock 確保 ID 不碰撞
 * - 使用 ?? 取代 || 避免 falsy 值被覆蓋 (例如 dbh=0)
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
    
    // 鎖定 ID 序列（與 create/batch controller 共用 key 1）
    await client.query('SELECT pg_advisory_xact_lock(1)');
    
    // 取得目前最大 system_tree_id
    const sysIdRes = await client.query(`
      SELECT MAX(CAST(regexp_replace(system_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
      FROM tree_survey 
      WHERE (system_tree_id ~ '^ST-[0-9]+$')
      AND (is_placeholder IS NULL OR is_placeholder = false)
    `);
    let nextSysId = (sysIdRes.rows[0].max_id ?? 0) + 1;
    
    // 快取各專案的 project_tree_id 最大值（避免重複查詢）
    const projectMaxIds = {};
    
    const transferredIds = [];
    const idMapping = []; // { pending_id, tree_survey_id, system_tree_id }
    
    for (const p of pendingResult.rows) {
      // 生成 system_tree_id
      const systemTreeId = `ST-${nextSysId}`;
      nextSysId++;
      
      // 生成 project_tree_id（按專案分開計數）
      const projCode = p.project_code ?? null;
      let projectTreeId;
      if (projCode) {
        if (!(projCode in projectMaxIds)) {
          const prjIdRes = await client.query(`
            SELECT MAX(CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
            FROM tree_survey 
            WHERE project_code = $1 
            AND (project_tree_id ~ '^PT-[0-9]+$' OR project_tree_id ~ '^[0-9]+$')
            AND project_tree_id != 'PT-0'
            AND (is_placeholder IS NULL OR is_placeholder = false)
          `, [projCode]);
          projectMaxIds[projCode] = (prjIdRes.rows[0].max_id ?? 0);
        }
        projectMaxIds[projCode]++;
        projectTreeId = `PT-${projectMaxIds[projCode]}`;
      } else {
        projectTreeId = `PT-${Date.now()}`;
      }
      
      // 嘗試查找 species_id
      let speciesId = null;
      if (p.species_name) {
        try {
          const speciesRes = await client.query(
            'SELECT id FROM tree_species WHERE name = $1 OR scientific_name = $1', 
            [p.species_name]
          );
          if (speciesRes.rows.length > 0) {
            speciesId = speciesRes.rows[0].id;
          }
        } catch (err) {
          console.warn(`[Transfer] Species lookup failed for ${p.species_name}:`, err.message);
        }
      }
      
      // 決定最終 DBH（?? 避免 0 被當成 falsy）
      const finalDbh = p.measured_dbh_cm ?? p.dbh_cm ?? 0;
      const finalStatus = p.measurement_notes ?? '良好';

      // 插入到 tree_survey（含必要的 system_tree_id, project_tree_id）
      const insertResult = await client.query(`
        INSERT INTO tree_survey (
          system_tree_id, project_tree_id,
          project_location, project_code, project_name,
          species_name, species_id, tree_height_m, dbh_cm,
          x_coord, y_coord,
          status, survey_notes, survey_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        systemTreeId,
        projectTreeId,
        p.project_area,
        projCode,
        p.project_name,
        p.species_name ?? '待辨識',
        speciesId,
        p.tree_height,
        finalDbh,
        p.tree_longitude,
        p.tree_latitude,
        finalStatus,
        buildSurveyNotes(p),
        p.completed_at ?? new Date()
      ]);
      
      transferredIds.push(insertResult.rows[0].id);
      idMapping.push({
        pending_id: p.id,
        tree_survey_id: insertResult.rows[0].id,
        system_tree_id: systemTreeId,
      });
      
      // 同時插入 tree_measurement_raw（保留儀器數據）
      try {
        await client.query(`
          INSERT INTO tree_measurement_raw (
            tree_id, instrument_type,
            horizontal_dist, slope_dist, vertical_angle, azimuth,
            raw_lat, raw_lon, altitude,
            gps_hdop, device_sn, ref_height, utm_zone, raw_data_snapshot,
            measured_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          insertResult.rows[0].id,
          'VLGEO2+Vision',
          p.horizontal_distance,
          p.slope_distance,
          p.pitch,
          p.azimuth,
          p.tree_latitude,
          p.tree_longitude,
          p.altitude,
          p.gps_hdop ?? null,
          p.device_sn ?? null,
          p.ref_height ?? null,
          p.utm_zone ?? null,
          p.raw_data_snapshot ? (typeof p.raw_data_snapshot === 'string' ? p.raw_data_snapshot : JSON.stringify(p.raw_data_snapshot)) : null,
          p.completed_at ?? new Date()
        ]);
      } catch (rawErr) {
        console.warn('[Transfer] tree_measurement_raw insert skipped:', rawErr.message);
      }

      // 遷移照片：將 tree_images 的 pending_measurement_id → tree_survey_id
      try {
        await client.query(`
          UPDATE tree_images 
          SET tree_survey_id = $1, pending_measurement_id = NULL
          WHERE pending_measurement_id = $2
        `, [insertResult.rows[0].id, p.id]);
      } catch (imgErr) {
        console.warn(`[Transfer] tree_images migration skipped for pending_id=${p.id}:`, imgErr.message);
      }
    }
    
    // 標記為已轉移
    await client.query(`
      UPDATE pending_tree_measurements 
      SET status = 'transferred'
      WHERE session_id = $1 AND status = 'completed'
    `, [session_id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `成功轉移 ${transferredIds.length} 筆記錄到 tree_survey`,
      transferred_tree_ids: transferredIds,
      id_mapping: idMapping
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[pending-measurements] 轉移失敗:', error);
    res.status(500).json({ 
      success: false, 
      message: '轉移失敗',
      error: '操作失敗，請稍後再試' 
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/pending-measurements/session/:sessionId/project
 * 批量更新整個 session 的專案資訊（單次 SQL，取代 N+1 逐筆 PATCH）
 */
router.patch('/session/:sessionId/project', async (req, res) => {
  const { sessionId } = req.params;
  const { project_area, project_code, project_name } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'session_id is required' });
  }
  if (!project_area) {
    return res.status(400).json({ success: false, message: 'project_area is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE pending_tree_measurements
       SET project_area = $1, project_code = $2, project_name = $3
       WHERE session_id = $4
       RETURNING id`,
      [project_area, project_code || null, project_name || null, sessionId]
    );

    res.json({
      success: true,
      updated: result.rowCount,
      message: `已更新 ${result.rowCount} 筆記錄的專案資訊`,
    });
  } catch (err) {
    console.error('[PendingMeasurements] Bulk update project error:', err);
    res.status(500).json({ success: false, message: err.message });
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
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到該批次的記錄',
        deleted_count: 0
      });
    }

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
      error: '操作失敗，請稍後再試' 
    });
  }
});

module.exports = router;
