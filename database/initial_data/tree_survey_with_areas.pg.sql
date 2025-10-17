-- Drop the view if it exists
DROP VIEW IF EXISTS tree_survey_with_areas;

--
-- 檢視表結構 `tree_survey_with_areas` for PostgreSQL
--
CREATE VIEW tree_survey_with_areas AS
SELECT
    ts.id,
    ts.project_location,
    ts.project_code,
    ts.project_name,
    ts.system_tree_id,
    ts.project_tree_id,
    ts.species_id,
    ts.species_name,
    ts.x_coord,
    ts.y_coord,
    ts.status,
    ts.notes,
    ts.tree_notes,
    ts.tree_height_m,
    ts.dbh_cm,
    ts.survey_notes,
    ts.survey_time,
    ts.carbon_storage,
    ts.carbon_sequestration_per_year,
    pa.id AS area_id,
    pa.area_code,
    pa.description AS area_description
FROM
    tree_survey ts
LEFT JOIN
    project_areas pa ON ts.project_location = pa.area_name;

COMMENT ON VIEW tree_survey_with_areas IS '一個將 tree_survey 和 project_areas 結合的檢視表，方便查詢區域資訊。';
