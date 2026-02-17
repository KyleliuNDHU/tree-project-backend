const jwt = require('jsonwebtoken');

const adminAuth = (req, res, next) => {
    // 1. Token-based auth (Header or Query) - For scripts/API calls
    const token = req.headers['x-admin-token'] || req.query.admin_token;
    const validToken = process.env.ADMIN_API_TOKEN;

    if (token && validToken && token === validToken) {
        req.isAdmin = true;
        return next();
    }

    // 2. JWT-based auth — check if decoded JWT has admin role
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.slice(7).trim();
        const secret = process.env.JWT_SECRET;
        if (jwtToken && secret) {
            try {
                const decoded = jwt.verify(jwtToken, secret);
                const adminRoles = ['系統管理員', '業務管理員', '專案管理員', '調查管理員'];
                if (decoded.role && adminRoles.includes(decoded.role)) {
                    req.isAdmin = true;
                    req.user = decoded;
                    return next();
                }
            } catch (err) {
                // JWT invalid or expired — fall through
            }
        }
    }

    // Auth failed
    return res.status(401).json({
        success: false,
        message: 'Unauthorized: Admin access required'
    });
};

module.exports = adminAuth;
