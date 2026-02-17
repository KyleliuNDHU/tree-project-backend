/**
 * 角色階層權限系統 (RBAC)
 * 
 * 角色層級（數字越大權限越高）：
 *   Level 5: 系統管理員 — 全域最高權限（備份/還原/用戶管理/所有專案）
 *   Level 4: 業務管理員 — 用戶管理/專案管理/所有專案資料
 *   Level 3: 專案管理員 — 管理自己負責的專案（邊界/區域/刪除樹木）
 *   Level 2: 調查管理員 — 新增/編輯樹木、匯入匯出（限自己的專案）
 *   Level 1: 一般使用者 — 僅查看自己專案的資料
 * 
 * 使用方式：
 *   const { requireRole } = require('../middleware/roleAuth');
 *   router.post('/backup', requireRole('系統管理員'), handler);
 *   router.post('/users', requireRole('業務管理員'), handler);  // 業務管理員以上
 *   router.delete('/tree/:id', requireRole('專案管理員'), handler);  // 專案管理員以上
 */

const ROLE_HIERARCHY = {
    '系統管理員': 5,
    '業務管理員': 4,
    '專案管理員': 3,
    '調查管理員': 2,
    '一般使用者': 1,
};

/**
 * 取得角色層級數字
 * @param {string} role - 角色名稱
 * @returns {number} 層級（0 = 未知角色）
 */
function getRoleLevel(role) {
    return ROLE_HIERARCHY[role] || 0;
}

/**
 * 檢查角色是否大於等於指定層級
 * @param {string} userRole - 使用者角色
 * @param {string} requiredRole - 最低要求角色
 * @returns {boolean}
 */
function hasMinimumRole(userRole, requiredRole) {
    return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

/**
 * 角色權限中間件工廠
 * 產生一個中間件，要求使用者角色 >= 指定的最低角色
 * 
 * 也支援 X-Admin-Token（僅透過 Header，給腳本/API 使用，視為系統管理員）
 * 
 * @param {string} minimumRole - 最低要求角色
 * @returns {Function} Express 中間件
 */
function requireRole(minimumRole) {
    return (req, res, next) => {
        // 1. X-Admin-Token 驗證（僅 Header，不接受 query string 避免 token 洩漏）
        const token = req.headers['x-admin-token'];
        const validToken = process.env.ADMIN_API_TOKEN;
        if (token && validToken && safeCompare(token, validToken)) {
            req.isAdmin = true;
            return next();
        }

        // 2. JWT 使用者角色檢查
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                message: '未授權：請先登入'
            });
        }

        const userRole = req.user.role;
        if (!hasMinimumRole(userRole, minimumRole)) {
            return res.status(403).json({
                success: false,
                message: `權限不足：此操作需要「${minimumRole}」以上的角色`
            });
        }

        // isAdmin 僅對專案管理員以上設為 true
        req.isAdmin = getRoleLevel(userRole) >= getRoleLevel('專案管理員');
        next();
    };
}

/**
 * 常數時間字串比較，防止 timing attack
 */
function safeCompare(a, b) {
    const crypto = require('crypto');
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) {
        // 長度不同時仍做一次比較避免洩漏長度資訊
        const dummy = Buffer.alloc(a.length, 0);
        crypto.timingSafeEqual(dummy, Buffer.from(a));
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {
    ROLE_HIERARCHY,
    getRoleLevel,
    hasMinimumRole,
    requireRole,
};
