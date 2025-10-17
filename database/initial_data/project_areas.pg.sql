-- Drop dependent objects first
DROP TRIGGER IF EXISTS trigger_project_areas_updated_at ON project_areas;
-- DROP FUNCTION IF EXISTS update_updated_at_column; -- This is now handled by 00_init_functions.pg.sql

-- Drop the table if it exists
DROP TABLE IF EXISTS project_areas;

--
-- 資料表結構 `project_areas` for PostgreSQL
--
CREATE TABLE project_areas (
  id SERIAL PRIMARY KEY,
  area_name VARCHAR(50) NOT NULL UNIQUE,
  area_code VARCHAR(10) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  city VARCHAR(20),
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION
);

-- 加上註解
COMMENT ON TABLE project_areas IS '專案區位資料表';
COMMENT ON COLUMN project_areas.area_name IS '區位名稱';
COMMENT ON COLUMN project_areas.area_code IS '區位代碼';
COMMENT ON COLUMN project_areas.description IS '區位描述';
COMMENT ON COLUMN project_areas.city IS '所屬縣市';
COMMENT ON COLUMN project_areas.center_lat IS '中心點緯度';
COMMENT ON COLUMN project_areas.center_lng IS '中心點經度';

-- 建立一個觸發器，在每次更新 project_areas 資料表時調用共用函數
CREATE TRIGGER trigger_project_areas_updated_at
BEFORE UPDATE ON project_areas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


--
-- 插入資料 `project_areas`
--
INSERT INTO project_areas (id, area_name, area_code, description, created_at, updated_at, city, center_lat, center_lng) VALUES
(1, '基隆港', 'AREA-001', '基隆港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:53:26', '基隆市', NULL, NULL),
(2, '安平港', 'AREA-002', '安平港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:53:45', '台南市', NULL, NULL),
(3, '布袋港', 'AREA-003', '布袋港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:54:51', '嘉義縣', NULL, NULL),
(4, '澎湖港', 'AREA-004', '澎湖港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:55:02', '澎湖縣', NULL, NULL),
(5, '臺中港', 'AREA-005', '臺中港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:55:13', '台中市', NULL, NULL),
(6, '臺北港', 'AREA-006', '臺北港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:57:43', '新北市', NULL, NULL),
(7, '花蓮港', 'AREA-007', '花蓮港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:57:56', '花蓮縣', NULL, NULL),
(8, '蘇澳港', 'AREA-008', '蘇澳港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:58:06', '宜蘭縣', NULL, NULL),
(9, '高雄港', 'AREA-009', '高雄港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:58:24', '高雄市', NULL, NULL);

-- 更新序列計數器
SELECT setval(pg_get_serial_sequence('project_areas', 'id'), 59, false);
