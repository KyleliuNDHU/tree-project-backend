-- pending_tree_measurements.pg.sql
-- 待測量樹木資料表 - 用於兩階段測量工作流程
-- Stage 1: VLGEO2 測量樹木位置 (distance, azimuth, pitch)
-- Stage 2: AR 測量 DBH 胸徑

CREATE TABLE IF NOT EXISTS pending_tree_measurements (
    id SERIAL PRIMARY KEY,
    
    -- 批次資訊
    batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
    batch_name VARCHAR(255),
    
    -- 樹木基本資訊 (來自 VLGEO2)
    tree_id VARCHAR(50),
    tree_name VARCHAR(255),
    species_id VARCHAR(10) REFERENCES tree_species(id),
    species_name VARCHAR(255),
    
    -- 樹木位置 (計算後的絕對座標)
    x_coord DOUBLE PRECISION,
    y_coord DOUBLE PRECISION,
    
    -- 測量站位置 (從 VLGEO2 metadata 計算)
    station_x DOUBLE PRECISION,
    station_y DOUBLE PRECISION,
    
    -- VLGEO2 原始測量資料
    horizontal_distance DOUBLE PRECISION,
    azimuth DOUBLE PRECISION,
    pitch DOUBLE PRECISION,
    tree_height DOUBLE PRECISION,
    
    -- DBH 測量結果 (Stage 2 填入)
    dbh_cm DOUBLE PRECISION,
    measurement_method VARCHAR(50),
    measurement_confidence DOUBLE PRECISION,
    
    -- 狀態管理
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'error')),
    
    -- 額外資料
    tree_remark TEXT,
    survey_remark TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- 專案與區域關聯
    project_id INTEGER,
    area_id INTEGER,
    
    -- 時間戳記
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    measured_at TIMESTAMP WITH TIME ZONE,
    
    -- 創建者資訊
    created_by INTEGER REFERENCES users(id),
    measured_by INTEGER REFERENCES users(id)
);

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_pending_measurements_batch_id ON pending_tree_measurements(batch_id);
CREATE INDEX IF NOT EXISTS idx_pending_measurements_status ON pending_tree_measurements(status);
CREATE INDEX IF NOT EXISTS idx_pending_measurements_project_id ON pending_tree_measurements(project_id);
CREATE INDEX IF NOT EXISTS idx_pending_measurements_created_at ON pending_tree_measurements(created_at DESC);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_pending_measurements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_pending_measurements_updated_at ON pending_tree_measurements;
CREATE TRIGGER trigger_update_pending_measurements_updated_at
    BEFORE UPDATE ON pending_tree_measurements
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_measurements_updated_at();

-- 批次統計視圖
CREATE OR REPLACE VIEW pending_measurement_batches AS
SELECT 
    batch_id,
    batch_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
    COUNT(*) FILTER (WHERE status = 'skipped') as skipped_count,
    COUNT(*) FILTER (WHERE status = 'error') as error_count,
    MIN(created_at) as created_at,
    MAX(updated_at) as updated_at,
    project_id,
    area_id
FROM pending_tree_measurements
GROUP BY batch_id, batch_name, project_id, area_id;

COMMENT ON TABLE pending_tree_measurements IS '待測量樹木資料表 - 兩階段測量工作流程';
COMMENT ON COLUMN pending_tree_measurements.batch_id IS '批次識別碼';
COMMENT ON COLUMN pending_tree_measurements.station_x IS '測量站 X 座標 (從 VLGEO2 metadata 計算)';
COMMENT ON COLUMN pending_tree_measurements.station_y IS '測量站 Y 座標 (從 VLGEO2 metadata 計算)';
COMMENT ON COLUMN pending_tree_measurements.horizontal_distance IS 'VLGEO2 測量水平距離 (m)';
COMMENT ON COLUMN pending_tree_measurements.azimuth IS 'VLGEO2 測量方位角 (度)';
COMMENT ON COLUMN pending_tree_measurements.pitch IS 'VLGEO2 測量俯仰角 (度)';
COMMENT ON COLUMN pending_tree_measurements.dbh_cm IS 'AR 測量的胸徑 (cm)';
COMMENT ON COLUMN pending_tree_measurements.measurement_method IS 'DBH 測量方法 (ar_reference, manual, etc)';
