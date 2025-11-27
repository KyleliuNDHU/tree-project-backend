const adminAuth = (req, res, next) => {
    // 1. Token-based auth (Header or Query) - For scripts/API calls
    const token = req.headers['x-admin-token'] || req.query.admin_token;
    const validToken = process.env.ADMIN_API_TOKEN; // Should be set in .env

    if (token && validToken && token === validToken) {
        req.isAdmin = true;
        return next();
    }

    // 2. Session-based auth (Cookie) - For legacy web panel
    // Assuming session middleware sets req.session.user
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        req.isAdmin = true;
        return next();
    }

    // Auth failed
    return res.status(401).json({
        success: false,
        message: 'Unauthorized: Admin access required'
    });
};

module.exports = adminAuth;
