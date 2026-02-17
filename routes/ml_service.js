/**
 * ML Service 代理路由
 * 
 * 提供後端代理 ML Service 的端點，讓前端可以:
 * 1. 透過後端取得 ML 服務狀態
 * 2. 取得 ML 模型設定和可用精度模式
 * 3. 管理員檢視 ML 服務詳細資訊
 * 
 * 所有路由需要 JWT 認證（透過 app.js 中的 jwtAuth 中介層）
 */

const express = require('express');
const router = express.Router();

// ============================================================
// Helper: 呼叫 ML Service
// ============================================================

/**
 * 向 ML Service 發送 GET 請求
 * @param {string} path - API 路徑 (例如 '/health', '/config')
 * @returns {Promise<object|null>} 回應資料或 null
 */
async function fetchFromMlService(path) {
    const mlUrl = process.env.ML_SERVICE_URL;
    if (!mlUrl) {
        return null;
    }

    // 移除尾部 /api/v1 如果存在（因為 ML_SERVICE_URL 可能是完整路徑也可能不是）
    let baseUrl = mlUrl.replace(/\/+$/, '');
    if (!baseUrl.includes('/api/v1')) {
        baseUrl = `${baseUrl}/api/v1`;
    }

    const url = `${baseUrl}${path}`;
    const headers = {};

    const mlApiKey = process.env.ML_API_KEY;
    if (mlApiKey) {
        headers['X-ML-API-Key'] = mlApiKey;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.error(`[ML Proxy] ${path} returned ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`[ML Proxy] ${path} request timed out`);
        } else {
            console.error(`[ML Proxy] ${path} error:`, err.message);
        }
        return null;
    }
}


// ============================================================
// GET /api/ml-service/status
// 取得 ML Service 健康狀態
// ============================================================

router.get('/status', async (req, res) => {
    try {
        const mlUrl = process.env.ML_SERVICE_URL;

        if (!mlUrl) {
            return res.json({
                success: true,
                configured: false,
                message: 'ML Service 未設定 (ML_SERVICE_URL 環境變數未設定)',
            });
        }

        const health = await fetchFromMlService('/health');

        if (!health) {
            return res.json({
                success: true,
                configured: true,
                online: false,
                message: 'ML Service 無法連線',
            });
        }

        return res.json({
            success: true,
            configured: true,
            online: true,
            health,
        });
    } catch (err) {
        console.error('[ML Proxy] /status error:', err);
        return res.status(500).json({
            success: false,
            message: '檢查 ML Service 狀態時發生錯誤',
        });
    }
});


// ============================================================
// GET /api/ml-service/config
// 取得 ML Service 模型設定和可用精度模式
// ============================================================

router.get('/config', async (req, res) => {
    try {
        const mlUrl = process.env.ML_SERVICE_URL;

        if (!mlUrl) {
            return res.json({
                success: false,
                message: 'ML Service 未設定',
            });
        }

        const config = await fetchFromMlService('/config');

        if (!config) {
            return res.json({
                success: false,
                message: 'ML Service 無法連線或 /config 端點不可用',
            });
        }

        return res.json({
            success: true,
            config,
        });
    } catch (err) {
        console.error('[ML Proxy] /config error:', err);
        return res.status(500).json({
            success: false,
            message: '取得 ML Service 設定時發生錯誤',
        });
    }
});


module.exports = router;
