-- Drop the table if it exists to avoid errors on re-run
DROP TABLE IF EXISTS chat_logs;

--
-- 資料表結構 `chat_logs` for PostgreSQL
--
CREATE TABLE chat_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  model_used VARCHAR(100),
  project_areas TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 加上註解
COMMENT ON TABLE chat_logs IS '儲存 AI 助理的聊天記錄';
COMMENT ON COLUMN chat_logs.id IS '記錄唯一識別碼';
COMMENT ON COLUMN chat_logs.user_id IS '使用者 ID (對應 users 表的 username 或其他識別符)';
COMMENT ON COLUMN chat_logs.message IS '使用者發送的訊息';
COMMENT ON COLUMN chat_logs.response IS 'AI 模型的回應';
COMMENT ON COLUMN chat_logs.model_used IS '使用的 AI 模型名稱';
COMMENT ON COLUMN chat_logs.project_areas IS '訊息關聯的專案區域';
COMMENT ON COLUMN chat_logs.created_at IS '記錄建立時間';
