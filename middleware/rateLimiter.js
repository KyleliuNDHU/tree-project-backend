const rateLimit = require('express-rate-limit');

// 通用 API 速率限制: 允許使用者在短時間內進行多次普通操作
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 500, // 在 15 分鐘內最多允許 500 次請求
    message: {
        success: false,
        message: '您的請求過於頻繁，請稍後再試。'
    },
    standardHeaders: true, // 回傳速率限制資訊到 `RateLimit-*` headers
    legacyHeaders: false, // 禁用 'X-RateLimit-*' headers
});

// 登入嘗試限制: 嚴格限制以防止暴力破解
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    max: 10, // 每小時最多允許 10 次登入嘗試
    message: {
        success: false,
        message: '登入嘗試次數過多，您的帳號已被暫時鎖定一小時。'
    }
});

// AI 相關路由的速率限制: 平衡使用與成本控制
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    max: 30, // 每小時最多允許 30 次 AI 相關請求
    message: {
        success: false,
        message: 'AI 相關功能請求過於頻繁，請一小時後再試。'
    }
});

module.exports = {
    apiLimiter,
    loginLimiter,
    aiLimiter
};
