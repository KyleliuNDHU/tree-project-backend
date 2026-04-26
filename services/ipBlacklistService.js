/**
 * IP Blacklist Service (T8.2)
 *
 * 處理 IP 層的封鎖邏輯：
 * - isBlocked(ip): 查詢 IP 是否在黑名單中（過期會自動解除；非永久 lock）
 * - recordOffense(ip, baseMinutes, reason, req): 累犯升級
 *     - 若距 last_offense_at > 7 天，offense_count 重置為 1
 *     - offense_count >= 3 -> 永久封鎖 (locked_until = NULL)
 *     - 否則 locked_until = NOW + baseMinutes * 2^(offense_count - 1)，上限 7 天
 * - recordLoginFailureIP(ip, req): 1 小時內失敗 >= 30 次 -> recordOffense(24hr, BRUTE_FORCE_LOGIN)
 * - cleanupOldLoginAttempts(): 清理 > 1 小時的 ip_login_attempts 紀錄
 *
 * 不依賴單一帳號的 reset；專門對付分散帳號 / 共享代理的暴力破解。
 */

const db = require('../config/db');
const AuditLogService = require('./auditLogService');

const COOLDOWN_DAYS = 7;            // last_offense > 7 天 -> 重置 offense_count
const PERMANENT_THRESHOLD = 3;      // offense_count >= 3 -> 永久封鎖
const MAX_LOCK_MINUTES = 7 * 24 * 60; // 7 天上限

const LOGIN_FAILURE_WINDOW_MINUTES = 60;
const LOGIN_FAILURE_THRESHOLD = 30;
const LOGIN_FAILURE_LOCK_MINUTES = 24 * 60; // 24 小時

/**
 * 查詢 IP 是否被封鎖。過期非永久 lock 會自動解除（lazy unlock）。
 * @returns {Promise<{blocked: boolean, until: Date|null, reason: string|null, permanent: boolean}>}
 */
async function isBlocked(ip) {
    if (!ip) return { blocked: false, until: null, reason: null, permanent: false };
    try {
        const { rows } = await db.query(
            `SELECT ip, locked_until, reason, offense_count
             FROM ip_blacklist
             WHERE ip = $1`,
            [ip]
        );
        if (rows.length === 0) {
            return { blocked: false, until: null, reason: null, permanent: false };
        }
        const row = rows[0];
        // 永久封鎖
        if (row.locked_until === null) {
            return { blocked: true, until: null, reason: row.reason, permanent: true };
        }
        // 過期 -> 不擋（保留 row 作為歷史，下次違規會升級 offense_count）
        if (new Date(row.locked_until) <= new Date()) {
            return { blocked: false, until: null, reason: null, permanent: false };
        }
        return {
            blocked: true,
            until: row.locked_until,
            reason: row.reason,
            permanent: false,
        };
    } catch (err) {
        // 資料表還沒 migrate 等情境 -> 不擋使用者
        console.error('[IPBlacklist] isBlocked error:', err.message);
        return { blocked: false, until: null, reason: null, permanent: false };
    }
}

/**
 * 記錄一次違規並升級懲罰。
 * @param {string} ip
 * @param {number} baseMinutes 第一次犯的鎖時長（分鐘）
 * @param {string} reason 'BURST' | 'BRUTE_FORCE_LOGIN' | ...
 * @param {object} [req] 用於 audit log
 */
async function recordOffense(ip, baseMinutes, reason, req) {
    if (!ip) return;
    try {
        // 取現況決定 offense_count
        const { rows: existing } = await db.query(
            `SELECT offense_count, last_offense_at FROM ip_blacklist WHERE ip = $1`,
            [ip]
        );

        let nextCount = 1;
        if (existing.length > 0) {
            const last = existing[0].last_offense_at;
            const cooledDown =
                last && (Date.now() - new Date(last).getTime()) > COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
            nextCount = cooledDown ? 1 : (existing[0].offense_count + 1);
        }

        const permanent = nextCount >= PERMANENT_THRESHOLD;
        let lockMinutes = null;
        if (!permanent) {
            const escalated = baseMinutes * Math.pow(2, nextCount - 1);
            lockMinutes = Math.min(escalated, MAX_LOCK_MINUTES);
        }

        // upsert
        await db.query(
            `INSERT INTO ip_blacklist (ip, locked_until, reason, offense_count, first_offense_at, last_offense_at, updated_at)
             VALUES ($1,
                     CASE WHEN $2::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + ($2 || ' minutes')::interval END,
                     $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (ip) DO UPDATE SET
                 locked_until = CASE WHEN $2::int IS NULL THEN NULL
                                     ELSE CURRENT_TIMESTAMP + ($2 || ' minutes')::interval END,
                 reason = $3,
                 offense_count = $4,
                 last_offense_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP`,
            [ip, lockMinutes, reason, nextCount]
        );

        // 寫 audit log
        try {
            await AuditLogService.log({
                action: permanent ? 'IP_PERMABAN' : 'IP_BLOCKED',
                resourceType: 'ip_blacklist',
                resourceId: ip,
                details: {
                    reason,
                    offense_count: nextCount,
                    lock_minutes: lockMinutes,
                    permanent,
                },
                req: req || { ip, headers: {} },
            });
        } catch (auditErr) {
            console.error('[IPBlacklist] audit log failed:', auditErr.message);
        }

        console.warn(
            `[IPBlacklist] ${permanent ? 'PERMABAN' : 'BLOCK'} ip=${ip} reason=${reason} ` +
            `offense=${nextCount} lockMinutes=${lockMinutes ?? 'PERMANENT'}`
        );
    } catch (err) {
        console.error('[IPBlacklist] recordOffense error:', err);
    }
}

/**
 * 紀錄一次登入失敗 IP；達門檻時自動加入黑名單。
 */
async function recordLoginFailureIP(ip, req) {
    if (!ip) return;
    try {
        await db.query(
            `INSERT INTO ip_login_attempts (ip, attempt_at) VALUES ($1, CURRENT_TIMESTAMP)`,
            [ip]
        );

        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS cnt FROM ip_login_attempts
             WHERE ip = $1 AND attempt_at > NOW() - ($2 || ' minutes')::interval`,
            [ip, LOGIN_FAILURE_WINDOW_MINUTES]
        );
        const cnt = rows[0]?.cnt || 0;

        if (cnt >= LOGIN_FAILURE_THRESHOLD) {
            await recordOffense(ip, LOGIN_FAILURE_LOCK_MINUTES, 'BRUTE_FORCE_LOGIN', req);
            // 觸發後清空該 IP 的計數，避免下次解鎖立刻又被命中
            await db.query(`DELETE FROM ip_login_attempts WHERE ip = $1`, [ip]);
        }
    } catch (err) {
        // 表不存在 / DB 暫時失敗 -> 不影響正常登入流程
        if (err.code !== '42P01') {
            console.error('[IPBlacklist] recordLoginFailureIP error:', err.message);
        }
    }
}

/**
 * 清理 > 1 小時的舊紀錄（給 cleanup cron 用）
 */
async function cleanupOldLoginAttempts() {
    try {
        const result = await db.query(
            `DELETE FROM ip_login_attempts WHERE attempt_at < NOW() - INTERVAL '1 hour'`
        );
        console.log(`[Cleanup] ip_login_attempts purged. Rows affected: ${result.rowCount}`);
    } catch (err) {
        if (err.code !== '42P01') {
            console.error('[Cleanup] cleanupOldLoginAttempts error:', err.message);
        }
    }
}

module.exports = {
    isBlocked,
    recordOffense,
    recordLoginFailureIP,
    cleanupOldLoginAttempts,
    // 測試 / admin 用
    constants: {
        COOLDOWN_DAYS,
        PERMANENT_THRESHOLD,
        MAX_LOCK_MINUTES,
        LOGIN_FAILURE_WINDOW_MINUTES,
        LOGIN_FAILURE_THRESHOLD,
        LOGIN_FAILURE_LOCK_MINUTES,
    },
};
