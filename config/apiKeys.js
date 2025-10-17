const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// API 密鑰存儲路徑
const API_KEYS_FILE = path.join(__dirname, '../data/apiKeys.json');

// 確保 data 目錄存在
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 確保 API 密鑰文件存在
if (!fs.existsSync(API_KEYS_FILE)) {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify({
        keys: []
    }), 'utf8');
}

// 讀取現有的 API 密鑰
const readApiKeys = () => {
    try {
        const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('讀取 API 密鑰文件時出錯:', error);
        return { keys: [] };
    }
};

// 寫入 API 密鑰
const writeApiKeys = (apiKeys) => {
    try {
        fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apiKeys, null, 2), 'utf8');
    } catch (error) {
        console.error('寫入 API 密鑰文件時出錯:', error);
    }
};

// 生成新的 API 密鑰
const generateApiKey = (name, permissions = ['read']) => {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeys = readApiKeys();
    
    apiKeys.keys.push({
        id: crypto.randomUUID(),
        name,
        key: apiKey,
        permissions,
        createdAt: new Date().toISOString(),
        lastUsed: null
    });
    
    writeApiKeys(apiKeys);
    return apiKey;
};

// 驗證 API 密鑰
const validateApiKey = (apiKey, requiredPermission = 'read') => {
    const apiKeys = readApiKeys();
    const keyData = apiKeys.keys.find(k => k.key === apiKey);
    
    if (!keyData) {
        return false;
    }
    
    // 檢查權限
    if (!keyData.permissions.includes(requiredPermission)) {
        return false;
    }
    
    // 更新最後使用時間
    keyData.lastUsed = new Date().toISOString();
    writeApiKeys(apiKeys);
    
    return true;
};

// 刪除 API 密鑰
const deleteApiKey = (apiKeyId) => {
    const apiKeys = readApiKeys();
    const index = apiKeys.keys.findIndex(k => k.id === apiKeyId);
    
    if (index === -1) {
        return false;
    }
    
    apiKeys.keys.splice(index, 1);
    writeApiKeys(apiKeys);
    return true;
};

// 列出所有 API 密鑰（不包含實際密鑰值）
const listApiKeys = () => {
    const apiKeys = readApiKeys();
    return apiKeys.keys.map(k => ({
        id: k.id,
        name: k.name,
        permissions: k.permissions,
        createdAt: k.createdAt,
        lastUsed: k.lastUsed
    }));
};

// 中間件：驗證 API 密鑰
const apiKeyMiddleware = (req, res, next) => {
    // 暫時禁用 API 密鑰驗證，便於測試
    return next();
    
    // 跳過特定路徑的驗證（如登入）
    const skipPaths = ['/login', '/api/login', '/api/register', '/api/reports/sustainability', '/api/admin/apikeys'];
    if (skipPaths.includes(req.path)) {
        return next();
    }
    
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            message: '缺少 API 密鑰'
        });
    }
    
    // 根據請求路徑和方法決定所需權限
    let requiredPermission = 'read';
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        requiredPermission = 'write';
    }
    
    if (!validateApiKey(apiKey, requiredPermission)) {
        return res.status(403).json({
            success: false,
            message: '無效的 API 密鑰或權限不足'
        });
    }
    
    next();
};

module.exports = {
    generateApiKey,
    validateApiKey,
    deleteApiKey,
    listApiKeys,
    apiKeyMiddleware
}; 