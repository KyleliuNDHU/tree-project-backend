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

module.exports = {
    generateApiKey,
    validateApiKey,
    deleteApiKey,
    listApiKeys
};