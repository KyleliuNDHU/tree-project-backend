-- Drop dependent objects first
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
-- DROP FUNCTION IF EXISTS update_updated_at_column(); -- This is now handled by 00_init_functions.pg.sql

-- Drop the table and type if they exist (CASCADE to handle FK dependencies)
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- 創建一個自訂的 ENUM 類型來表示使用者角色
CREATE TYPE user_role AS ENUM ('系統管理員', '業務管理員', '專案管理員', '調查管理員', '一般使用者');

--
-- 資料表結構 `users` for PostgreSQL
--
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  role user_role NOT NULL DEFAULT '一般使用者',
  associated_projects TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  login_attempts INT DEFAULT 0,
  last_attempt_time TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 加上註解
COMMENT ON TABLE users IS '儲存應用程式使用者帳號資訊';
COMMENT ON COLUMN users.user_id IS '使用者唯一識別碼 (主鍵)';
COMMENT ON COLUMN users.username IS '登入帳號 (必須唯一)';
COMMENT ON COLUMN users.password_hash IS '加密後的密碼雜湊值';
COMMENT ON COLUMN users.display_name IS '顯示名稱 (可選)';
COMMENT ON COLUMN users.role IS '使用者角色權限';
COMMENT ON COLUMN users.associated_projects IS '關聯專案清單，以逗號分隔的專案代碼';
COMMENT ON COLUMN users.is_active IS '帳號是否啟用 (TRUE=啟用, FALSE=禁用)';
COMMENT ON COLUMN users.login_attempts IS '登入嘗試次數';
COMMENT ON COLUMN users.last_attempt_time IS '最後登入嘗試時間';
COMMENT ON COLUMN users.created_at IS '帳號建立時間';
COMMENT ON COLUMN users.updated_at IS '帳號最後更新時間';


-- 建立一個觸發器，在每次更新 users 資料表時調用共用函數
CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


--
-- 插入資料 `users`
-- 請注意：PostgreSQL 使用單引號 ' 來包圍字串
--
INSERT INTO users (user_id, username, password_hash, display_name, role, associated_projects, is_active, login_attempts, last_attempt_time, created_at, updated_at) VALUES
(1, 'admin', '$2b$10$F1aGiPLUChLipFEHOzxMpO8kFXjyGszCfRfJdOBOWOIsqX9HEyYna', '維護測試', '系統管理員', '3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,36,48,51,52,53,54,55,57,60,61', true, 0, NULL, '2025-04-29 00:06:21', '2025-05-16 23:50:48'),
(4, 'Taichung', '$2b$10$mCjx/dDQHRMYA/WdlCMM7eJzo5aXf6FoQtnufVzK6rLb7.tTmLdHW', '林柔安', '業務管理員', '61', true, 0, NULL, '2025-05-01 19:48:31', '2025-05-17 11:22:09'),
(5, 'Kyleliu', '$2b$10$fCT7E2dUfWGsbFQXTkq5t.nYy0WxX2R5mio3BomTZPgeV1ulVzPrW', '劉旻豪', '系統管理員', '52', true, 0, NULL, '2025-05-16 20:03:59', '2025-05-16 23:51:03'),
(6, 'test', '$2b$10$GIiFeRlzTayWlVOhg5tmo.HT3b8s4I0xfGVPkoAR4Lj7ECWpz4oFu', '測試', '調查管理員', '48', true, 0, NULL, '2025-05-16 20:33:18', '2025-05-16 23:51:13'),
(7, 'tt2', '$2b$10$7gQw9b1o8n2T8wbbGXcMh.09GXqOMtyGGBP23yIJYVAKqDAog8Mlm', 'tt2', '專案管理員', NULL, true, 0, NULL, '2025-05-17 11:22:43', '2025-05-17 11:22:43');

-- 因為 user_id 是 SERIAL 類型，它會自己管理序列（sequence）
-- 我們需要手動更新這個序列的計數器，讓下一個插入的 id 從最大的現有 id 開始
-- 這裡我們設定為 8，因為原始資料 AUTO_INCREMENT 是 8
SELECT setval(pg_get_serial_sequence('users', 'user_id'), 8, false);
