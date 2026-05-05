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
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024,
        files: 5,
    },
    fileFilter: (_req, file, cb) => {
        const mimetype = (file.mimetype || '').toLowerCase();
        if (mimetype.startsWith('image/') || mimetype === 'application/octet-stream') {
            cb(null, true);
        } else {
            cb(new Error('只接受圖片檔案'));
        }
    },
});

// ============================================================
// Helper: 呼叫 ML Service
// ============================================================

function getMlApiBaseUrl() {
    const mlUrl = process.env.ML_SERVICE_URL;
    if (!mlUrl) return null;

    let baseUrl = mlUrl.replace(/\/+$/, '');
    if (!baseUrl.includes('/api/v1')) {
        baseUrl = `${baseUrl}/api/v1`;
    }
    return baseUrl;
}

function getMlHeaders(extraHeaders = {}) {
    const headers = {
        'ngrok-skip-browser-warning': 'true',
        ...extraHeaders,
    };

    const mlApiKey = process.env.ML_API_KEY;
    if (mlApiKey) {
        headers['X-ML-API-Key'] = mlApiKey;
    }
    return headers;
}

function wrapMulter(uploadHandler) {
    return (req, res, next) => {
        uploadHandler(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: '圖片大小超過限制（最大 25MB）',
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: `上傳錯誤: ${err.message}`,
                });
            }
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message || '圖片上傳失敗',
                });
            }
            next();
        });
    };
}

function appendRequestFields(formData, body) {
    for (const [key, value] of Object.entries(body || {})) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item !== undefined && item !== null) {
                    formData.append(key, String(item));
                }
            });
        } else {
            formData.append(key, String(value));
        }
    }
}

function inferImageContentType(file) {
    const mimetype = (file.mimetype || '').toLowerCase();
    if (mimetype.startsWith('image/')) return mimetype;

    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        case 'heic':
        case 'heif':
            return 'image/heic';
        case 'gif':
            return 'image/gif';
        default:
            break;
    }

    const buffer = file.buffer || Buffer.alloc(0);
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
        return 'image/png';
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
        if (brand.startsWith('heic') || brand.startsWith('heif') || brand.startsWith('mif1')) {
            return 'image/heic';
        }
    }

    return 'image/jpeg';
}

function appendImageFile(formData, fieldName, file) {
    formData.append(fieldName, file.buffer, {
        filename: file.originalname || `${fieldName}.jpg`,
        contentType: inferImageContentType(file),
        knownLength: file.size,
    });
}

async function postMultipartToMlService(path, formData, timeoutMs) {
    const baseUrl = getMlApiBaseUrl();
    if (!baseUrl) return { configured: false };

    const response = await axios.post(`${baseUrl}${path}`, formData, {
        headers: getMlHeaders(formData.getHeaders()),
        timeout: timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
    });
    return { configured: true, response };
}

function sendMlResponse(res, mlResult, path) {
    if (!mlResult.configured) {
        return res.status(503).json({
            success: false,
            message: 'ML Service 未設定 (ML_SERVICE_URL 環境變數未設定)',
        });
    }

    const { response } = mlResult;
    if (response.status >= 400) {
        console.error(`[ML Proxy] ${path} returned ${response.status}`);
    }

    if (response.data && typeof response.data === 'object') {
        return res.status(response.status).json(response.data);
    }
    return res.status(response.status).send(response.data);
}

function createSingleImageProxy(path, timeoutMs) {
    return async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: '請上傳圖片',
                });
            }

            const formData = new FormData();
            appendImageFile(formData, 'image', req.file);
            appendRequestFields(formData, req.body);

            const mlResult = await postMultipartToMlService(path, formData, timeoutMs);
            return sendMlResponse(res, mlResult, path);
        } catch (err) {
            console.error(`[ML Proxy] ${path} error:`, err.message);
            return res.status(502).json({
                success: false,
                message: 'ML Service 代理請求失敗',
            });
        }
    };
}

/**
 * 向 ML Service 發送 GET 請求
 * @param {string} path - API 路徑 (例如 '/health', '/config')
 * @returns {Promise<object|null>} 回應資料或 null
 */
async function fetchFromMlService(path) {
    const baseUrl = getMlApiBaseUrl();
    if (!baseUrl) return null;

    const url = `${baseUrl}${path}`;
    const headers = getMlHeaders();

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
// 取得 ML Service 健康狀態與連線設定 (App 自動抓取)
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

        // 派發 ML 設定給前端 App。
        // ML_SERVICE_PUBLIC_URL: 給 App 用的手機可達 URL（Tailscale/LAN/HTTPS）
        // ML_SERVICE_URL: 給後端 proxy 用的內部 URL
        const publicUrl = process.env.ML_SERVICE_PUBLIC_URL || mlUrl;
        return res.json({
            success: true,
            configured: true,
            ml_service_url: publicUrl,
            online: true,
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
// GET /api/ml-service/health
// App DBH client 用此檢查 ML service；仍由後端注入 ML_API_KEY
// ============================================================

router.get('/health', async (req, res) => {
    try {
        const health = await fetchFromMlService('/health');
        if (!health) {
            return res.status(503).json({
                status: 'error',
                success: false,
                message: 'ML Service 無法連線或 /health 端點不可用',
            });
        }
        return res.json(health);
    } catch (err) {
        console.error('[ML Proxy] /health error:', err);
        return res.status(500).json({
            status: 'error',
            success: false,
            message: '檢查 ML Service 健康狀態時發生錯誤',
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


// ============================================================
// Multipart proxy endpoints for DBH measurement
// 手機只帶 App JWT，ML_API_KEY 保留在後端環境變數中。
// ============================================================

router.post(
    '/measure-dbh',
    wrapMulter(upload.single('image')),
    createSingleImageProxy('/measure-dbh', 130000)
);

router.post(
    '/auto-measure-dbh',
    wrapMulter(upload.single('image')),
    createSingleImageProxy('/auto-measure-dbh', 130000)
);

router.post(
    '/debug/depth-at-point',
    wrapMulter(upload.single('image')),
    createSingleImageProxy('/debug/depth-at-point', 40000)
);

router.post(
    '/auto-measure-dbh-multi',
    wrapMulter(upload.array('images', 5)),
    async (req, res) => {
        try {
            const files = Array.isArray(req.files) ? req.files : [];
            if (files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: '請上傳至少一張圖片',
                });
            }

            const formData = new FormData();
            files.forEach((file) => appendImageFile(formData, 'images', file));
            appendRequestFields(formData, req.body);

            const mlResult = await postMultipartToMlService('/auto-measure-dbh-multi', formData, 310000);
            return sendMlResponse(res, mlResult, '/auto-measure-dbh-multi');
        } catch (err) {
            console.error('[ML Proxy] /auto-measure-dbh-multi error:', err.message);
            return res.status(502).json({
                success: false,
                message: 'ML Service 代理請求失敗',
            });
        }
    }
);


module.exports = router;
