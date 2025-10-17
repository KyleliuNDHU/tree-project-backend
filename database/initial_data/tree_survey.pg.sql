-- Drop existing objects for a clean run
DROP TRIGGER IF EXISTS trigger_tree_survey_updated_at ON tree_survey;
-- DROP FUNCTION IF EXISTS update_updated_at_column; -- Handled by 00_init_functions.pg.sql
DROP TABLE IF EXISTS tree_survey;

--
-- 資料表結構 `tree_survey` for PostgreSQL
--
CREATE TABLE tree_survey (
    id SERIAL PRIMARY KEY,
    專案區位 VARCHAR(255),
    專案代碼 VARCHAR(50),
    專案名稱 VARCHAR(255),
    系統樹木 VARCHAR(50) NOT NULL,
    專案樹木 VARCHAR(50),
    樹種編號 VARCHAR(20),
    樹種名稱 VARCHAR(100),
    X坐標 DOUBLE PRECISION,
    Y坐標 DOUBLE PRECISION,
    狀況 TEXT,
    註記 TEXT,
    樹木備註 TEXT,
    "樹高（公尺）" DOUBLE PRECISION,
    "胸徑（公分）" DOUBLE PRECISION,
    冠幅東 VARCHAR(50),
    冠幅西 VARCHAR(50),
    冠幅南 VARCHAR(50),
    冠幅北 VARCHAR(50),
    生長狀況 VARCHAR(50),
    樹冠密度 VARCHAR(50),
    枝下高 VARCHAR(50),
    生長空間 VARCHAR(100),
    調查備註 TEXT,
    調查時間 TIMESTAMP,
    碳儲存量 DOUBLE PRECISION,
    推估年碳吸存量 DOUBLE PRECISION,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comments and indexes
COMMENT ON TABLE tree_survey IS '儲存樹木調查的主要資料';
CREATE INDEX idx_tree_survey_project_code ON tree_survey(專案代碼);
CREATE INDEX idx_tree_survey_species_name ON tree_survey(樹種名稱);


-- Create the trigger
CREATE TRIGGER trigger_tree_survey_updated_at
BEFORE UPDATE ON tree_survey
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
