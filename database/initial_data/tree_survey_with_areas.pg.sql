-- Drop the view if it exists
DROP VIEW IF EXISTS tree_survey_with_areas;

--
-- 檢視表結構 `tree_survey_with_areas` for PostgreSQL
--
CREATE VIEW tree_survey_with_areas AS
SELECT
    ts.id,
    ts.專案區位,
    ts.專案代碼,
    ts.專案名稱,
    ts.系統樹木,
    ts.專案樹木,
    ts.樹種編號,
    ts.樹種名稱,
    ts.X坐標,
    ts.Y坐標,
    ts.狀況,
    ts.註記,
    ts.樹木備註,
    ts."樹高（公尺）",
    ts."胸徑（公分）",
    ts.調查備註,
    ts.調查時間,
    ts.碳儲存量,
    ts.推估年碳吸存量,
    pa.id AS area_id,
    pa.area_code,
    pa.description AS area_description
FROM
    tree_survey ts
LEFT JOIN
    project_areas pa ON ts.專案區位 = pa.area_name;

COMMENT ON VIEW tree_survey_with_areas IS '一個將 tree_survey 和 project_areas 結合的檢視表，方便查詢區域資訊。';
