/**
 * IP Blacklist Guard middleware (T8.2)
 *
 * 在所有 API route 之前掛載；命中黑名單回 403。
 * 開發環境可用 `DISABLE_IP_GUARD=true` 旁路。
 */

const { isBlocked } = require('../services/ipBlacklistService');

async function ipBlacklistGuard(req, res, next) {
    if (process.env.DISABLE_IP_GUARD === 'true') {
        return next();
    }

    const ip = req.ip;
    if (!ip) return next();

    try {
        const result = await isBlocked(ip);
        if (!result.blocked) {
            return next();
        }

        const message = result.permanent
            ? '此 IP 已被永久封鎖，請聯繫管理員。'
            : `此 IP 因可疑流量已被暫時封鎖，請於 ${new Date(result.until).toLocaleString('zh-TW')} 後再試。`;

        return res.status(403).json({
            success: false,
            message,
            permanent: result.permanent,
            until: result.until,
        });
    } catch (err) {
        // 出錯時不擋 → 不要讓 guard 自己變成 DoS 來源
        console.error('[IPBlacklistGuard] error:', err.message);
        return next();
    }
}

module.exports = { ipBlacklistGuard };
