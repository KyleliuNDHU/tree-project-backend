-- 樹木影像資料表
-- 
-- 目的：儲存樹木相關的影像記錄，支援 V3 流程
-- 關聯：可連結到正式樹木資料 (tree_survey) 或待測量資料 (pending_tree_measurements)

CREATE TABLE IF NOT EXISTS tree_images (
    id SERIAL PRIMARY KEY,
    
    -- 關聯 ID (兩者擇一)
    tree_survey_id INTEGER REFERENCES tree_survey(id) ON DELETE CASCADE,
    pending_measurement_id INTEGER REFERENCES pending_tree_measurements(id) ON DELETE SET NULL,
    
    -- 影像類型
    image_type VARCHAR(50) NOT NULL, -- 'overview', 'trunk', 'leaf', 'fruit', 'flower', 'bark', 'damage', 'other'
    
    -- 儲存路徑
    image_path TEXT NOT NULL,        -- 完整 URL 或 相對路徑
    thumbnail_path TEXT,             -- 縮圖路徑 (可選)
    storage_type VARCHAR(20) DEFAULT 'local', -- 'local', 's3', 'url'
    
    -- 時間戳記
    captured_at TIMESTAMP,           -- 拍攝時間
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 上傳時間
    
    -- 元數據 (JSONB)
    -- 包含: gps (lat, lon, alt), device_info, camera_settings, etc.
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_tree_images_survey_id ON tree_images(tree_survey_id);
CREATE INDEX IF NOT EXISTS idx_tree_images_pending_id ON tree_images(pending_measurement_id);
CREATE INDEX IF NOT EXISTS idx_tree_images_type ON tree_images(image_type);

-- 觸發器：更新 updated_at
CREATE OR REPLACE FUNCTION update_tree_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tree_images_updated_at ON tree_images;
CREATE TRIGGER trigger_update_tree_images_updated_at
    BEFORE UPDATE ON tree_images
    FOR EACH ROW
    EXECUTE FUNCTION update_tree_images_updated_at();
