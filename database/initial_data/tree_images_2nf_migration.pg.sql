-- ============================================================
-- 樹木影像資料表 — 2NF 正規化遷移
-- ============================================================
--
-- 問題（原始結構違反 2NF）：
--   tree_survey_id    INTEGER REFERENCES tree_survey(id)       -- nullable FK
--   pending_measurement_id INTEGER REFERENCES pending_tree_measurements(id) -- nullable FK
--   → 兩個 nullable FK 只會擇一使用，造成冗余欄位、NULL 依賴
--
-- 解法：以 owner_type + owner_id 取代
--   owner_type VARCHAR(20) NOT NULL  -- 'survey' | 'pending'
--   owner_id   INTEGER     NOT NULL  -- 對應 tree_survey.id 或 pending_tree_measurements.id
--
-- 同時遷移雲端儲存欄位：
--   image_path     → cloud_url       （Cloudinary secure_url）
--   thumbnail_path → thumbnail_url   （Cloudinary 動態縮圖 URL）
--   新增 cloud_public_id             （Cloudinary public_id，用於刪除）
--   storage_type default 改為 'cloudinary'

-- ============================================================
-- Step 1: 新增 2NF 欄位
-- ============================================================
ALTER TABLE tree_images ADD COLUMN IF NOT EXISTS owner_type VARCHAR(20);
ALTER TABLE tree_images ADD COLUMN IF NOT EXISTS owner_id INTEGER;

-- ============================================================
-- Step 2: 遷移既有資料到新欄位
-- ============================================================
UPDATE tree_images
SET owner_type = 'survey', owner_id = tree_survey_id
WHERE tree_survey_id IS NOT NULL;

UPDATE tree_images
SET owner_type = 'pending', owner_id = pending_measurement_id
WHERE pending_measurement_id IS NOT NULL AND owner_type IS NULL;

-- 若兩欄都是 NULL（理論上不該，但保護性處理），標記為 pending + id=0
UPDATE tree_images
SET owner_type = 'unknown', owner_id = 0
WHERE owner_type IS NULL;

-- ============================================================
-- Step 3: 設定 NOT NULL 約束
-- ============================================================
ALTER TABLE tree_images ALTER COLUMN owner_type SET NOT NULL;
ALTER TABLE tree_images ALTER COLUMN owner_id SET NOT NULL;

-- ============================================================
-- Step 4: 新增雲端儲存欄位
-- ============================================================
ALTER TABLE tree_images ADD COLUMN IF NOT EXISTS cloud_url TEXT;
ALTER TABLE tree_images ADD COLUMN IF NOT EXISTS cloud_public_id VARCHAR(255);
ALTER TABLE tree_images ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 先把既有 image_path (本地路徑) 複製到 cloud_url（向下相容）
UPDATE tree_images
SET cloud_url = image_path
WHERE cloud_url IS NULL AND image_path IS NOT NULL;

-- ============================================================
-- Step 5: 移除舊欄位（⚠ 不可逆，確認資料遷移完成後執行）
-- ============================================================
ALTER TABLE tree_images DROP COLUMN IF EXISTS tree_survey_id;
ALTER TABLE tree_images DROP COLUMN IF EXISTS pending_measurement_id;
ALTER TABLE tree_images DROP COLUMN IF EXISTS image_path;
ALTER TABLE tree_images DROP COLUMN IF EXISTS thumbnail_path;

-- 更新 storage_type 預設值
ALTER TABLE tree_images ALTER COLUMN storage_type SET DEFAULT 'cloudinary';

-- ============================================================
-- Step 6: 建立新索引
-- ============================================================
DROP INDEX IF EXISTS idx_tree_images_survey_id;
DROP INDEX IF EXISTS idx_tree_images_pending_id;

CREATE INDEX IF NOT EXISTS idx_tree_images_owner ON tree_images(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_tree_images_cloud_public_id ON tree_images(cloud_public_id);

-- ============================================================
-- 最終結構（供參考）
-- ============================================================
-- CREATE TABLE tree_images (
--     id                SERIAL PRIMARY KEY,
--     owner_type        VARCHAR(20) NOT NULL,    -- 'survey' | 'pending'
--     owner_id          INTEGER     NOT NULL,    -- FK by convention
--     image_type        VARCHAR(50) NOT NULL,    -- 'overview','trunk','leaf'...
--     cloud_url         TEXT NOT NULL,            -- Cloudinary secure_url
--     cloud_public_id   VARCHAR(255),             -- for deletion
--     thumbnail_url     TEXT,                     -- Cloudinary dynamic thumbnail
--     storage_type      VARCHAR(20) DEFAULT 'cloudinary',
--     captured_at       TIMESTAMP,
--     uploaded_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     metadata          JSONB DEFAULT '{}',
--     created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
