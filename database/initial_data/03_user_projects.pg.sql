-- =============================================================
-- 03_user_projects.pg.sql
-- Phase A: 建立 user_projects junction table + 從舊資料遷移
-- =============================================================

-- 1. 建立 user_projects junction table（多對多關聯）
CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_code VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_project_code ON user_projects(project_code);

COMMENT ON TABLE user_projects IS '使用者與專案的多對多關聯表（取代 users.associated_projects 逗號分隔字串）';
COMMENT ON COLUMN user_projects.user_id IS '使用者 ID (FK -> users)';
COMMENT ON COLUMN user_projects.project_code IS '專案代碼';
COMMENT ON COLUMN user_projects.assigned_at IS '關聯建立時間';

-- 2. 從 users.associated_projects 字串遷移既有資料到 user_projects
--    使用 string_to_array + unnest 展開逗號分隔字串
--    ON CONFLICT DO NOTHING 避免重複插入（冪等性）
INSERT INTO user_projects (user_id, project_code)
SELECT
    u.user_id,
    TRIM(code) AS project_code
FROM users u,
     unnest(string_to_array(u.associated_projects, ',')) AS code
WHERE u.associated_projects IS NOT NULL
  AND u.associated_projects != ''
  AND TRIM(code) != ''
ON CONFLICT (user_id, project_code) DO NOTHING;

-- 3. 填充 projects 表（從 tree_survey 中的既有專案資料）
--    確保所有現存專案都有對應的 projects 記錄
INSERT INTO projects (project_code, name, description)
SELECT DISTINCT
    ts.project_code,
    COALESCE(ts.project_name, '未命名專案'),
    '自動從 tree_survey 遷移'
FROM tree_survey ts
WHERE ts.project_code IS NOT NULL
  AND ts.project_code != ''
  AND NOT EXISTS (
      SELECT 1 FROM projects p WHERE p.project_code = ts.project_code
  );

-- 4. 更新 projects 表中的 area_id（關聯到 project_areas）
UPDATE projects p
SET area_id = pa.id
FROM (
    SELECT DISTINCT ts.project_code, ts.project_location
    FROM tree_survey ts
    WHERE ts.project_location IS NOT NULL
) ts
JOIN project_areas pa ON pa.area_name = ts.project_location
WHERE p.project_code = ts.project_code
  AND p.area_id IS NULL;
