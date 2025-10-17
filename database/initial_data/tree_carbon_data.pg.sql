-- Drop existing objects to ensure a clean run
DROP TRIGGER IF EXISTS trigger_tree_carbon_data_updated_at ON tree_carbon_data;
DROP FUNCTION IF EXISTS update_updated_at_column;
DROP TABLE IF EXISTS tree_carbon_data;
DROP TYPE IF EXISTS efficiency_level;
DROP TYPE IF EXISTS growth_rate_level;
DROP TYPE IF EXISTS tolerance_level;
DROP TYPE IF EXISTS resistance_level;
DROP TYPE IF EXISTS value_level;

-- Create custom ENUM types for PostgreSQL
CREATE TYPE efficiency_level AS ENUM ('極高','高','中高','中等','中低','低');
CREATE TYPE growth_rate_level AS ENUM ('極快','快','中快','中等','中慢','慢');
CREATE TYPE tolerance_level AS ENUM ('極高','高','中高','中等','中低','低');
CREATE TYPE resistance_level AS ENUM ('極強','強','中強','中等','中低','低');
CREATE TYPE value_level AS ENUM ('極高','高','中高','中等','中低','低');

--
-- 資料表結構 `tree_carbon_data` for PostgreSQL
--
CREATE TABLE tree_carbon_data (
  id SERIAL PRIMARY KEY,
  common_name_zh VARCHAR(50) NOT NULL UNIQUE,
  common_name_en VARCHAR(100),
  scientific_name VARCHAR(100),
  wood_density_min DECIMAL(4,2),
  wood_density_max DECIMAL(4,2),
  carbon_content_min DECIMAL(4,2),
  carbon_content_max DECIMAL(4,2),
  conversion_factor_min DECIMAL(5,3),
  conversion_factor_max DECIMAL(5,3),
  dbh_growth_min DECIMAL(4,1),
  dbh_growth_max DECIMAL(4,1),
  height_growth_min DECIMAL(4,1),
  height_growth_max DECIMAL(4,1),
  lifespan_min INT,
  lifespan_max INT,
  max_height_min INT,
  max_height_max INT,
  max_dbh_min INT,
  max_dbh_max INT,
  carbon_absorption_min INT,
  carbon_absorption_max INT,
  hectare_absorption_min INT,
  hectare_absorption_max INT,
  carbon_efficiency efficiency_level,
  growth_rate growth_rate_level,
  climate_conditions TEXT,
  drought_tolerance tolerance_level,
  wet_tolerance tolerance_level,
  salt_tolerance tolerance_level,
  pollution_resistance resistance_level,
  soil_types TEXT,
  ideal_spacing_min DECIMAL(3,1),
  ideal_spacing_max DECIMAL(3,1),
  management_approach TEXT,
  carbon_enhancement TEXT,
  pruning_time VARCHAR(100),
  north_taiwan BOOLEAN DEFAULT FALSE,
  central_taiwan BOOLEAN DEFAULT FALSE,
  south_taiwan BOOLEAN DEFAULT FALSE,
  east_taiwan BOOLEAN DEFAULT FALSE,
  coastal_area BOOLEAN DEFAULT FALSE,
  mountain_area BOOLEAN DEFAULT FALSE,
  urban_area BOOLEAN DEFAULT FALSE,
  economic_value value_level,
  ecological_value value_level,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_scientific_name ON tree_carbon_data (scientific_name);
CREATE INDEX idx_carbon_efficiency ON tree_carbon_data (carbon_efficiency);

-- Add comments
COMMENT ON TABLE tree_carbon_data IS '樹種碳匯能力資料表';
COMMENT ON COLUMN tree_carbon_data.common_name_zh IS '中文常用名';
COMMENT ON COLUMN tree_carbon_data.common_name_en IS '英文常用名';
COMMENT ON COLUMN tree_carbon_data.scientific_name IS '學名';
COMMENT ON COLUMN tree_carbon_data.wood_density_min IS '木材密度最小值(g/cm³)';
COMMENT ON COLUMN tree_carbon_data.wood_density_max IS '木材密度最大值(g/cm³)';
COMMENT ON COLUMN tree_carbon_data.carbon_content_min IS '碳含量比例最小值';
COMMENT ON COLUMN tree_carbon_data.carbon_content_max IS '碳含量比例最大值';
COMMENT ON COLUMN tree_carbon_data.conversion_factor_min IS '轉換係數最小值(kgC/m³)';
COMMENT ON COLUMN tree_carbon_data.conversion_factor_max IS '轉換係數最大值(kgC/m³)';
COMMENT ON COLUMN tree_carbon_data.dbh_growth_min IS '年胸徑生長最小值(公分/年)';
COMMENT ON COLUMN tree_carbon_data.dbh_growth_max IS '年胸徑生長最大值(公分/年)';
COMMENT ON COLUMN tree_carbon_data.height_growth_min IS '年高度生長最小值(公尺/年)';
COMMENT ON COLUMN tree_carbon_data.height_growth_max IS '年高度生長最大值(公尺/年)';
COMMENT ON COLUMN tree_carbon_data.lifespan_min IS '預期壽命最小值(年)';
COMMENT ON COLUMN tree_carbon_data.lifespan_max IS '預期壽命最大值(年)';
COMMENT ON COLUMN tree_carbon_data.max_height_min IS '平均最大樹高最小值(公尺)';
COMMENT ON COLUMN tree_carbon_data.max_height_max IS '平均最大樹高最大值(公尺)';
COMMENT ON COLUMN tree_carbon_data.max_dbh_min IS '平均最大胸徑最小值(公分)';
COMMENT ON COLUMN tree_carbon_data.max_dbh_max IS '平均最大胸徑最大值(公分)';
COMMENT ON COLUMN tree_carbon_data.carbon_absorption_min IS '年碳吸收率最小值(kgCO₂/株/年)';
COMMENT ON COLUMN tree_carbon_data.carbon_absorption_max IS '年碳吸收率最大值(kgCO₂/株/年)';
COMMENT ON COLUMN tree_carbon_data.hectare_absorption_min IS '每公頃純林年碳吸收量最小值(噸CO₂/公頃/年)';
COMMENT ON COLUMN tree_carbon_data.hectare_absorption_max IS '每公頃純林年碳吸收量最大值(噸CO₂/公頃/年)';
COMMENT ON COLUMN tree_carbon_data.carbon_efficiency IS '碳吸收效率';
COMMENT ON COLUMN tree_carbon_data.growth_rate IS '生長速率分類';
COMMENT ON COLUMN tree_carbon_data.climate_conditions IS '適合生長的氣候條件';
COMMENT ON COLUMN tree_carbon_data.drought_tolerance IS '耐旱性';
COMMENT ON COLUMN tree_carbon_data.wet_tolerance IS '耐溼性';
COMMENT ON COLUMN tree_carbon_data.salt_tolerance IS '耐鹽性';
COMMENT ON COLUMN tree_carbon_data.pollution_resistance IS '抗污染能力';
COMMENT ON COLUMN tree_carbon_data.soil_types IS '適合的土壤類型';
COMMENT ON COLUMN tree_carbon_data.ideal_spacing_min IS '理想植株間距最小值(公尺)';
COMMENT ON COLUMN tree_carbon_data.ideal_spacing_max IS '理想植株間距最大值(公尺)';
COMMENT ON COLUMN tree_carbon_data.management_approach IS '最適宜的經營管理方式';
COMMENT ON COLUMN tree_carbon_data.carbon_enhancement IS '提高碳吸收的特殊管理措施';
COMMENT ON COLUMN tree_carbon_data.pruning_time IS '最佳疏伐或修剪時機';
COMMENT ON COLUMN tree_carbon_data.north_taiwan IS '適合台灣北部';
COMMENT ON COLUMN tree_carbon_data.central_taiwan IS '適合台灣中部';
COMMENT ON COLUMN tree_carbon_data.south_taiwan IS '適合台灣南部';
COMMENT ON COLUMN tree_carbon_data.east_taiwan IS '適合台灣東部';
COMMENT ON COLUMN tree_carbon_data.coastal_area IS '適合沿海地區';
COMMENT ON COLUMN tree_carbon_data.mountain_area IS '適合山區';
COMMENT ON COLUMN tree_carbon_data.urban_area IS '適合都市地區';
COMMENT ON COLUMN tree_carbon_data.economic_value IS '經濟價值';
COMMENT ON COLUMN tree_carbon_data.ecological_value IS '生態價值';
COMMENT ON COLUMN tree_carbon_data.notes IS '備註說明';
COMMENT ON COLUMN tree_carbon_data.created_at IS '建立時間';
COMMENT ON COLUMN tree_carbon_data.updated_at IS '最後更新時間';


-- Create the trigger function for updating the timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger
CREATE TRIGGER trigger_tree_carbon_data_updated_at
BEFORE UPDATE ON tree_carbon_data
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--
-- 插入資料 `tree_carbon_data`
--
INSERT INTO tree_carbon_data (id, common_name_zh, common_name_en, scientific_name, wood_density_min, wood_density_max, carbon_content_min, carbon_content_max, conversion_factor_min, conversion_factor_max, dbh_growth_min, dbh_growth_max, height_growth_min, height_growth_max, lifespan_min, lifespan_max, max_height_min, max_height_max, max_dbh_min, max_dbh_max, carbon_absorption_min, carbon_absorption_max, hectare_absorption_min, hectare_absorption_max, carbon_efficiency, growth_rate, climate_conditions, drought_tolerance, wet_tolerance, salt_tolerance, pollution_resistance, soil_types, ideal_spacing_min, ideal_spacing_max, management_approach, carbon_enhancement, pruning_time, north_taiwan, central_taiwan, south_taiwan, east_taiwan, coastal_area, mountain_area, urban_area, economic_value, ecological_value, notes, created_at, updated_at) VALUES
(1, '榕樹', 'Chinese Banyan', 'Ficus microcarpa', 0.58, 0.72, 0.47, 0.50, 0.273, 0.360, 0.8, 1.2, 0.6, 1.2, 100, 300, 15, 25, 100, 300, 18, 35, 15, 25, '高', '中等', '熱帶及亞熱帶氣候，年均溫20-28°C', '高', '中等', '中高', '強', '廣泛適應，偏好排水良好的沙質壤土', 10.0, 15.0, '早期適度修剪以形成開闊樹冠，減少氣生根過度生長', '保持大型樹冠，維護根系健康', '雨季後修剪', true, false, true, false, false, false, true, '高', '高', '榕樹為台灣常見的大型喬木，具有廣闊的樹冠、發達的氣生根及良好的遮蔭效果，常作為廟宇、家宅附近的庇蔭樹，也是優良的行道樹與園林樹種。', '2025-04-28 07:37:15', '2025-05-12 16:49:40'),
(2, '小葉欖仁', NULL, 'Terminalia catappa', 0.52, 0.64, 0.47, 0.49, 0.244, 0.314, 1.5, 2.0, 0.8, 1.5, 50, 80, 20, 35, 50, 150, 18, 32, 18, 28, '高', '快', '熱帶及亞熱帶沿海地區，耐高溫', '中等', '高', '高', NULL, '沙質土壤，鹽鹼土', 6.0, 8.0, '適度疏伐以維持樹冠通風', '幼樹期間適度施肥促進生長', '落葉期', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(3, '樟樹', NULL, 'Cinnamomum camphora', 0.48, 0.56, 0.48, 0.52, 0.230, 0.291, 0.8, 1.3, NULL, NULL, 200, 500, 25, 40, 200, 350, 20, 36, 16, 29, '高', '中等', '亞熱帶和溫帶氣候', '中等', '高', NULL, '強', '肥沃的黃壤、紅壤或石灰性土壤', 8.0, 12.0, '初期密植，中期疏伐', '間作豆科植物提高土壤氮含量', '冬季休眠期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(4, '白千層', NULL, 'Melaleuca leucadendra', 0.65, 0.78, 0.46, 0.49, 0.299, 0.382, 1.5, 2.2, 1.0, 1.8, 40, 80, 15, 25, 30, 80, 15, 28, 25, 35, '高', '快', '熱帶及亞熱帶濕潤至半濕潤氣候', '高', '極高', '高', '強', '沙質土、潮溼土壤、黏土，甚至短期積水土壤', 3.0, 5.0, '密植速生，輪伐期可設定為10-15年', '初期適度施肥，保持高密度種植', '旱季結束時', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(5, '鳳凰木', NULL, 'Delonix regia', 0.45, 0.55, 0.47, 0.50, 0.212, 0.275, 1.8, 2.5, 1.0, 1.5, 30, 70, 12, 18, 50, 100, 16, 30, 15, 25, '中等', '快', '熱帶及亞熱帶氣候，不耐寒', '高', '中等', '中等', '中等', '排水良好的沙質土壤', 8.0, 12.0, '定期修剪以控制樹形，防止過度展開', '生長季節控制水份供應，促進深根生長', '花期過後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(6, '臺灣欒樹', NULL, 'Koelreuteria elegans subsp. formosana', 0.54, 0.62, 0.47, 0.51, 0.254, 0.316, 1.0, 1.5, NULL, NULL, 50, 100, 15, 20, 40, 80, 12, 25, 12, 20, '中等', '中等', '亞熱帶氣候，台灣低中海拔地區', '中等', '中等', NULL, '中等', '排水良好的砂質壤土', 6.0, 8.0, '適度修剪保持樹形，促進開花結果', '保持土壤疏鬆，適度施用有機肥', '冬季落葉後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(7, '羅漢松', NULL, 'Podocarpus macrophyllus', 0.50, 0.63, 0.47, 0.50, 0.235, 0.315, 0.5, 0.8, 0.3, 0.6, 100, 300, 10, 25, 50, 100, 8, 16, 10, 18, '中等', '慢', '亞熱帶至暖溫帶氣候', '中等', '中等', '中等', '強', '肥沃的酸性土壤', 3.0, 5.0, '培育通風良好的樹冠，適度修剪', '提供穩定有機質，保持土壤酸性', '春季前或秋季', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(8, '構樹', NULL, 'Broussonetia papyrifera', 0.35, 0.45, 0.47, 0.49, 0.165, 0.221, 2.0, 3.0, 1.5, 2.5, 20, 40, 10, 15, 30, 60, 15, 28, 22, 35, '高', '快', '熱帶至暖溫帶氣候', '高', '高', '低', '強', '廣泛適應，尤其適合荒地、砂石地', 2.0, 4.0, '短輪伐期(5-10年)經營，萌芽更新', '4-6年輪伐，善用萌芽更新能力', '雨季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(9, '黑板樹', NULL, 'Alstonia scholaris', 0.40, 0.50, 0.46, 0.49, 0.184, 0.245, 1.5, 2.0, 1.0, 1.5, 40, 80, 18, 30, 50, 120, 14, 26, 18, 28, '中高', '快', '熱帶至亞熱帶潮濕氣候', '中等', '高', NULL, '中等', '富含有機質的各類土壤', 5.0, 8.0, '保持中等密度，促進通風', '適度施肥，保持生長勢', '乾季末期', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(10, '銀合歡', NULL, 'Leucaena leucocephala', 0.55, 0.75, 0.47, 0.50, 0.259, 0.375, 2.5, 4.0, 2.0, 3.0, 15, 30, 8, 15, 20, 35, 15, 30, 30, 45, '極高', '極快', '熱帶及亞熱帶氣候', '極高', '中等', '中等', '強', '各類土壤均可，甚至貧瘠土壤', 1.0, 3.0, '短輪伐期(3-5年)，高密度種植', '定期回割，善用氮固定能力改良土壤', '全年皆可，以雨季初期為佳', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(11, '欖仁', NULL, 'Terminalia catappa var. pubescens', 0.55, 0.68, 0.47, 0.50, 0.259, 0.340, 1.3, 1.8, 0.7, 1.3, 60, 120, 25, 40, 60, 180, 22, 38, 20, 32, '高', '中等', '熱帶及亞熱帶濱海及低海拔地區', '中等', '高', '高', '中等', '沙質壤土，耐石礫地', 8.0, 10.0, '疏伐保留主幹，促進樹冠生長', '生育初期保持充足水分，促進根系發展', '落葉季節', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(12, '大葉桃花心木', NULL, 'Swietenia macrophylla', 0.57, 0.70, 0.48, 0.51, 0.274, 0.357, 1.2, 2.0, 0.8, 1.5, 80, 200, 30, 45, 100, 200, 18, 35, 15, 28, '中高', '中等', '熱帶及亞熱帶潮濕地區', '中等', '中等', '低', '中等', '肥沃、排水良好的粘土或壤土', 6.0, 8.0, '初期較密植，中期適度疏伐', '適度修剪下部側枝，促進主幹生長', '雨季前', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(13, '苦楝', NULL, 'Melia azedarach', 0.50, 0.60, 0.47, 0.49, 0.235, 0.294, 1.8, 2.6, 1.2, 2.0, 30, 70, 15, 25, 50, 90, 16, 30, 20, 32, '高', '快', '熱帶至溫帶氣候', '高', '中等', '中等', NULL, '廣泛適應，可生長於貧瘠土壤', 4.0, 6.0, '短輪伐期(15-20年)，善用萌芽力強的特性', '輪伐後保留樹樁更新，減少碳釋放', '落葉後到發芽前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(14, '印度橡膠樹', NULL, 'Ficus elastica', 0.54, 0.65, 0.47, 0.50, 0.254, 0.325, 1.0, 1.8, 0.8, 1.5, 100, 200, 25, 40, 150, 300, 15, 32, 14, 26, '中高', '中等', '熱帶雨林氣候', '中等', '高', '低', '中等', '肥沃、深厚、排水良好的土壤', 8.0, 12.0, '保護板根和氣生根，促進樹冠生長', '提供足夠空間發展大型樹冠', '乾季末期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(15, '赤桉', NULL, 'Eucalyptus camaldulensis', 0.60, 0.80, 0.48, 0.51, 0.288, 0.408, 2.5, 4.0, 2.0, 3.5, 50, 250, 25, 45, 100, 200, 25, 45, 30, 50, '極高', '極快', '亞熱帶至溫帶氣候，耐乾旱環境', '極高', '中等', NULL, '強', '各類土壤，包括貧瘠和鹽鹼土', 3.0, 5.0, '短輪伐期(8-15年)，善用萌芽更新能力', '高密度種植後階段性疏伐', '生長季前期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(16, '茄苳', NULL, 'Bischofia javanica', 0.65, 0.75, 0.47, 0.50, 0.306, 0.375, 1.0, 1.5, 0.8, 1.2, 80, 150, 20, 30, 80, 150, 15, 28, 16, 24, '中高', '中等', '熱帶至亞熱帶濕潤氣候', '中等', '高', '低', '中等', '潮濕肥沃的壤土或黏土', 5.0, 8.0, '幼年期適度修剪，成年期維持自然生長', '保持土壤水分，促進深根發展', '落葉期後至發芽前', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(17, '楓香', NULL, 'Liquidambar formosana', 0.52, 0.63, 0.47, 0.50, 0.244, 0.315, 0.8, 1.2, 0.6, 1.0, 100, 200, 20, 40, 80, 180, 12, 25, 14, 22, '中等', '中等', '亞熱帶至暖溫帶氣候', '中等', '中等', '低', NULL, '濕潤肥沃的砂質壤土或壤土', 6.0, 8.0, ', 中期疏伐保留優良樹形', '保持土壤濕潤及pH值適中', '落葉後至早春發芽前', true, true, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(18, '黃槿', NULL, 'Hibiscus tiliaceus', 0.45, 0.58, 0.47, 0.49, 0.212, 0.284, 1.5, 2.2, 0.8, 1.5, 40, 80, 8, 15, 30, 80, 10, 18, 15, 25, '中等', '中快', '熱帶及亞熱帶沿海地區', '中等', '高', '極高', '中等', '砂質土壤、濱海土壤', 3.0, 5.0, '多幹生長，定期修剪保持形狀', '適度修剪促進分枝，增加葉面積', '全年皆可，生長季後期為佳', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(19, '蒲葵', NULL, 'Livistona chinensis', 0.40, 0.55, 0.46, 0.49, 0.184, 0.270, NULL, NULL, 0.3, 0.6, 60, 100, 10, 15, 25, 45, 8, 15, 10, 18, '中低', '慢', '亞熱帶至溫帶氣候', '中等', '中等', '中等', '中等', '排水良好的沙質壤土', 4.0, 6.0, '定期清除枯葉，保持樹幹清潔', '維持足夠葉面積，避免過度修剪葉片', '春季或秋季', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(20, '流蘇', NULL, 'Chionanthus retusus', 0.55, 0.65, 0.47, 0.50, 0.259, 0.325, 0.6, 0.9, 0.3, 0.6, 70, 150, 8, 15, 30, 60, 6, 12, 8, 15, '中低', '慢', '亞熱帶至溫帶氣候', '中等', '中等', '低', '中等', '微酸性至中性，排水良好的肥沃土壤', 4.0, 6.0, '自然生長，適度修剪保持樹形', '提供適度有機質肥料，促進生長', '花期過後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(21, '木賊葉木麻黃', NULL, 'Casuarina equisetifolia', 0.83, 0.96, 0.47, 0.51, 0.390, 0.490, 2.0, 3.0, 1.5, 2.5, 40, 70, 20, 35, 50, 90, 20, 40, 25, 45, '極高', '快', '熱帶及亞熱帶濱海氣候', '極高', '中等', '極高', '強', '砂質土壤，鹽鹼地，貧瘠土壤', 3.0, 5.0, '防風林和海岸造林首選，中等密度種植', '善用根瘤菌固氮能力，可免施氮肥', '旱季結束前', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(22, '瓊崖海棠', NULL, 'Calophyllum inophyllum', 0.60, 0.75, 0.47, 0.50, 0.282, 0.375, 1.0, 1.5, 0.8, 1.2, 80, 150, 15, 25, 60, 120, 14, 26, 16, 25, '中高', '中等', '熱帶及亞熱帶沿海地區', '高', '高', '極高', '中等', '砂質土壤，鹽鹼土壤', 6.0, 8.0, '海岸防風林和海岸公園優良樹種', '幼齡期適度整枝，促進生長', '雨季後', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(23, '白榕', NULL, 'Ficus rumphii', 0.55, 0.68, 0.47, 0.50, 0.259, 0.340, 1.0, 1.5, 0.8, 1.3, 100, 250, 15, 30, 100, 250, 15, 32, 14, 24, '中高', '中等', '熱帶及亞熱帶氣候', '高', '中等', '中等', '強', '廣泛適應，偏好肥沃排水良好土壤', 10.0, 15.0, '城市綠化與廟宇園林優良樹種', '保持根系健康，定期清理寄生植物', '雨季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(24, '雞蛋花', NULL, 'Plumeria rubra', 0.45, 0.60, 0.46, 0.49, 0.207, 0.294, 1.0, 1.8, 0.6, 1.0, 30, 60, 5, 8, 25, 40, 8, 15, 8, 16, '中低', '中等', '熱帶及亞熱帶氣候，不耐寒', '高', '低', '中等', '中等', '排水良好的砂質壤土', 3.0, 5.0, '觀賞性景觀樹種，不適合純林經營', '適當修剪，避免過度枝條伸展', '冬季休眠期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(25, '龍柏', NULL, 'Juniperus chinensis \'Kaizuka\'', 0.48, 0.58, 0.48, 0.51, 0.230, 0.296, 0.5, 0.8, 0.3, 0.6, 80, 200, 8, 12, 30, 60, 6, 12, 10, 18, '中低', '慢', '亞熱帶至暖溫帶氣候', '高', '低', '中等', '強', '排水良好的砂質壤土', 2.0, 4.0, '防風綠籬與景觀樹，適合修剪造型', '保持樹冠密度，但需定期修剪通風', '春季或秋季', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(26, '肯氏南洋杉', NULL, 'Araucaria cunninghamii', 0.52, 0.65, 0.47, 0.50, 0.244, 0.325, 1.0, 1.5, 0.6, 1.2, 100, 300, 30, 50, 60, 120, 15, 28, 16, 25, '中高', '中等', '亞熱帶濕潤氣候', '中等', '中等', '中等', '中等', '排水良好的砂質壤土', 6.0, 8.0, '景觀樹和防風林應用，避免密植', '保持足夠空間和陽光，避免底層枝條枯死', '春季生長季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(27, '菩提樹', NULL, 'Ficus religiosa', 0.58, 0.70, 0.47, 0.50, 0.273, 0.350, 1.2, 1.8, 1.0, 1.5, 150, 500, 20, 30, 100, 300, 18, 36, 14, 26, '高', '中等', '熱帶及亞熱帶氣候', '高', '中等', '低', '中強', '肥沃的砂質壤土', 10.0, 15.0, '宗教場所及城市綠化樹種，需注意根系擴展', '保持根系健康，避免過度硬化地面', '雨季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:15', '2025-04-28 07:37:15'),
(28, '可可椰子', NULL, 'Cocos nucifera', 0.35, 0.50, 0.45, 0.48, 0.158, 0.240, NULL, NULL, 0.3, 0.6, 60, 100, 20, 30, 30, 40, 12, 22, 10, 18, '中等', '中等', '熱帶濱海氣候', '中等', '中等', '極高', '中等', '排水良好的砂質土壤', 6.0, 8.0, '沿海景觀及經濟林，兼顧果實生產', '保持土壤有機質，注重排水系統', '乾季期間清理枯葉', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(29, '白水木', NULL, 'Aporusa dioica', 0.60, 0.72, 0.47, 0.49, 0.282, 0.353, 0.8, 1.2, 0.5, 0.8, 50, 100, 10, 15, 30, 60, 10, 18, 14, 22, '中等', '中等', '亞熱帶至暖溫帶潮濕氣候', '中等', '高', '低', '中等', '潮濕肥沃的壤土或砂質壤土', 4.0, 6.0, '次生林復育及混合林營造', '森林下層優良樹種，與高大樹種混植', '冬季或早春', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(30, '土肉桂', NULL, 'Cinnamomum osmophloeum', 0.50, 0.62, 0.48, 0.51, 0.240, 0.316, 0.8, 1.2, 0.6, 1.0, 80, 150, 15, 25, 50, 100, 14, 24, 15, 24, '中高', '中等', '亞熱帶潮濕氣候，台灣中低海拔地區', '中等', '高', '低', '中等', '肥沃的壤土或砂質壤土', 5.0, 7.0, '本土樹種造林及經濟林', '混合造林，間作其他樹種', '冬季休眠期', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(31, '大葉山欖', NULL, 'Palaquium formosanum', 0.65, 0.78, 0.48, 0.50, 0.312, 0.390, 0.6, 1.0, 0.5, 0.8, 100, 200, 20, 30, 80, 150, 12, 22, 12, 20, '中等', '中慢', '亞熱帶潮濕氣候，台灣中低海拔山區', '中等', '高', '低', NULL, '肥沃的壤土或黏土', 6.0, 8.0, '珍貴闊葉林復育，避免純林種植', '與其他闊葉樹混種，營造複層林相', '生長季節前', true, false, true, true, false, true, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(32, '小葉桃花心木', NULL, 'Swietenia mahagoni', 0.60, 0.75, 0.48, 0.51, 0.288, 0.383, 1.0, 1.5, 0.8, 1.3, 80, 200, 20, 30, 60, 150, 16, 28, 15, 25, '中高', '中等', '熱帶及亞熱帶氣候', '高', '中等', '中等', '中等', '排水良好的砂質壤土或壤土', 6.0, 8.0, '高級木材經濟林和城市綠化', '幼齡期適度修剪，促進主幹生長', '雨季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(33, '海檬果', NULL, 'Cerbera manghas', 0.45, 0.58, 0.47, 0.49, 0.211, 0.284, 1.0, 1.8, 0.8, 1.4, 40, 80, 10, 15, 30, 60, 10, 18, 12, 20, '中等', '中等', '熱帶及亞熱帶濱海地區', '中等', '高', '極高', '中等', 'a沙質土壤，耐潮濕土壤', 4.0, 6.0, '海岸防風林和海濱景觀樹種', '保護果實自然更新，增加種群密度', '花期後', true, false, true, true, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(34, '水黃皮', NULL, 'Garcinia subelliptica', 0.65, 0.75, 0.48, 0.51, 0.312, 0.383, 0.6, 1.0, 0.4, 0.7, 60, 120, 8, 15, 30, 60, 8, 15, 10, 18, '中等', '中慢', '亞熱帶潮濕氣候，台灣低海拔地區', '中等', '高', '高', '中強', '肥沃的砂質壤土或壤土', 4.0, 6.0, '濱海防風林和城市綠化樹種', '保持樹冠完整，避免過度修剪', '春季', true, false, true, true, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(35, '洋紅風鈴木', NULL, 'Tabebuia rosea', 0.53, 0.65, 0.47, 0.50, 0.249, 0.325, 1.5, 2.2, 1.0, 1.8, 50, 100, 15, 25, 50, 90, 15, 28, 16, 26, '中高', '中快', '熱帶及亞熱帶氣候', '中等', '中等', '中等', '中等', '肥沃的砂質壤土，排水良好', 6.0, 8.0, '道路景觀樹和都市綠化', '保持良好樹形，避免過度修剪', '花期過後，雨季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(36, '檄樹', NULL, 'Lannea coromandelica', 0.48, 0.58, 0.47, 0.49, 0.226, 0.284, 1.5, 2.2, 1.0, 1.6, 50, 80, 15, 20, 50, 90, 14, 24, 15, 25, '中高', '中快', '熱帶及亞熱帶氣候', '極高', '中等', '中等', '強', '砂質土壤或壤土，耐貧瘠土壤', 5.0, 7.0, '薪炭林或荒地復育初期先驅樹種', '善用萌芽更新能力，增加碳吸收效率', '乾季末期', true, true, true, true, true, true, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(37, '毛柿', NULL, 'Diospyros discolor', 0.60, 0.75, 0.48, 0.51, 0.288, 0.383, 0.8, 1.2, 0.6, 1.0, 80, 150, 12, 18, 40, 80, 12, 22, 12, 20, '中等', '中等', '熱帶及亞熱帶潮濕氣候', '中等', '高', '低', '中等', '肥沃的壤土至砂質壤土', 6.0, 8.0, '經濟林和景觀樹種兼用，注重果實生產', '保持足夠生長空間，促進樹冠發展', '冬季或早春', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(38, '鐵色', NULL, 'Mesua ferrea', 0.90, 1.10, 0.48, 0.52, 0.432, 0.572, 0.5, 0.8, 0.4, 0.7, 200, 400, 25, 35, 100, 180, 10, 18, 12, 20, '中等', '慢', '熱帶及亞熱帶濕潤氣候', '中等', '高', '低', '中等', '深厚肥沃的排水良好土壤', 8.0, 10.0, '高級木材生產及永久碳匯樹種', '長期穩定經營，最大化碳儲存時間', '生長季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(39, '馬拉巴栗', NULL, 'Pachira macrocarpa', 0.40, 0.52, 0.47, 0.49, 0.188, 0.255, 1.5, 2.5, 1.0, 1.8, 50, 100, 15, 25, 60, 120, 15, 26, 14, 24, '中高', '中快', '熱帶及亞熱帶氣候', '中等', '高', NULL, '中等', '富含有機質的砂質壤土', 6.0, 8.0, '觀賞樹種及園林造景', '養護盆栽時延長碳匯時間，景觀樹保持高度通風', '生長季前或休眠期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(40, '金龜樹', NULL, 'Pithecellobium dulce', 0.60, 0.75, 0.47, 0.50, 0.282, 0.375, 1.5, 2.5, 1.0, 1.8, 60, 120, 15, 20, 50, 100, 16, 28, 18, 28, '高', '中快', '熱帶及亞熱帶氣候', '極高', '中等', '高', NULL, '各類土壤，耐惡劣環境', 5.0, 8.0, '固氮能力強，混合造林或荒地綠化樹種', '鼓勵深根系發展，定期修剪刺激生長', '乾季末期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(41, '棋盤腳', NULL, 'Barringtonia asiatica', 0.50, 0.62, 0.46, 0.49, 0.230, 0.304, 1.0, 1.5, 0.8, 1.3, 60, 120, 15, 20, 60, 100, 12, 22, 14, 22, '中等', '中等', '熱帶及亞熱帶濱海氣候', '中等', '高', '極高', '中等', '沙質土壤，珊瑚礁土', 6.0, 8.0, '濱海生態保護與海岸防護樹種', '確保果實自然傳播，形成穩定族群', '雨季前', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(42, '破布子', NULL, 'Cordia dichotoma', 0.48, 0.60, 0.47, 0.49, 0.226, 0.294, 1.2, 1.8, 0.8, 1.4, 50, 100, 10, 15, 40, 80, 12, 22, 14, 22, '中等', '中等', '熱帶及亞熱帶氣候', '高', '中等', '中等', '中等', '各類土壤，耐貧瘠', 5.0, 7.0, '兼具果實利用和綠化功能', '生長期適度修剪促進分枝，增加葉面積', '果實採收後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(43, '大葉合歡', NULL, 'Albizia lebbeck', 0.55, 0.70, 0.47, 0.50, 0.259, 0.350, 2.0, 3.0, 1.5, 2.5, 60, 100, 18, 25, 60, 120, 18, 35, 20, 32, '高', '快', '熱帶及亞熱帶氣候', '高', '中等', '中等', '強', '各類土壤，固氮能力強', 6.0, 8.0, '綠籬、行道樹及固氮樹種', '保持開闊樹冠，善用固氮能力改良土壤', '乾季末期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(44, '菲島福木', NULL, 'Garcinia multiflora', 0.65, 0.78, 0.48, 0.51, 0.312, 0.398, 0.7, 1.1, 0.4, 0.8, 80, 150, 10, 15, 30, 60, 10, 18, 12, 20, '中等', '中慢', '亞熱帶潮濕氣候', '中等', '高', '中等', '中強', '排水良好的壤土或砂質壤土', 4.0, 6.0, '景觀樹與生態復育樹種', '保持樹冠完整，避免過度修剪', '春季生長前', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(45, '楊桃', NULL, 'Averrhoa carambola', 0.45, 0.55, 0.47, 0.49, 0.212, 0.270, 1.0, 1.6, 0.8, 1.2, 30, 50, 8, 12, 30, 50, 8, 16, 10, 18, '中等', '中等', '熱帶及亞熱帶氣候', '中等', '中等', '低', '中等', '排水良好的壤土', 4.0, 6.0, '果園生產與庭園綠化兼顧', '果實生產與碳吸收平衡管理', '花後果前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(46, '芒果樹', NULL, 'Mangifera indica', 0.52, 0.65, 0.47, 0.50, 0.244, 0.325, 1.2, 1.8, 0.8, 1.5, 80, 200, 15, 30, 60, 150, 15, 30, 14, 25, '中高', '中等', '熱帶及亞熱帶氣候', '高', '中等', NULL, '中等', '深厚肥沃的排水良好土壤', 8.0, 12.0, '果園經濟生產與碳匯兼顧', '保持健康大樹冠，果園老齡樹轉為碳匯林', '果實採收後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(47, '緬梔', NULL, 'Plumeria obtusa', 0.46, 0.58, 0.46, 0.49, 0.212, 0.284, 1.0, 1.5, 0.5, 0.9, 40, 70, 6, 10, 25, 45, 7, 14, 8, 16, '中低', '中等', '熱帶及亞熱帶氣候，不耐寒', '極高', '低', '中等', '中等', '排水極佳的砂質壤土', 3.0, 5.0, '觀賞樹種，不適合純林經營', '保持充足水分和陽光，避免過度乾燥', '冬季休眠期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(48, '黃連木', NULL, 'Pistacia chinensis', 0.70, 0.85, 0.48, 0.51, 0.336, 0.434, 0.6, 1.0, 0.4, 0.8, 100, 300, 15, 25, 60, 120, 10, 20, 12, 20, '中等', '中慢', '亞熱帶至暖溫帶氣候', '極高', '中等', '中低', '強', '石灰岩地區或砂質土壤，耐貧瘠', 6.0, 8.0, '水土保持及長壽命碳匯樹種', '初期密植後逐步疏伐，促進高生長', '休眠期', true, false, true, false, false, true, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(49, '潺槁樹', NULL, 'Litsea glutinosa', 0.52, 0.62, 0.47, 0.50, 0.244, 0.310, 1.2, 1.8, 0.8, 1.4, 50, 100, 12, 18, 50, 80, 12, 24, 14, 24, '中高', '中等', '熱帶及亞熱帶氣候', '中高', '高', '低', NULL, '各類土壤，適應性強', 5.0, 7.0, '荒廢地復育及次生林重建樹種', '保持適當密度，促進自然更新', '雨季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(50, '阿勒勃', NULL, 'Cerbera odollam', 0.48, 0.60, 0.47, 0.49, 0.226, 0.294, 1.2, 1.8, 0.8, 1.3, 50, 90, 12, 18, 40, 80, 12, 22, 14, 22, '中等', '中等', '熱帶及亞熱帶濱海氣候', '中等', '極高', '極高', '中等', '沙質土壤，紅樹林邊緣地帶', 5.0, 7.0, '海岸防護林和紅樹林過渡帶樹種', '注意水位管理，促進穩定生長', '乾季末期', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(51, '欖仁舅', NULL, 'Elaeocarpus sylvestris', 0.56, 0.68, 0.47, 0.50, 0.263, 0.340, 0.8, 1.2, 0.6, 1.0, 80, 150, 15, 25, 60, 100, 12, 22, 14, 22, '中等', '中等', '亞熱帶至暖溫帶潮濕氣候', '中等', '高', '低', '中等', '肥沃、排水良好的砂質壤土或壤土', 6.0, 8.0, '混合林營造，適度疏伐促進通風', '定期清除下層競爭植物，維持土壤肥力', '冬季休眠期', true, true, true, true, true, true, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(52, '蘭嶼羅漢松', NULL, 'Podocarpus costalis', 0.48, 0.60, 0.47, 0.50, 0.226, 0.300, 0.4, 0.7, 0.2, 0.5, 100, 300, 8, 15, 30, 70, 6, 14, 8, 16, '中低', '慢', '熱帶及亞熱帶海岸型氣候', '中等', '高', '高', '中等', '排水良好的砂質土壤，耐鹽鹼土', 3.0, 5.0, '保育性經營，作為珍稀物種保存', '維持自然生長，避免過度干擾', '春季前', true, false, true, false, true, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(53, '無葉檉柳', NULL, 'Tamarix aphylla', 0.62, 0.78, 0.47, 0.50, 0.291, 0.390, 1.2, 2.0, 0.8, 1.5, 60, 120, 12, 18, 40, 90, 15, 25, 18, 30, '高', '中快', '熱帶及亞熱帶乾旱氣候', '極高', '低', '極高', '強', '鹽鹼土壤、砂質土壤，極耐貧瘠', 4.0, 6.0, '防風固砂林帶，定期修剪控制高度', '促進深根發展，增強耐旱能力', '乾季末期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(54, '月橘', NULL, 'Murraya paniculata', 0.70, 0.85, 0.48, 0.51, 0.336, 0.434, 0.5, 0.8, 0.3, 0.6, 40, 80, 3, 7, 15, 30, 4, 8, 8, 16, '中低', '中慢', '熱帶及亞熱帶氣候', '高', '中等', '中等', '強', '各類排水良好的土壤', 1.5, 3.0, '綠籬和庭園樹種，定期修剪維持樹形', '控制修剪頻率，保持充足葉面積', '花期後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(55, '鴨腳木', NULL, 'Schefflera octophylla', 0.48, 0.58, 0.47, 0.49, 0.226, 0.284, 0.8, 1.3, 0.6, 1.0, 30, 60, 8, 15, 25, 50, 8, 16, 10, 18, '中等', '中等', '熱帶及亞熱帶潮濕氣候', '中等', '高', '低', '中等', '肥沃、排水良好的壤土', 4.0, 6.0, '次生林復育和森林下層樹種', '與高大樹種混植，形成多層次森林結構', '雨季前', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(56, '鐵刀木', NULL, 'Cassia siamea', 0.65, 0.80, 0.48, 0.51, 0.312, 0.408, 1.5, 2.2, 1.2, 1.8, 60, 100, 15, 25, 50, 90, 18, 32, 20, 30, '高', '中快', '熱帶及亞熱帶氣候', '高', '中等', '中等', '中強', '砂質壤土至壤土，耐貧瘠', 4.0, 6.0, '兼顧木材生產和固氮功能的多功能林業', '善用豆科植物固氮能力，改良土壤', '乾季末期', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(57, '巴西乳香', NULL, 'Schinus terebinthifolius', 0.52, 0.65, 0.47, 0.50, 0.244, 0.325, 1.2, 1.8, 0.8, 1.5, 30, 70, 6, 10, 25, 60, 10, 18, 15, 25, '中高', '中快', '熱帶及亞熱帶氣候', '極高', '中等', '高', '強', '各類土壤，極耐貧瘠', 3.0, 5.0, '防風林和荒地綠化樹種', '控制擴散性，防止形成單一優勢林相', '乾季期間', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(58, '西印度櫻桃', NULL, 'Eugenia uniflora', 0.65, 0.75, 0.48, 0.50, 0.312, 0.375, 0.6, 1.0, 0.4, 0.8, 50, 80, 6, 10, 20, 40, 6, 12, 10, 18, '中等', '中等', '熱帶及亞熱帶氣候', '中高', '中等', '中等', '中等', '排水良好的沙質壤土', 3.0, 5.0, '果園與景觀綠化兼顧', '適度修剪促進分枝，增加葉面積', '果實採收後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(59, '釋迦', NULL, 'Annona squamosa', 0.48, 0.58, 0.47, 0.49, 0.226, 0.284, 0.8, 1.2, 0.6, 1.0, 30, 60, 5, 8, 20, 40, 6, 12, 8, 15, '中低', '中等', '熱帶及亞熱帶氣候', '高', '中低', '低', '中等', '排水良好的砂質壤土', 4.0, 5.0, '果園經營，定期修剪促進果實生產', '在不影響產量的前提下保持較大樹冠', '果實採收後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(60, '蓮霧', NULL, 'Syzygium samarangense', 0.60, 0.72, 0.47, 0.50, 0.282, 0.360, 1.0, 1.5, 0.8, 1.2, 40, 80, 12, 16, 30, 60, 10, 18, 12, 20, '中等', '中等', '熱帶及亞熱帶氣候', '中等', '高', '低', '中等', '肥沃、排水良好的砂質壤土或壤土', 5.0, 7.0, '果園經營，適度修剪控制高度', '適度控制結果量，保持樹體生長勢', '採收季節後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(61, '白玉蘭', NULL, 'Magnolia alba', 0.50, 0.62, 0.47, 0.50, 0.235, 0.310, 0.8, 1.3, 0.6, 1.0, 60, 120, 15, 25, 40, 80, 12, 22, 14, 22, '中等', '中等', '亞熱帶至暖溫帶潮濕氣候', '中等', '高', '低', '中等', '肥沃的酸性壤土', 6.0, 8.0, '觀賞樹種，保持自然生長', '提供良好生長環境，避免根部受損', '花後至夏季', true, false, true, true, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(62, '臺灣胡桃/野核桃', NULL, 'Juglans cathayensis', 0.65, 0.78, 0.48, 0.51, 0.312, 0.398, 0.8, 1.2, 0.7, 1.1, 100, 200, 20, 30, 60, 120, 15, 28, 14, 24, '中高', '中等', '亞熱帶至暖溫帶氣候，中高海拔地區', '中等', '中等', '低', '中等', '深厚肥沃的壤土或黏壤土', 8.0, 10.0, '經濟林與生態林兼顧，重視長期價值', '初期適度整枝，促進主幹生長', '冬季休眠期', true, false, true, false, false, true, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(63, '龍眼', NULL, 'Dimocarpus longan', 0.62, 0.75, 0.47, 0.50, 0.291, 0.375, 0.8, 1.2, 0.6, 1.0, 80, 150, 10, 15, 50, 100, 12, 22, 12, 20, '中等', '中等', '亞熱帶至熱帶氣候', '高', '中等', '低', '中等', '排水良好的砂質壤土至壤土', 6.0, 8.0, '果園與景觀樹兼顧，適度整枝', '老齡樹轉變為碳匯林，減少結果壓力', '採果季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(64, '墨水樹', NULL, 'Semecarpus cuneiformis', 0.48, 0.60, 0.47, 0.49, 0.226, 0.294, 0.8, 1.3, 0.6, 1.0, 50, 100, 10, 18, 30, 70, 10, 18, 12, 20, '中等', '中等', '熱帶及亞熱帶氣候', '中等', '高', '低', '中等', '肥沃的壤土，耐半濕潤環境', 5.0, 7.0, '混合森林系統中的次層樹種', '與高大樹種混植，營造複層林相', '雨季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(65, '中東海棗', NULL, 'Phoenix dactylifera', 0.40, 0.55, 0.46, 0.48, 0.184, 0.264, NULL, NULL, 0.4, 0.7, 80, 150, 15, 25, 35, 60, 15, 25, 12, 22, '中等', '中等', '熱帶及亞熱帶乾旱氣候', '極高', '低', '高', '中等', '砂質土壤，耐鹽鹼土', 6.0, 8.0, '景觀樹與經濟果樹兼顧', '定期清理枯葉，避免養分消耗', '乾季期間', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(66, '小葉南洋杉', NULL, 'Araucaria heterophylla', 0.50, 0.60, 0.47, 0.50, 0.235, 0.300, 0.8, 1.2, 0.6, 1.0, 100, 200, 30, 50, 60, 120, 14, 24, 15, 25, '中高', '中等', '亞熱帶濕潤氣候', '中等', '中等', '中高', '中等', '排水良好的砂質壤土', 7.0, 10.0, '景觀標誌樹種，避免密植', '保持足夠生長空間，避免下部枝條早期枯死', '春季生長前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(67, '人心果', NULL, 'Blighia sapida', 0.58, 0.70, 0.47, 0.50, 0.273, 0.350, 1.0, 1.5, 0.8, 1.2, 60, 120, 15, 25, 50, 100, 14, 24, 15, 24, '中高', '中等', '熱帶及亞熱帶氣候', '中高', '中等', '低', '中等', '深厚肥沃的壤土', 6.0, 8.0, '庭園樹種與果樹兼顧', '保持肥沃土壤，避免根部受損', '雨季前', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(68, '九丁榕', NULL, 'Ficus benjamina', 0.55, 0.68, 0.47, 0.50, 0.259, 0.340, 1.0, 1.5, 0.8, 1.5, 100, 200, 15, 30, 100, 200, 15, 32, 14, 24, '中高', '中等', '熱帶及亞熱帶氣候', '高', '中等', '中等', '強', '廣泛適應，偏好深厚肥沃土壤', 8.0, 12.0, '都市景觀樹及公園綠化樹種', '控制修剪頻率，保持健康樹冠', '雨季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(69, '雀榕', NULL, 'Ficus superba', 0.56, 0.68, 0.47, 0.50, 0.263, 0.340, 1.0, 1.5, 0.8, 1.3, 100, 250, 15, 25, 80, 200, 14, 30, 15, 25, '高', '中等', '熱帶及亞熱帶氣候', '高', '中高', '中高', '強', '廣泛適應，包括岩石縫隙', 10.0, 15.0, '保護老樹，維持自然生長', '保護根系和氣生根，維持樹冠健康', '雨季後', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(70, '大花紫薇', NULL, 'Lagerstroemia speciosa', 0.60, 0.75, 0.48, 0.50, 0.288, 0.375, 1.0, 1.5, 0.8, 1.2, 60, 120, 15, 25, 50, 100, 12, 24, 14, 22, '中高', '中等', '熱帶及亞熱帶氣候', '高', '中等', '中等', '中強', '排水良好的壤土或砂質壤土', 6.0, 8.0, '行道樹及景觀樹種，定期修剪維持樹形', '適時整枝，促進養分回流', '落葉後至早春', true, false, true, false, false, false, true, NULL, NULL, NULL, '2025-04-28 07:37:16', '2025-04-28 07:37:16'),
(71, '大王椰子', 'Royal Palm', 'Roystonea regia (Kunth) O.F. Cook', 0.35, 0.50, 0.46, 0.48, 0.161, 0.240, 0.8, 1.2, 0.5, 0.8, 30, 100, 15, 30, 50, 80, 10, 20, 12, 22, '中等', '中等', '熱帶及亞熱帶氣候，年均溫20-28°C', '中等', '高', '高', '中等', '疏鬆、肥沃、排水良好的沙質壤土', 6.0, 8.0, '定期修剪枯葉，保持樹形美觀及安全', '保持足夠的生長空間，避免根部受損', '冬季休眠期', true, true, true, true, true, false, true, '中低', '中等', '生長快速，適合作為景觀樹和行道樹，但須注意落葉安全問題', '2025-05-12 16:28:59', '2025-05-12 16:28:59'),
(72, '雨豆樹', 'Rain Tree', 'Samanea saman (Jacq.) Merr.', 0.48, 0.60, 0.47, 0.50, 0.226, 0.300, 1.5, 2.2, 0.8, 1.5, 60, 120, 15, 25, 50, 100, 16, 30, 18, 30, '高', '快', '熱帶及亞熱帶氣候，喜高溫多濕、日照充足', '高', '中等', '中等', '中強', '廣泛適應，偏好肥沃的壤土', 8.0, 12.0, '保持開闊的樹冠，適度修剪', '善用根瘤菌固氮能力改良土壤', '雨季後', true, true, true, false, false, false, true, '中高', '高', '樹冠寬闊，適合作為綠蔭樹和行道樹，木材可供家具與雕刻使用', '2025-05-12 16:28:59', '2025-05-12 16:28:59'),
(73, '櫸', 'Japanese Zelkova', 'Zelkova serrata (Thunb.) Makino', 0.60, 0.75, 0.47, 0.48, 0.282, 0.360, 0.8, 1.5, 0.6, 1.0, 100, 300, 20, 30, 80, 100, 15, 28, 16, 26, '中高', '中等', '亞熱帶至暖溫帶氣候', '中等', '中高', '中低', '中強', '濕潤肥沃的土壤，河谷和溪邊疏林', 6.0, 8.0, '幼年期適度修剪，成年期保持自然生長', '選擇適合的生長環境，保持土壤肥力', '冬季休眠期', true, true, true, true, false, true, true, '高', '高', '台灣闊葉五木之一，木材質量優良，可作高級家具和建材', '2025-05-12 16:28:59', '2025-05-12 16:42:20'),
(74, '血桐', 'Elephant\'s Ear', 'Macaranga tanarius (L.) Müll. Arg.', 0.40, 0.55, 0.46, 0.48, 0.184, 0.264, 1.8, 2.5, 1.2, 2.0, 30, 60, 5, 10, 30, 60, 12, 25, 15, 25, '中高', '快', '熱帶及亞熱帶低海拔地區', '中高', '高', '中低', '中等', '廣泛適應，適合荒廢地和次生林地', 4.0, 6.0, '作為先驅樹種用於荒地復育與水土保持', '善用其快速生長特性，進行階段性經營', '生長季節後', true, true, true, true, true, false, true, '中低', '高', '陽性先驅樹種，生長迅速，適合用於植被復育', '2025-05-12 16:28:59', '2025-05-12 16:28:59');

-- Update sequence
SELECT setval(pg_get_serial_sequence('tree_carbon_data', 'id'), 75, false);
