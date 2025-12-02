-- ============================================
-- 遷移腳本: 為 chat_logs 表加入 session_id 欄位
-- 日期: 2025-12
-- 目的: 支援多對話會話功能
-- ============================================

-- 檢查欄位是否存在，不存在則新增
DO $$
BEGIN
    -- 加入 session_id 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_logs' AND column_name = 'session_id'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN session_id VARCHAR(50);
        COMMENT ON COLUMN chat_logs.session_id IS '對話會話 ID，用於區分同一用戶的不同對話';
        
        -- 為既有記錄設置預設 session_id (使用 user_id + 日期)
        UPDATE chat_logs 
        SET session_id = user_id || '_' || TO_CHAR(created_at, 'YYYYMMDD')
        WHERE session_id IS NULL;
        
        RAISE NOTICE 'Added session_id column to chat_logs table';
    ELSE
        RAISE NOTICE 'session_id column already exists in chat_logs table';
    END IF;

    -- 加入 message_type 欄位 (user/assistant)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_logs' AND column_name = 'message_type'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN message_type VARCHAR(20) DEFAULT 'pair';
        COMMENT ON COLUMN chat_logs.message_type IS '訊息類型: pair (成對的問答), user (用戶訊息), assistant (AI 回覆)';
        
        RAISE NOTICE 'Added message_type column to chat_logs table';
    ELSE
        RAISE NOTICE 'message_type column already exists in chat_logs table';
    END IF;
END $$;

-- 建立索引以優化查詢效能
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_session ON chat_logs(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);

-- 加上註解
COMMENT ON TABLE chat_logs IS '儲存 AI 助理的聊天記錄 (支援多會話)';
