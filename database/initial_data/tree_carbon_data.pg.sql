-- Drop existing objects to ensure a clean run
DROP TRIGGER IF EXISTS trigger_tree_carbon_data_updated_at ON tree_carbon_data;
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


-- Create the trigger
CREATE TRIGGER trigger_tree_carbon_data_updated_at
BEFORE UPDATE ON tree_carbon_data
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--
-- 初始資料已清除 (原74筆未經學術驗證之資料)
-- 木材密度等欄位需以學術文獻 (如 Zanne et al. 2009, Chave et al. 2009 Global Wood Density Database) 逐一驗證後再行填入
-- 系統在此表為空時仍可正常運作：API 回傳 404、前端使用本地 speciesWoodDensity 對照表 (82種)
--
