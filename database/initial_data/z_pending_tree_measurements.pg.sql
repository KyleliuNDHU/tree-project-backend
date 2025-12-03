-- pending_tree_measurements.pg.sql
-- 待測量樹木資料表 - 用於兩階段測量工作流程
-- Stage 1: VLGEO2 測量樹木位置 (distance, azimuth, pitch)
-- Stage 2: AR 測量 DBH 胸徑
-- 注意: 此結構需與 routes/pending_measurements.js 中的 initTable() 保持一致

-- 先刪除現有表格（如存在）
DROP TABLE IF EXISTS pending_tree_measurements CASCADE;

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
    
    -- 狀態檢查約束
    CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed'))
);

-- 索引優化 (與 routes/pending_measurements.js 一致)
CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_tree_measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_tree_measurements(status);
CREATE INDEX IF NOT EXISTS idx_pending_location ON pending_tree_measurements(tree_latitude, tree_longitude);

COMMENT ON TABLE pending_tree_measurements IS '待測量樹木資料表 - 兩階段測量工作流程 (VLGEO2 → AR DBH)';
COMMENT ON COLUMN pending_tree_measurements.session_id IS '測量會話識別碼';
COMMENT ON COLUMN pending_tree_measurements.horizontal_distance IS 'VLGEO2 測量水平距離 (m)';
COMMENT ON COLUMN pending_tree_measurements.slope_distance IS 'VLGEO2 測量斜距 (m)';
COMMENT ON COLUMN pending_tree_measurements.azimuth IS 'VLGEO2 測量方位角 (度)';
COMMENT ON COLUMN pending_tree_measurements.pitch IS 'VLGEO2 測量俯仰角 (度)';
COMMENT ON COLUMN pending_tree_measurements.measured_dbh_cm IS 'AR 測量的胸徑 (cm)';
COMMENT ON COLUMN pending_tree_measurements.measurement_method IS 'DBH 測量方法 (ar_reference, manual, etc)';
