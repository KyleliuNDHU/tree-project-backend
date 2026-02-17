const crypto = require('crypto');

/**
 * 常數時間字串比較，防止 timing attack
 */
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) {
        const dummy = Buffer.alloc(a.length, 0);
        crypto.timingSafeEqual(dummy, Buffer.from(a));
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const adminAuth = (req, res, next) => {
    // 1. X-Admin-Token 驗證（僅 Header，不接受 query string）
    const token = req.headers['x-admin-token'];
    const validToken = process.env.ADMIN_API_TOKEN;

    if (token && validToken && safeCompare(token, validToken)) {
        req.isAdmin = true;
        return next();
    }

    // 2. JWT — 使用 jwtAuth 中間件已解析的 req.user
    //    不再重複解析 JWT，直接檢查角色
    if (req.user && req.user.role) {
        const adminRoles = ['系統管理員', '業務管理員', '專案管理員'];
        if (adminRoles.includes(req.user.role)) {
            req.isAdmin = true;
            return next();
        }
    }

    return res.status(401).json({
        success: false,
        message: '未授權：需要管理員權限'
    });
};

module.exports = adminAuth;
