/**
 * Phase 4.4: 登入失敗監控中間件
 * 
 * 功能：
 * 1. 記錄登入失敗次數
 * 2. 超過閾值時鎖定帳號
 * 3. 記錄異常登入行為到審計日誌
 */

const pool = require('../config/database');
const AuditLogService = require('../services/auditLogService');

// 設定
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

/**
 * 記錄登入失敗
 */
async function recordLoginFailure(username, req) {
    try {
        const result = await pool.query(
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
        
        // 如果達到最大嘗試次數，停用帳號
        if (login_attempts >= MAX_LOGIN_ATTEMPTS && is_active) {
            await pool.query(
                'UPDATE users SET is_active = false WHERE username = $1',
                [username]
            );
            
            // 記錄到審計日誌
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
 * 重置登入失敗次數（成功登入後）
 */
async function resetLoginAttempts(username) {
    try {
        await pool.query(
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
 * 檢查帳號是否被鎖定
 */
async function checkAccountLocked(username) {
    try {
        const result = await pool.query(
            `SELECT is_active, login_attempts, last_attempt_time
             FROM users
             WHERE username = $1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            return { locked: false, message: null };
        }
        
        const { is_active, login_attempts, last_attempt_time } = result.rows[0];
        
        // 如果帳號被停用且有登入失敗記錄
        if (!is_active && login_attempts >= MAX_LOGIN_ATTEMPTS) {
            // 檢查是否已過鎖定時間
            if (last_attempt_time) {
                const lockoutEnd = new Date(last_attempt_time);
                lockoutEnd.setMinutes(lockoutEnd.getMinutes() + LOCKOUT_DURATION_MINUTES);
                
                if (new Date() > lockoutEnd) {
                    // 鎖定時間已過，自動解鎖
                    await pool.query(
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
                    message: `帳號已被鎖定，請在 ${remainingMinutes} 分鐘後再試`
                };
            }
            
            return { 
                locked: true, 
                message: `帳號已被鎖定，請聯繫管理員或等待 ${LOCKOUT_DURATION_MINUTES} 分鐘`
            };
        }
        
        return { locked: false, message: null };
    } catch (error) {
        console.error('[LoginMonitor] Error checking account lock:', error);
        return { locked: false, message: null };
    }
}

/**
 * 取得異常登入統計（管理員用）
 */
async function getLoginFailureStats(hours = 24) {
    try {
        // 參數化查詢，避免 SQL 注入
        const safeHours = Math.max(1, Math.min(8760, parseInt(hours, 10) || 24));
        const result = await pool.query(
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
