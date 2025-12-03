-- ============================================================================
-- ML 訓練數據收集表格
-- ============================================================================
-- 用途：存儲前端 APP 收集的使用者修正數據，用於後續 ML 模型改善
-- 版本：V3 (17.0.0+)
-- ============================================================================

-- ML 訓練數據批次表
-- 每次前端同步上傳為一個批次
CREATE TABLE IF NOT EXISTS ml_training_batches (
    id SERIAL PRIMARY KEY,
    batch_id UUID NOT NULL UNIQUE,
    device_id VARCHAR(255) NOT NULL,           -- 設備識別碼
    app_version VARCHAR(50) NOT NULL,          -- APP 版本
    record_count INTEGER DEFAULT 0,            -- 記錄數量
    upload_status VARCHAR(20) DEFAULT 'pending', -- 上傳狀態
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,                    -- 處理完成時間
    
    CONSTRAINT chk_ml_batch_status CHECK (upload_status IN ('pending', 'processed', 'failed'))
);

-- ML 訓練數據記錄表
-- 存儲各類型的修正記錄
CREATE TABLE IF NOT EXISTS ml_training_records (
    id SERIAL PRIMARY KEY,
    batch_id UUID REFERENCES ml_training_batches(batch_id) ON DELETE CASCADE,
    
    -- 記錄類型
    record_type VARCHAR(50) NOT NULL,
    
    -- 關聯樹木 (可選)
    tree_id VARCHAR(255),
    
    -- 自動值 vs 使用者值
    auto_values JSONB,         -- ML/演算法產生的原始值
    user_values JSONB,         -- 使用者修正後的值
    difference JSONB,          -- 差異計算 (用於快速分析)
    
    -- 上下文資訊
    context JSONB,             -- 額外上下文 (如參照物類型、環境條件等)
    
    -- 關聯圖片路徑
    image_paths JSONB,         -- 相關圖片的路徑列表
    
    -- 時間戳
    recorded_at TIMESTAMP NOT NULL,  -- 原始記錄時間
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 記錄類型約束
    CONSTRAINT chk_ml_record_type CHECK (record_type IN (
        'arMeasurement',          -- AR DBH 測量修正
        'speciesIdentification',  -- 樹種辨識修正
        'carbonModification',     -- 碳儲量修正
        'coordinateCorrection',   -- 座標修正
        'heightEstimation',       -- 樹高估算修正
        'crownWidthEstimation'    -- 冠幅估算修正
    ))
);

-- ML 訓練圖片關聯表
-- 存儲與記錄關聯的圖片資訊
CREATE TABLE IF NOT EXISTS ml_training_images (
    id SERIAL PRIMARY KEY,
    record_id INTEGER REFERENCES ml_training_records(id) ON DELETE CASCADE,
    image_path VARCHAR(1000) NOT NULL,
    image_type VARCHAR(50),                -- trunk, full, dbh_measure, etc.
    file_size_bytes INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 索引
-- ============================================================================

-- 批次索引
CREATE INDEX IF NOT EXISTS idx_ml_batches_device ON ml_training_batches(device_id);
CREATE INDEX IF NOT EXISTS idx_ml_batches_status ON ml_training_batches(upload_status);
CREATE INDEX IF NOT EXISTS idx_ml_batches_created ON ml_training_batches(created_at);

-- 記錄索引
CREATE INDEX IF NOT EXISTS idx_ml_records_batch ON ml_training_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_ml_records_type ON ml_training_records(record_type);
CREATE INDEX IF NOT EXISTS idx_ml_records_tree ON ml_training_records(tree_id);
CREATE INDEX IF NOT EXISTS idx_ml_records_recorded ON ml_training_records(recorded_at);

-- JSONB 索引 (用於分析查詢)
CREATE INDEX IF NOT EXISTS idx_ml_records_auto_values ON ml_training_records USING GIN (auto_values);
CREATE INDEX IF NOT EXISTS idx_ml_records_user_values ON ml_training_records USING GIN (user_values);
CREATE INDEX IF NOT EXISTS idx_ml_records_context ON ml_training_records USING GIN (context);

-- 圖片索引
CREATE INDEX IF NOT EXISTS idx_ml_images_record ON ml_training_images(record_id);

-- ============================================================================
-- 輔助視圖
-- ============================================================================

-- 記錄類型統計視圖
CREATE OR REPLACE VIEW ml_training_summary AS
SELECT 
    record_type,
    COUNT(*) as total_records,
    COUNT(DISTINCT tree_id) as unique_trees,
    COUNT(DISTINCT b.device_id) as unique_devices,
    MIN(r.recorded_at) as first_record,
    MAX(r.recorded_at) as last_record
FROM ml_training_records r
JOIN ml_training_batches b ON r.batch_id = b.batch_id
GROUP BY record_type;

-- AR 測量修正分析視圖
CREATE OR REPLACE VIEW ml_ar_measurement_analysis AS
SELECT 
    r.id,
    r.tree_id,
    (r.auto_values->>'dbh_cm')::NUMERIC as auto_dbh,
    (r.user_values->>'dbh_cm')::NUMERIC as user_dbh,
    ABS((r.auto_values->>'dbh_cm')::NUMERIC - (r.user_values->>'dbh_cm')::NUMERIC) as dbh_difference,
    r.context->>'reference_object' as reference_object,
    r.context->>'confidence' as auto_confidence,
    r.recorded_at
FROM ml_training_records r
WHERE r.record_type = 'arMeasurement'
AND r.auto_values->>'dbh_cm' IS NOT NULL
AND r.user_values->>'dbh_cm' IS NOT NULL;

-- 樹種辨識準確率視圖
CREATE OR REPLACE VIEW ml_species_accuracy AS
SELECT 
    COUNT(*) as total_identifications,
    COUNT(CASE WHEN r.auto_values->>'species_id' = r.user_values->>'species_id' THEN 1 END) as correct_predictions,
    ROUND(
        COUNT(CASE WHEN r.auto_values->>'species_id' = r.user_values->>'species_id' THEN 1 END)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) as accuracy_percent
FROM ml_training_records r
WHERE r.record_type = 'speciesIdentification';

-- ============================================================================
-- 註解
-- ============================================================================

COMMENT ON TABLE ml_training_batches IS 'ML 訓練數據批次，每次前端同步為一個批次';
COMMENT ON TABLE ml_training_records IS 'ML 訓練數據記錄，存儲各類型的使用者修正';
COMMENT ON TABLE ml_training_images IS 'ML 訓練關聯圖片，與記錄關聯的參考圖片';

COMMENT ON COLUMN ml_training_records.auto_values IS '自動產生的值 (ML/演算法)';
COMMENT ON COLUMN ml_training_records.user_values IS '使用者修正後的值';
COMMENT ON COLUMN ml_training_records.difference IS '差異計算結果，用於快速統計分析';
COMMENT ON COLUMN ml_training_records.context IS '上下文資訊，如參照物、環境條件等';
