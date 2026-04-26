/**
 * IP Blacklist Admin API (T8.2 admin UI)
 *
 * 全部端點僅限「系統管理員」(Lvl 5) 操作。
 *
 *  GET    /api/admin/ip-blacklist           列出所有黑名單紀錄（含已過期）
 *  GET    /api/admin/ip-blacklist/stats     近 1 小時登入失敗 IP top 20
 *  POST   /api/admin/ip-blacklist           手動加黑 { ip, reason, lockMinutes }
 *  DELETE /api/admin/ip-blacklist/:ip       手動解鎖（直接刪除 row）
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/roleAuth');
const AuditLogService = require('../services/auditLogService');

// 簡單 IPv4 / IPv6 格式檢查（不做 CIDR）
function isValidIp(ip) {
    if (typeof ip !== 'string' || ip.length === 0 || ip.length > 64) return false;
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    return ipv4.test(ip) || ipv6.test(ip);
}

// GET / — 列出所有黑名單（依 updated_at 倒序）
router.get('/', requireRole('系統管理員'), async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT ip, locked_until, reason, offense_count,
                    first_offense_at, last_offense_at, created_at, updated_at,
                    CASE
                        WHEN locked_until IS NULL THEN 'permanent'
                        WHEN locked_until > NOW() THEN 'active'
                        ELSE 'expired'
                    END AS status
             FROM ip_blacklist
             ORDER BY updated_at DESC
             LIMIT 500`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[Admin/IPBlacklist] list error:', err);
        res.status(500).json({ success: false, message: '取得黑名單失敗' });
    }
});

// GET /stats — 近 1 小時登入失敗 IP top 20（提前預警）
router.get('/stats', requireRole('系統管理員'), async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT ip, COUNT(*)::int AS failed_count,
                    MIN(attempt_at) AS first_attempt,
                    MAX(attempt_at) AS last_attempt
             FROM ip_login_attempts
             WHERE attempt_at > NOW() - INTERVAL '1 hour'
             GROUP BY ip
             ORDER BY failed_count DESC
             LIMIT 20`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[Admin/IPBlacklist] stats error:', err);
        res.status(500).json({ success: false, message: '取得失敗 IP 統計失敗' });
    }
});

// POST / — 手動加黑
router.post('/', requireRole('系統管理員'), async (req, res) => {
    const { ip, reason, lockMinutes } = req.body || {};

    if (!isValidIp(ip)) {
        return res.status(400).json({ success: false, message: 'IP 格式錯誤' });
    }
    if (!reason || typeof reason !== 'string' || reason.length > 200) {
        return res.status(400).json({ success: false, message: '請填寫封鎖原因（200 字內）' });
    }
    // lockMinutes: null/undefined = 永久；否則必須為 1 ~ 7 天
    let minutes = null;
    if (lockMinutes !== null && lockMinutes !== undefined) {
        const n = Number(lockMinutes);
        if (!Number.isInteger(n) || n < 1 || n > 7 * 24 * 60) {
            return res.status(400).json({ success: false, message: '鎖定時長需為 1 ~ 10080 分鐘，或留空代表永久' });
        }
        minutes = n;
    }

    try {
        await db.query(
            `INSERT INTO ip_blacklist (ip, locked_until, reason, offense_count, first_offense_at, last_offense_at, updated_at)
             VALUES ($1,
                     CASE WHEN $2::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + ($2 || ' minutes')::interval END,
                     $3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (ip) DO UPDATE SET
                 locked_until = CASE WHEN $2::int IS NULL THEN NULL
                                     ELSE CURRENT_TIMESTAMP + ($2 || ' minutes')::interval END,
                 reason = $3,
                 last_offense_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP`,
            [ip, minutes, `MANUAL: ${reason}`]
        );

        try {
            await AuditLogService.log({
                action: 'IP_MANUAL_BLOCK',
                resourceType: 'ip_blacklist',
                resourceId: ip,
                details: { reason, lockMinutes: minutes, by: req.user?.username || 'unknown' },
                req,
            });
        } catch (e) { /* ignore audit failure */ }

        res.json({ success: true, message: minutes === null ? `已永久封鎖 ${ip}` : `已封鎖 ${ip}（${minutes} 分鐘）` });
    } catch (err) {
        console.error('[Admin/IPBlacklist] manual block error:', err);
        res.status(500).json({ success: false, message: '手動加黑失敗' });
    }
});

// DELETE /:ip — 手動解鎖
router.delete('/:ip', requireRole('系統管理員'), async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIp(ip)) {
        return res.status(400).json({ success: false, message: 'IP 格式錯誤' });
    }
    try {
        const result = await db.query(`DELETE FROM ip_blacklist WHERE ip = $1`, [ip]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: '該 IP 不在黑名單中' });
        }

        try {
            await AuditLogService.log({
                action: 'IP_MANUAL_UNBLOCK',
                resourceType: 'ip_blacklist',
                resourceId: ip,
                details: { by: req.user?.username || 'unknown' },
                req,
            });
        } catch (e) { /* ignore */ }

        res.json({ success: true, message: `已解除封鎖 ${ip}` });
    } catch (err) {
        console.error('[Admin/IPBlacklist] unblock error:', err);
        res.status(500).json({ success: false, message: '解除封鎖失敗' });
    }
});

module.exports = router;
