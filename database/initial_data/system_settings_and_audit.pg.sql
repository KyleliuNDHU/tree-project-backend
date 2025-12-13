--
-- System Settings Table
-- Used for persistent configuration like Legacy Auth Expiry
--
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255),
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE system_settings IS '系統全域設定 (e.g. Legacy Auth Expiry)';

--
-- Audit Logs Table
-- Records critical actions for security and accountability
--
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    username VARCHAR(50), -- De-normalized in case user is deleted
    action VARCHAR(50) NOT NULL, -- e.g., 'LOGIN', 'CREATE_TREE', 'DELETE_PROJECT'
    resource_type VARCHAR(50), -- e.g., 'tree_survey', 'users'
    resource_id VARCHAR(50), -- Target ID
    details TEXT, -- JSON or description
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

COMMENT ON TABLE audit_logs IS '系統審計日誌 (安全性與操作紀錄)';

--
-- Initialize Legacy Auth Expiry if not exists
-- Default: 50 days from now (if not set)
-- This logic is slightly complex for pure SQL in migration if we want "50 days from FIRST run", 
-- but "50 days from now" on every migration run is wrong.
-- We use ON CONFLICT DO NOTHING to ensure it's only set once.
--
INSERT INTO system_settings (key, value, description)
VALUES (
    'auth_legacy_until', 
    (CURRENT_TIMESTAMP + INTERVAL '50 days')::TEXT, 
    'JWT 強制驗證過渡期截止時間 (ISO 8601)'
)
ON CONFLICT (key) DO NOTHING;
