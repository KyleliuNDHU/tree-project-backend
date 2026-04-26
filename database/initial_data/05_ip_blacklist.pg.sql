-- ============================================================================
-- IP Blacklist & Login Attempt Tracking (T8.2)
-- 用於阻擋分散式暴力破解、爆量請求等網路層攻擊
-- ============================================================================

-- IP 黑名單主表
-- locked_until: NULL = 永久封鎖；非 NULL = 該時間後自動解除
-- offense_count: 累犯次數，>= 3 自動轉永久封鎖
-- last_offense_at 距今 > 7 天時，下次違規會把 offense_count 重置為 1
CREATE TABLE IF NOT EXISTS ip_blacklist (
    ip TEXT PRIMARY KEY,
    locked_until TIMESTAMP NULL,
    reason TEXT,
    offense_count INT NOT NULL DEFAULT 1,
    first_offense_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_offense_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ip_blacklist_locked_until ON ip_blacklist(locked_until);

COMMENT ON TABLE ip_blacklist IS 'IP 黑名單 (T8.2): 暫時或永久封鎖的 IP';
COMMENT ON COLUMN ip_blacklist.locked_until IS 'NULL = 永久封鎖，否則為解除時間';
COMMENT ON COLUMN ip_blacklist.offense_count IS '累犯次數，>=3 自動轉永久封鎖';

-- 登入失敗 IP 計數（短時間視窗內聚合用）
-- 每筆失敗登入插入一列；定期清理 > 1 hour 的舊紀錄
CREATE TABLE IF NOT EXISTS ip_login_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ip_login_attempts_ip_time ON ip_login_attempts(ip, attempt_at);

COMMENT ON TABLE ip_login_attempts IS '登入失敗 IP 計數（用於分散式 brute-force 偵測）';
