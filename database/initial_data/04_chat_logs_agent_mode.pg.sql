-- ============================================
-- 遷移腳本: 為 chat_logs 表加入 Agent 模式支援
-- 日期: 2025-07
-- 目的: 支援 AI Agent 工具調用記錄
-- ============================================

DO $$
BEGIN
    -- 加入 chat_mode 欄位 (chat / agent)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_logs' AND column_name = 'chat_mode'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN chat_mode VARCHAR(20) DEFAULT 'chat';
        COMMENT ON COLUMN chat_logs.chat_mode IS '對話模式: chat (一般) / agent (工具調用)';
        RAISE NOTICE 'Added chat_mode column to chat_logs table';
    ELSE
        RAISE NOTICE 'chat_mode column already exists';
    END IF;

    -- 加入 metadata 欄位 (JSONB, 儲存工具調用記錄等)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_logs' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN metadata JSONB;
        COMMENT ON COLUMN chat_logs.metadata IS 'Agent 工具調用記錄、token 使用量等元資料';
        RAISE NOTICE 'Added metadata column to chat_logs table';
    ELSE
        RAISE NOTICE 'metadata column already exists';
    END IF;
END $$;
