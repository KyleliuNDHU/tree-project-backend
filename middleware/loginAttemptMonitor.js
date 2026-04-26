/**
 * Phase 4.4: ?�入失�???��中�?�?
 * 
 * ?�能�?
 * 1. 記�??�入失�?次數
 * 2. 超�??�值�??��?帳�?
 * 3. 記�??�常?�入行為?�審計日�?
 */

const db = require('../config/db');
const AuditLogService = require('../services/auditLogService');
const { recordLoginFailureIP } = require('../services/ipBlacklistService');

// 設�?
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

/**
 * 記�??�入失�?
 */
async function recordLoginFailure(username, req) {
    // [T8.2] 同步記錄 IP 失敗計數（用於分散帳號的 brute force 偵測）
    // fire-and-forget — 不要因為 IP 紀錄失敗而擋下既有帳號層流程
    if (req && req.ip) {
        recordLoginFailureIP(req.ip, req).catch((e) =>
            console.error('[LoginMonitor] recordLoginFailureIP failed:', e.message)
        );
    }

    try {
        const result = await db.query(
            `UPDATE users 
             SET login_attempts = login_attempts + 1,
                 last_attempt_time = CURRENT_TIMESTAMP
             WHERE username = $1
             RETURNING login_attempts, is_active`,
            [username]
        );
        
        if (result.rows.length === 0) {
            return { attempts: 0, locked: false };
        }
        
        const { login_attempts, is_active } = result.rows[0];
        
        // 如�??�到?�大�?試次?��??�用帳�?
        if (login_attempts >= MAX_LOGIN_ATTEMPTS && is_active) {
            await db.query(
                'UPDATE users SET is_active = false WHERE username = $1',
                [username]
            );
            
            // 記�??�審計日�?
            await AuditLogService.log({
                username: username,
                action: 'ACCOUNT_LOCKED',
                resourceType: 'users',
                details: { 
                    reason: 'Too many failed login attempts',
                    attempts: login_attempts,
                    lockout_duration_minutes: LOCKOUT_DURATION_MINUTES
                },
                req
            });
            
            console.warn(`[LoginMonitor] Account locked: ${username} (${login_attempts} failed attempts)`);
            
            return { attempts: login_attempts, locked: true };
        }
        
        return { attempts: login_attempts, locked: false };
    } catch (error) {
        console.error('[LoginMonitor] Error recording login failure:', error);
        return { attempts: 0, locked: false };
    }
}

/**
 * ?�置?�入失�?次數（�??�登?��?�?
 */
async function resetLoginAttempts(username) {
    try {
        await db.query(
            `UPDATE users 
             SET login_attempts = 0,
                 last_attempt_time = NULL
             WHERE username = $1`,
            [username]
        );
    } catch (error) {
        console.error('[LoginMonitor] Error resetting login attempts:', error);
    }
}

/**
 * 檢查帳�??�否被�?�?
 */
async function checkAccountLocked(username) {
    try {
        const result = await db.query(
            `SELECT is_active, login_attempts, last_attempt_time
             FROM users
             WHERE username = $1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            return { locked: false, message: null };
        }
        
        const { is_active, login_attempts, last_attempt_time } = result.rows[0];
        
        // 如�?帳�?被�??��??�登?�失?��???
        if (!is_active && login_attempts >= MAX_LOGIN_ATTEMPTS) {
            // 檢查?�否已�??��??��?
            if (last_attempt_time) {
                const lockoutEnd = new Date(last_attempt_time);
                lockoutEnd.setMinutes(lockoutEnd.getMinutes() + LOCKOUT_DURATION_MINUTES);
                
                if (new Date() > lockoutEnd) {
                    // ?��??��?已�?，自?�解??
                    await db.query(
                        `UPDATE users 
                         SET is_active = true, 
                             login_attempts = 0,
                             last_attempt_time = NULL
                         WHERE username = $1`,
                        [username]
                    );
                    
                    console.log(`[LoginMonitor] Account auto-unlocked: ${username}`);
                    return { locked: false, message: null };
                }
                
                const remainingMinutes = Math.ceil((lockoutEnd - new Date()) / 60000);
                return { 
                    locked: true, 
                    message: `帳�?已被?��?，�???${remainingMinutes} ?��?後�?試`
                };
            }
            
            return { 
                locked: true, 
                message: `帳�?已被?��?，�??�繫管�??��?等�? ${LOCKOUT_DURATION_MINUTES} ?��?`
            };
        }
        
        return { locked: false, message: null };
    } catch (error) {
        console.error('[LoginMonitor] Error checking account lock:', error);
        return { locked: false, message: null };
    }
}

/**
 * ?��??�常?�入統�?（管?�員?��?
 */
async function getLoginFailureStats(hours = 24) {
    try {
        // ?�數?�查詢�??��? SQL 注入
        const safeHours = Math.max(1, Math.min(8760, parseInt(hours, 10) || 24));
        const result = await db.query(
            `SELECT 
                username,
                COUNT(*) as failure_count,
                MAX(created_at) as last_failure
             FROM audit_logs
             WHERE action = 'LOGIN_FAILED'
               AND created_at > NOW() - INTERVAL '1 hour' * $1
             GROUP BY username
             HAVING COUNT(*) >= 3
             ORDER BY failure_count DESC
             LIMIT 20`,
            [safeHours]
        );
        
        return result.rows;
    } catch (error) {
        console.error('[LoginMonitor] Error getting login failure stats:', error);
        return [];
    }
}

module.exports = {
    recordLoginFailure,
    resetLoginAttempts,
    checkAccountLocked,
    getLoginFailureStats,
    MAX_LOGIN_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES
};
