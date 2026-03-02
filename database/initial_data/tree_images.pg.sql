-- 樹木影像資料表（2NF 正規化版本）
-- 
-- 目的：儲存樹木相關的影像記錄，支援 V3 流程
-- 關聯：以 owner_type + owner_id 多型關聯到 tree_survey 或 pending_tree_measurements
-- 儲存：Cloudinary 雲端儲存（業界標準，解決 Render ephemeral filesystem 問題）

CREATE TABLE IF NOT EXISTS tree_images (
    id SERIAL PRIMARY KEY,
    
    -- 2NF 多型關聯（取代原本兩個 nullable FK）
    owner_type VARCHAR(20) NOT NULL,   -- 'survey' | 'pending'
    owner_id   INTEGER     NOT NULL,   -- 對應 tree_survey.id 或 pending_tree_measurements.id
    
    -- 影像類型
    image_type VARCHAR(50) NOT NULL,   -- 'overview', 'trunk', 'leaf', 'fruit', 'flower', 'bark', 'damage', 'other'
    
    -- 雲端儲存路徑
    cloud_url       TEXT NOT NULL,     -- Cloudinary secure_url
    cloud_public_id VARCHAR(255),      -- Cloudinary public_id（用於刪除）
    thumbnail_url   TEXT,              -- Cloudinary 動態縮圖 URL
    storage_type    VARCHAR(20) DEFAULT 'cloudinary', -- 'cloudinary', 'local'(legacy)
    
    -- 時間戳記
    captured_at TIMESTAMP,             -- 拍攝時間
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 上傳時間
    
    -- 元數據 (JSONB)
    -- 包含: gps (lat, lon, alt), device_info, camera_settings, etc.
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_tree_images_owner ON tree_images(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_tree_images_type ON tree_images(image_type);
CREATE INDEX IF NOT EXISTS idx_tree_images_cloud_public_id ON tree_images(cloud_public_id);

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
