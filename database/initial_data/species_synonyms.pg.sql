-- =============================================
-- 樹種同義詞表 (Species Synonyms)
-- 用於統一不同量測員對同一樹種使用的不同名稱
-- =============================================

CREATE TABLE IF NOT EXISTS species_synonyms (
    id SERIAL PRIMARY KEY,
    canonical_species_id VARCHAR(10) NOT NULL REFERENCES tree_species(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,          -- 變體名稱（不同表達方式）
    scientific_name VARCHAR(150),                -- 對應學名（如有）
    source VARCHAR(30) DEFAULT 'auto',           -- 來源: auto(自動分析), manual(人工), gbif, plantnet
    confidence FLOAT DEFAULT 1.0,                -- 匹配信心度 (0-1)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(canonical_species_id, variant_name)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_species_synonyms_variant ON species_synonyms(variant_name);
CREATE INDEX IF NOT EXISTS idx_species_synonyms_canonical ON species_synonyms(canonical_species_id);

-- 註解
COMMENT ON TABLE species_synonyms IS '樹種同義詞/名稱變體對照表';
COMMENT ON COLUMN species_synonyms.canonical_species_id IS '標準樹種 ID（對應 tree_species.id）';
COMMENT ON COLUMN species_synonyms.variant_name IS '變體名稱（例如：台灣欒樹 vs 臺灣欒樹）';
COMMENT ON COLUMN species_synonyms.source IS '來源: auto=自動分析, manual=人工設定, gbif=GBIF API, plantnet=PlantNet API';
COMMENT ON COLUMN species_synonyms.confidence IS '匹配信心度 0~1';

-- Trigger for updated_at
CREATE TRIGGER trigger_species_synonyms_updated_at
BEFORE UPDATE ON species_synonyms
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- =============================================
-- 樹種合併紀錄表 (Species Merge Log)  
-- 記錄每次自動合併的操作，用於審計追蹤
-- =============================================

CREATE TABLE IF NOT EXISTS species_merge_log (
    id SERIAL PRIMARY KEY,
    merge_type VARCHAR(20) NOT NULL,             -- 'synonym_add', 'name_normalize', 'survey_update'
    source_name VARCHAR(100),                    -- 原始名稱
    target_species_id VARCHAR(10),               -- 目標樹種 ID
    target_species_name VARCHAR(100),            -- 目標樹種名稱
    affected_survey_count INTEGER DEFAULT 0,     -- 影響的調查記錄數
    details JSONB,                               -- 詳細資訊（JSON 格式）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_merge_log_type ON species_merge_log(merge_type);
CREATE INDEX IF NOT EXISTS idx_merge_log_created ON species_merge_log(created_at);

COMMENT ON TABLE species_merge_log IS '樹種名稱合併操作紀錄（審計追蹤）';


-- =============================================
-- 預設同義詞資料（常見台灣樹種名稱變體）
-- =============================================
INSERT INTO species_synonyms (canonical_species_id, variant_name, scientific_name, source, confidence) VALUES
-- 臺灣欒樹 常見變體
('0297', '台灣欒樹', 'Koelreuteria elegans subsp. formosana', 'manual', 1.0),
('0297', '臺灣巒樹', 'Koelreuteria elegans subsp. formosana', 'manual', 0.9),
('0297', '苦楝舅', NULL, 'manual', 0.8),
-- 小葉欖仁 常見變體
('0028', '細葉欖仁', 'Terminalia catappa', 'manual', 0.9),
('0028', '雨傘樹', NULL, 'manual', 0.8),
-- 榕樹 常見變體
('0268', '正榕', 'Ficus microcarpa', 'manual', 0.9),
('0268', '鳥榕', 'Ficus microcarpa', 'manual', 0.8),
-- 樟樹 常見變體
('0312', '香樟', 'Cinnamomum camphora', 'manual', 0.9),
('0312', '本樟', 'Cinnamomum camphora', 'manual', 0.8),
-- 茄苳 常見變體
('0161', '茄冬', 'Bischofia javanica', 'manual', 0.95),
('0161', '加冬', 'Bischofia javanica', 'manual', 0.8),
('0161', '重陽木', 'Bischofia javanica', 'manual', 0.7),
-- 菩提樹 常見變體
('0236', '菩提', 'Ficus religiosa', 'manual', 0.9),
-- 苦楝 常見變體
('0160', '苦苓', 'Melia azedarach', 'manual', 0.9),
('0160', '楝樹', 'Melia azedarach', 'manual', 0.8),
-- 鳳凰木 常見變體
('0306', '火焰木', 'Delonix regia', 'manual', 0.7),
-- 黑板樹 常見變體
('0256', '糖膠樹', 'Alstonia scholaris', 'manual', 0.8),
-- 大葉桃花心木 常見變體
('0016', '桃花心木', 'Swietenia macrophylla', 'manual', 0.85),
-- 大王椰子 常見變體
('0011', '王棕', 'Roystonea regia (Kunth) O.F. Cook', 'manual', 0.8),
('0011', '文筆樹', 'Roystonea regia (Kunth) O.F. Cook', 'manual', 0.7),
-- 楓香 常見變體
('0261', '楓樹', 'Liquidambar formosana', 'manual', 0.7),
('0261', '楓仔', 'Liquidambar formosana', 'manual', 0.8),
-- 大葉山欖 常見變體
('0013', '山欖', 'Palaquium formosanum', 'manual', 0.7),
-- 雞蛋花 / 緬梔
('0314', '緬梔花', 'Plumeria rubra', 'manual', 0.9),
('0152', '雞蛋花（鈍葉）', 'Plumeria obtusa', 'manual', 0.7),
-- 大葉羅漢松/羅漢松
('0381', '羅漢松', 'Podocarpus macrophyllus', 'manual', 0.9),
('0381', '大葉羅漢松', 'Podocarpus macrophyllus', 'manual', 1.0)
ON CONFLICT (canonical_species_id, variant_name) DO NOTHING;
