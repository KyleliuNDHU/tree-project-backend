require('dotenv').config();

// 添加環境變量調試日誌
console.log('Environment variables loaded:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('PORT:', process.env.PORT);

const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { exec } = require('child_process');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { generateSustainabilityReport, predictGrowthTrend } = require('./controllers/aiController');
const helmet = require('helmet');
const reportController = require('./controllers/reportController');
const apiKeys = require('./config/apiKeys');
const aiReportController = require('./controllers/aiReportController');
const multer = require('multer');
const xlsx = require('xlsx');
const treeController = require('./controllers/treeController');
const openaiController = require('./controllers/openaiController');
const carbonSinkController = require('./controllers/carbonSinkController');
const knowledgeController = require('./controllers/knowledgeController');
const turf = require('@turf/turf');
const http = require('http');
const { getSimilarPassages } = require('./services/knowledgeEmbeddingService');
const treeManagementController = require('./controllers/treeManagementController'); // 引入新的 Controller
const { generateGeminiChatResponse, DEFAULT_MODEL_NAME: DEFAULT_GEMINI_MODEL } = require('./services/geminiService'); // 引入 Gemini 服務

// 新增：引入 Anthropic SDK
const Anthropic = require('@anthropic-ai/sdk');

// 載入環境變量
//dotenv.config();

// 設置速率限制
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 100, // 每 15 分鐘最多 100 次請求
    message: {
        success: false,
        message: '請求過於頻繁，請稍後再試'
    },
    skip: (req) => req.ip === '127.0.0.1' || req.ip.startsWith('192.168.')
});

// 登入嘗試限制
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    max: 5, // 每小時最多 5 次登入嘗試
    message: {
        success: false,
        message: '登入嘗試次數過多，請一小時後再試'
    }
});

// 只針對 AI 路由
const aiLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30分鐘
    max: 30, // 30分鐘內最多30次
    message: {
        success: false,
        message: 'AI請求過於頻繁，請稍後再試'
    }
});

// 檢查 .env 文件是否存在
const envPath = path.join(__dirname, '.env');
console.log('正在檢查 .env 文件：', envPath);
if (fs.existsSync(envPath)) {
    console.log('.env 文件存在');
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('.env 文件內容：');
    console.log(envContent);
} else {
    console.error('.env 文件不存在！');
}

require('dotenv').config({ path: envPath });

// 檢查必要的環境變數
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

// 特別檢查 DB_PASSWORD - 允許空密碼（XAMPP 預設配置）
if (process.env.DB_PASSWORD === undefined) {
    missingEnvVars.push('DB_PASSWORD');
}

if (missingEnvVars.length > 0) {
    console.error('錯誤：缺少必要的環境變數：', missingEnvVars.join(', '));
    console.error('請確認 .env 文件是否存在於正確位置：', envPath);
    console.error('請確認 .env 文件內容是否正確，應包含以下變數：');
    console.error('DB_HOST=localhost');
    console.error('DB_USER=root');
    console.error('DB_PASSWORD=  # XAMPP 預設為空密碼');
    console.error('DB_NAME=tree_data');
    process.exit(1);
}

// 輸出環境變數（僅用於調試）
console.log('環境變數檢查：');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '已設置' : '未設置');

const app = express();
app.use(express.json());
// app.use(apiLimiter); // 移除全域速率限制

// 設定 CORS
app.use(cors({
    origin: '*', // 允許所有來源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 允許的 HTTP 方法
    allowedHeaders: ['Content-Type', 'Authorization'], // 允許的請求標頭
    credentials: true // 允許攜帶認證資訊
}));

// 添加 Helmet 中間件增強安全性
app.use(helmet());

// 添加請求大小限制
app.use(express.json({ limit: '10kb' })); // 限制請求體大小為 10KB

// 添加 API 密鑰驗證中間件
app.use('/api', apiKeys.apiKeyMiddleware);

// 添加基本的 XSS 防護
app.use((req, res, next) => {
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

// 應用不同的速率限制到不同的路由
// app.use('/api/', apiLimiter); // 移除全域速率限制
app.use('/login', loginLimiter); // 登入特別限制

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// 測試資料庫連接
db.connect((err) => {
    if (err) {
        console.error('無法連線到資料庫:', err);
        process.exit(1);
    }
    console.log('成功連線到 MySQL 資料庫!');
    
    // 測試查詢
    db.query('SELECT COUNT(*) as count FROM tree_survey', (err, results) => {
        if (err) {
            console.error('查詢測試失敗:', err);
            process.exit(1);
        }
        console.log('資料庫查詢測試成功!');
        console.log('目前資料庫中有', results[0].count, '筆樹木資料');
    });
});

// 處理資料庫連接錯誤
db.on('error', (err) => {
    console.error('資料庫錯誤:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('資料庫連接已斷開，嘗試重新連接...');
        db.connect();
    } else {
        throw err;
    }
});

// 測試API
app.get('/', (req, res) => {
    res.send('Hello, Tree API 運作中!');
});

// 取得樹木資料
app.get('/api/tree_survey', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_survey 的請求`); 
    db.query('SELECT * FROM tree_survey', (err, results) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] 資料庫錯誤 GET /api/tree_survey:`, err); 
            return res.status(500).send('查詢資料庫時發生錯誤');
        }
        res.json(results);
    });
});

// 新增樹木資料（維持原有結構）
app.post('/api/tree_survey', (req, res) => {
    const fields = {
        專案區位: req.body.專案區位 || '無',
        專案代碼: req.body.專案代碼 || '無',
        專案名稱: req.body.專案名稱 || '無',
        系統樹木: req.body.系統樹木 || '無',
        專案樹木: req.body.專案樹木 || '無',
        樹種編號: req.body.樹種編號 || '無',
        樹種名稱: req.body.樹種名稱 || '無',
        X坐標: req.body.X坐標 || 0,
        Y坐標: req.body.Y坐標 || 0,
        狀況: req.body.狀況 || '無',
        註記: req.body.註記 || '無',
        樹木備註: req.body.樹木備註 || '無',
        樹高公尺: req.body["樹高（公尺）"] || 0,
        胸徑公分: req.body["胸徑（公分）"] || 0,
        調查備註: req.body.調查備註 || '無',
        調查時間: req.body.調查時間 || new Date().toISOString(),
        碳儲存量: req.body.碳儲存量 || 0,
        推估年碳吸存量: req.body.推估年碳吸存量 || 0
    };

    const sql = `
        INSERT INTO tree_survey 
        (\`專案區位\`, \`專案代碼\`, \`專案名稱\`, \`系統樹木\`, \`專案樹木\`, \`樹種編號\`, 
        \`樹種名稱\`, \`X坐標\`, \`Y坐標\`, \`狀況\`, \`註記\`, \`樹木備註\`, \`樹高（公尺）\`, 
        \`胸徑（公分）\`, \`調查備註\`, \`調查時間\`, \`碳儲存量\`, \`推估年碳吸存量\`) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, Object.values(fields), (err, results) => {
        if (err) {
            console.error('資料庫錯誤:', err);
            res.status(500).send('資料庫插入錯誤');
        } else {
            res.status(200).send('資料插入成功');
        }
    });
});

// 刪除樹木資料
app.delete('/api/tree_survey/:id', (req, res) => {
    const id = req.params.id;
    
    db.query('DELETE FROM tree_survey WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('刪除樹木資料錯誤:', err);
            return res.status(500).json({ 
                success: false, 
                message: '刪除樹木資料失敗'
            });
        }

        if (result.affectedRows > 0) {
            // 刪除成功後，執行清理未使用樹種的函數
            cleanupUnusedSpecies();
            
            // 刪除成功後，執行清理未使用區位的函數
            cleanupUnusedProjectAreas((err, result) => {
                if (err) {
                    console.error('清理未使用區位錯誤:', err);
                }
                console.log('清理未使用區位完成，影響行數:', result ? result.affectedRows : 0);
            });
            
            res.json({
                success: true, 
                message: '樹木資料刪除成功' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: '找不到指定的樹木資料'
            });
        }
    });
});

// 編輯樹木資料
app.put('/api/tree_survey/:id', (req, res) => {
    const id = req.params.id;
    console.log(`[${new Date().toISOString()}] ===> 收到了 PUT /api/tree_survey/${id} 的請求`); 
    console.log('請求內容:', req.body);
    
    const fields = {
        專案區位: req.body.專案區位 || '無',
        專案代碼: req.body.專案代碼 || '無',
        專案名稱: req.body.專案名稱 || '無',
        系統樹木: req.body.系統樹木 || '無',
        專案樹木: req.body.專案樹木 || '無',
        樹種編號: req.body.樹種編號 || '無',
        樹種名稱: req.body.樹種名稱 || '無',
        X坐標: req.body.X坐標 || 0,
        Y坐標: req.body.Y坐標 || 0,
        狀況: req.body.狀況 || '無',
        註記: req.body.註記 || '無',
        樹木備註: req.body.樹木備註 || '無',
        樹高公尺: req.body["樹高（公尺）"] || 0,
        胸徑公分: req.body["胸徑（公分）"] || 0,
        調查備註: req.body.調查備註 || '無',
        調查時間: req.body.調查時間 || new Date().toISOString(),
        碳儲存量: req.body.碳儲存量 || 0,
        推估年碳吸存量: req.body.推估年碳吸存量 || 0
    };

    const sql = `
        UPDATE tree_survey SET
        \`專案區位\`=?, \`專案代碼\`=?, \`專案名稱\`=?, \`系統樹木\`=?, \`專案樹木\`=?, \`樹種編號\`=?, 
        \`樹種名稱\`=?, \`X坐標\`=?, \`Y坐標\`=?, \`狀況\`=?, \`註記\`=?, \`樹木備註\`=?, \`樹高（公尺）\`=?,
        \`胸徑（公分）\`=?, \`調查備註\`=?, \`調查時間\`=?, \`碳儲存量\`=?, \`推估年碳吸存量\`=?
        WHERE id=?
    `;

    const values = [
        fields.專案區位, fields.專案代碼, fields.專案名稱, fields.系統樹木, fields.專案樹木,
        fields.樹種編號, fields.樹種名稱, fields.X坐標, fields.Y坐標, fields.狀況, 
        fields.註記, fields.樹木備註, fields.樹高公尺, fields.胸徑公分, fields.調查備註, 
        fields.調查時間, fields.碳儲存量, fields.推估年碳吸存量, id
    ];

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] 更新錯誤:`, err);
            return res.status(500).json({ 
                success: false, 
                message: '更新資料時發生錯誤' 
            });
        }

        if (results.affectedRows > 0) {
            res.status(200).json({ 
                success: true, 
                message: '樹木資料更新成功' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: '找不到要更新的樹木資料' 
            });
        }
    });
});

// 登入路由
app.post('/login', async (req, res) => {
    const { account, password, loginType } = req.body;

    if (!account || !password) {
        return res.status(400).json({ 
            success: false, 
            message: '請提供帳號和密碼' 
        });
    }

    try {
        // 根據登入類型檢查權限
        let roleCheck = '';
        if (loginType === 'admin') {
            roleCheck = ' AND role = "系統管理員"';
        }

        const query = 'SELECT user_id, username, password_hash, display_name, role, associated_projects, is_active FROM users WHERE username = ?' + roleCheck;
        
        db.query(query, [account], async (err, results) => {
            if (err) {
                console.error('資料庫查詢錯誤:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: '資料庫查詢錯誤' 
                });
            }

            if (results.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: loginType === 'admin' ? '無管理員權限' : '帳號不存在'
                });
            }

            const user = results[0];
            
            // 檢查帳號是否已被禁用
            if (user.is_active === 0) { 
                return res.status(403).json({
                    success: false,
                    message: '您的帳號已被禁用，請聯繫管理員'
                });
            }

            // 檢查登入嘗試次數
            const MAX_LOGIN_ATTEMPTS = 5;
            if (user.login_attempts >= MAX_LOGIN_ATTEMPTS) {
                // 可選：檢查 last_attempt_time 是否在鎖定時間內，例如1小時
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                if (user.last_attempt_time && new Date(user.last_attempt_time) > oneHourAgo) {
                    return res.status(429).json({ // 429 Too Many Requests
                        success: false,
                        message: '登入嘗試次數過多，您的帳號已被暫時鎖定，請稍後再試或聯繫管理員'
                    });
                }
                // 如果超過鎖定時間，允許再次嘗試，但重置計數器可能不是在這裡做，而是在成功登入後
            }
            
            try {
                const isPasswordValid = await bcrypt.compare(password, user.password_hash);
                
                if (!isPasswordValid) {
                    // 密碼錯誤，更新登入嘗試次數
                    const newAttempts = (user.login_attempts || 0) + 1;
                    const updateAttemptsSql = 'UPDATE users SET login_attempts = ?, last_attempt_time = NOW() WHERE user_id = ?';
                    db.query(updateAttemptsSql, [newAttempts, user.user_id], (updateErr) => {
                        if (updateErr) {
                            console.error('更新登入嘗試次數錯誤:', updateErr);
                            // 即使更新失敗，也應返回密碼錯誤的訊息
                        }
                    });

                    return res.status(401).json({ 
                        success: false, 
                        message: '密碼錯誤' 
                    });
                }

                // 密碼正確，登入成功
                // 重置登入嘗試次數
                const resetAttemptsQuery = 'UPDATE users SET login_attempts = 0, last_attempt_time = NULL WHERE user_id = ?';
                db.query(resetAttemptsQuery, [user.user_id], (err) => {
                    if (err) {
                        console.error('重置登入嘗試次數錯誤:', err);
                    }
                });

                // 如果是一般使用者登入，檢查是否有關聯專案
                if (loginType !== 'admin' && user.role !== '系統管理員') {
                    if (!user.associated_projects) {
                        return res.status(403).json({
                            success: false,
                            message: '此帳號尚未關聯任何專案，請聯繫管理員'
                        });
                    }
                }

                // 獲取使用者可訪問的專案列表
                let accessibleProjects = [];
                if (user.role === '系統管理員') {
                    // 管理員可以訪問所有專案
                    const projectQuery = 'SELECT DISTINCT 專案代碼, 專案名稱, 專案區位 FROM tree_survey';
                    db.query(projectQuery, [], (err, projectResults) => {
                        if (err) {
                            console.error('獲取專案列表錯誤:', err);
                            accessibleProjects = [];
                        } else {
                            accessibleProjects = projectResults;
                        }
                        
                        // 登入成功，重置嘗試次數
                        const resetAttemptsQuery = 'UPDATE users SET login_attempts = 0, last_attempt_time = NULL WHERE user_id = ?';
                        db.query(resetAttemptsQuery, [user.user_id], (err) => {
                            if (err) {
                                console.error('重置登入嘗試次數錯誤:', err);
                            }
                        });

                        res.status(200).json({
                            success: true,
                            message: '登錄成功',
                            user: {
                                userId: user.user_id,
                                username: user.username,
                                displayName: user.display_name,
                                role: user.role,
                                accessibleProjects: accessibleProjects
                            }
                        });
                    });
                } else {
                    // 一般使用者只能訪問關聯的專案
                        const projectQuery = 'SELECT DISTINCT 專案代碼, 專案名稱, 專案區位 FROM tree_survey WHERE 專案代碼 IN (?)';
                    const projectCodes = user.associated_projects.split(',');
                    
                        db.query(projectQuery, [projectCodes], (err, projectResults) => {
                            if (err) {
                                console.error('獲取專案列表錯誤:', err);
                                accessibleProjects = [];
                            } else {
                                accessibleProjects = projectResults;
                            }

                        // 登入成功，重置嘗試次數
                        const resetAttemptsQuery = 'UPDATE users SET login_attempts = 0, last_attempt_time = NULL WHERE user_id = ?';
                        db.query(resetAttemptsQuery, [user.user_id], (err) => {
                            if (err) {
                                console.error('重置登入嘗試次數錯誤:', err);
                            }
                        });
                            
                            res.status(200).json({
                                success: true,
                                message: '登錄成功',
                                user: {
                                    userId: user.user_id,
                                    username: user.username,
                                    displayName: user.display_name,
                                    role: user.role,
                                    accessibleProjects: accessibleProjects
                                }
                            });
                        });
                }
            } catch (error) {
                console.error('密碼驗證錯誤:', error);
                return res.status(500).json({
                    success: false, 
                    message: '密碼驗證時發生錯誤'
                });
            }
        });
    } catch (error) {
        console.error('登入處理錯誤:', error);
        return res.status(500).json({
            success: false, 
            message: '登入處理時發生錯誤'
        });
    }
});

// 計算永續報告
app.get('/api/sustainability_report', (req, res) => {
    db.query('SELECT SUM(碳儲存量) as total_carbon_storage, SUM(推估年碳吸存量) as total_annual_carbon, COUNT(*) as tree_count, 專案區位 FROM tree_survey GROUP BY 專案區位', (err, results) => {
        if (err) {
            console.error('資料庫錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '無法生成永續報告'
            });
        }

        // 生成報告
        const report = {
            總覽: {
                總碳儲存量: results.reduce((sum, r) => sum + r.total_carbon_storage, 0),
                年總碳吸存量: results.reduce((sum, r) => sum + r.total_annual_carbon, 0),
                總樹木數量: results.reduce((sum, r) => sum + r.tree_count, 0)
            },
            各區域分析: results.map(r => ({
                區域: r.專案區位,
                樹木數量: r.tree_count,
                碳儲存量: r.total_carbon_storage,
                年碳吸存量: r.total_annual_carbon
            }))
        };

        res.json({
            success: true,
            data: report
        });
    });
});

// 計算碳權估算
app.get('/api/carbon_credit_estimation', (req, res) => {
    const CARBON_CREDIT_RATE = 0.05; // 假設每公斤碳吸存量可獲得0.05個碳權
    
    db.query('SELECT 樹種名稱, SUM(推估年碳吸存量) as total_annual_carbon FROM tree_survey GROUP BY 樹種名稱', (err, results) => {
        if (err) {
            console.error('資料庫錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '無法計算碳權估算'
            });
        }

        const estimation = results.map(r => ({
            樹種: r.樹種名稱,
            年碳吸存量: r.total_annual_carbon,
            預估碳權: (r.total_annual_carbon * CARBON_CREDIT_RATE).toFixed(2)
        }));

        res.json({
            success: true,
            data: {
                總預估碳權: estimation.reduce((sum, e) => sum + parseFloat(e.預估碳權), 0).toFixed(2),
                各樹種碳權估算: estimation
            }
        });
    });
});

// 使用者管理相關 API
// 取得使用者列表
app.get('/api/users', (req, res) => {
    db.query('SELECT user_id, username, display_name, role, is_active FROM users', (err, results) => {
        if (err) {
            console.error('取得使用者列表錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '取得使用者列表時發生錯誤'
            });
        }
        res.json({
            success: true,
            users: results
        });
    });
});

// 新增使用者
app.post('/api/users', async (req, res) => {
    const { username, password, display_name, role, associated_projects } = req.body; // 新增 associated_projects
    const isActive = req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0); // 預設為啟用
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: '請提供使用者名稱和密碼'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // 注意：確保您的資料庫 `users` 表有 `associated_projects` 和 `is_active` 欄位
        const sql = 'INSERT INTO users (username, password_hash, display_name, role, associated_projects, is_active) VALUES (?, ?, ?, ?, ?, ?)';
        
        db.query(sql, [username, hashedPassword, display_name || username, role || 'user', associated_projects || null, isActive], (err, results) => {
            if (err) {
                console.error('新增使用者錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '新增使用者時發生錯誤'
                });
            }
            res.status(201).json({
                success: true,
                message: '使用者新增成功'
            });
        });
    } catch (error) {
        console.error('密碼加密錯誤:', error);
        res.status(500).json({
            success: false,
            message: '密碼加密過程發生錯誤'
        });
    }
});

// 修改使用者
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { display_name, role, password, associated_projects, is_active } = req.body; // 新增 associated_projects, is_active
    
    try {
        let sql = 'UPDATE users SET ';
        const values = [];
        const fieldsToUpdate = [];

        if (display_name !== undefined) {
            fieldsToUpdate.push('display_name = ?');
            values.push(display_name);
        }
        if (role !== undefined) {
            fieldsToUpdate.push('role = ?');
            values.push(role);
        }
        if (associated_projects !== undefined) { // 允許更新關聯專案
            fieldsToUpdate.push('associated_projects = ?');
            values.push(associated_projects);
        }
        if (is_active !== undefined) { // 允許透過此API更新啟用狀態
            fieldsToUpdate.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fieldsToUpdate.push('password_hash = ?');
            values.push(hashedPassword);
            // 當密碼被更新時，重置登入嘗試次數和最後嘗試時間
            fieldsToUpdate.push('login_attempts = ?');
            values.push(0);
            fieldsToUpdate.push('last_attempt_time = ?');
            values.push(null);
        }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({
                success: false,
                message: '沒有提供任何要更新的欄位'
            });
        }
        
        sql += fieldsToUpdate.join(', ') + ' WHERE user_id = ?';
        values.push(id);
        
        db.query(sql, values, (err, results) => {
            if (err) {
                console.error('修改使用者錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '修改使用者時發生錯誤'
                });
            }
            res.json({
                success: true,
                message: '使用者修改成功'
            });
        });
    } catch (error) {
        console.error('密碼加密錯誤:', error);
        res.status(500).json({
            success: false,
            message: '密碼加密過程發生錯誤'
        });
    }
});

// 新增 API 端點：切換使用者啟用狀態
app.put('/api/users/:id/status', async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body; // isActive 應為 boolean true/false

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: '請求參數 isActive 必須是布林值'
        });
    }

    // 在實際應用中，這裡應該有權限檢查，確保只有管理員能執行此操作
    // 例如: if (req.user.role !== '系統管理員') { return res.status(403).json(...); }

    const newStatus = isActive ? 1 : 0;

    db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, id], (err, results) => {
        if (err) {
            console.error(`切換使用者 ${id} 狀態錯誤:`, err);
            return res.status(500).json({
                success: false,
                message: '更新使用者狀態時發生資料庫錯誤'
            });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }
        res.json({
            success: true,
            message: `使用者 ${id} 狀態已更新為 ${isActive ? '啟用' : '禁用'}`,
            newStatus: newStatus
        });
    });
});

// 刪除使用者
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM users WHERE user_id = ?', [id], (err, results) => {
        if (err) {
            console.error('刪除使用者錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '刪除使用者時發生錯誤'
            });
        }
        res.json({
            success: true,
            message: '使用者刪除成功'
        });
    });
});

// 資料匯出功能
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// 匯出 Excel
app.get('/api/export/excel', (req, res) => {
    const { project_codes } = req.query; // 只使用 project_codes
    let sql = 'SELECT * FROM tree_survey';
    const params = [];
    let specificProjectsExport = false;
    let singleProjectCodeForName = null;

    if (project_codes) {
        const codesArray = project_codes.split(',').map(code => code.trim()).filter(code => code);
        if (codesArray.length > 0) {
            const numericCodes = codesArray.map(code => parseInt(code, 10)).filter(code => !isNaN(code));
            if (numericCodes.length > 0) {
                sql += ` WHERE 專案代碼 IN (${numericCodes.map(() => '?').join(',')})`;
                params.push(...numericCodes);
                specificProjectsExport = true;
                if (numericCodes.length === 1) {
                    singleProjectCodeForName = numericCodes[0];
                }
            }
        }
    }

    db.query(sql, params, async (err, results) => {
        if (err) {
            console.error('匯出 Excel 錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '匯出 Excel 時發生錯誤'
            });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('樹木調查資料');

        // 設定欄位
        worksheet.columns = [
            { header: '專案區位', key: '專案區位' },
            { header: '專案代碼', key: '專案代碼' },
            { header: '專案名稱', key: '專案名稱' },
            { header: '系統樹木', key: '系統樹木' },
            { header: '專案樹木', key: '專案樹木' },
            { header: '樹種編號', key: '樹種編號' },
            { header: '樹種名稱', key: '樹種名稱' },
            { header: 'X坐標', key: 'X坐標' },
            { header: 'Y坐標', key: 'Y坐標' },
            { header: '狀況', key: '狀況' },
            { header: '註記', key: '註記' },
            { header: '樹木備註', key: '樹木備註' },
            { header: '樹高（公尺）', key: '樹高（公尺）' },
            { header: '胸徑（公分）', key: '胸徑（公分）' },
            { header: '調查備註', key: '調查備註' },
            { header: '調查時間', key: '調查時間' },
            { header: '碳儲存量', key: '碳儲存量' },
            { header: '推估年碳吸存量', key: '推估年碳吸存量' }
        ];

        // 加入資料
        worksheet.addRows(results);

        // 設定回應標頭
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let fileName = `tree_survey_${specificProjectsExport ? (singleProjectCodeForName ? `project_${singleProjectCodeForName}` : 'selected') : 'all'}_export_${timestamp}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // 寫入回應
        await workbook.xlsx.write(res);
        res.end();
    });
});

// 匯出 PDF
app.get('/api/export/pdf', (req, res) => {
    const { project_codes } = req.query; // 只使用 project_codes
    let sql = 'SELECT * FROM tree_survey';
    const params = [];
    let specificProjectsExport = false;
    let singleProjectCodeForName = null;

    if (project_codes) {
        const codesArray = project_codes.split(',').map(code => code.trim()).filter(code => code);
        if (codesArray.length > 0) {
            const numericCodes = codesArray.map(code => parseInt(code, 10)).filter(code => !isNaN(code));
            if (numericCodes.length > 0) {
                sql += ` WHERE 專案代碼 IN (${numericCodes.map(() => '?').join(',')})`;
                params.push(...numericCodes);
                specificProjectsExport = true;
                if (numericCodes.length === 1) {
                    singleProjectCodeForName = numericCodes[0];
                }
            }
        }
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('匯出 PDF 錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '匯出 PDF 時發生錯誤'
            });
        }

        const doc = new PDFDocument();
        
        // 設定中文字型
        // 確保 NotoSansTC-VariableFont_wght.ttf 檔案位於 backend/Noto_Sans_TC/ 目錄下
        const fontPath = path.join(__dirname, 'Noto_Sans_TC', 'NotoSansTC-VariableFont_wght.ttf');
        try {
            if (fs.existsSync(fontPath)) {
                doc.font(fontPath);
            } else {
                console.error('中文字型檔案未找到:', fontPath);
                // 可以選擇回退到預設字型或拋出錯誤，這裡我們先記錄錯誤
                // 如果沒有字型，中文會是亂碼
            }
        } catch (fontError) {
            console.error('載入中文字型錯誤:', fontError);
        }

        // 設定回應標頭
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let fileName = `tree_survey_${specificProjectsExport ? (singleProjectCodeForName ? `project_${singleProjectCodeForName}` : 'selected') : 'all'}_export_${timestamp}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // 將 PDF 串流導向回應
        doc.pipe(res);

        // 加入標題
        doc.fontSize(20).text('樹木調查資料', { align: 'center' });
        doc.moveDown();

        // 加入資料
        results.forEach((tree, index) => {
            doc.fontSize(12).text(`資料 ${index + 1}:`);
            doc.fontSize(10).text(`專案區位: ${tree.專案區位}`);
            doc.text(`專案代碼: ${tree.專案代碼}`);
            doc.text(`專案名稱: ${tree.專案名稱}`);
            doc.text(`樹種名稱: ${tree.樹種名稱}`);
            doc.text(`樹高: ${tree['樹高（公尺）']} 公尺`);
            doc.text(`胸徑: ${tree['胸徑（公分）']} 公分`);
            doc.moveDown();
        });

        // 結束文件
        doc.end();
    });
});

// 資料備份和還原

// 備份資料庫
app.post('/api/backup', (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

    const command = `mysqldump -u root -p tree_data > "${backupFile}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('備份錯誤:', error);
            return res.status(500).json({
                success: false,
                message: '資料庫備份時發生錯誤'
            });
        }
        res.json({
            success: true,
            message: '資料庫備份成功',
            backupFile: backupFile
        });
    });
});

// 還原資料庫
app.post('/api/restore', (req, res) => {
    const { backupFile } = req.body;
    
    if (!backupFile || !fs.existsSync(backupFile)) {
        return res.status(400).json({
            success: false,
            message: '無效的備份檔案'
        });
    }

    const command = `mysql -u root -p tree_data < "${backupFile}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('還原錯誤:', error);
            return res.status(500).json({
                success: false,
                message: '資料庫還原時發生錯誤'
            });
        }
        res.json({
            success: true,
            message: '資料庫還原成功'
        });
    });
});

// 樹木資料統計分析
app.get('/api/tree_statistics', (req, res) => {
    // 處理多個區域查詢
    let whereClause = '';
    let queryParams = [];
    
    if (req.query.area) {
        whereClause = 'WHERE 專案區位 = ?';
        queryParams = [req.query.area];
    } else if (req.query.areas) {
        const areasList = req.query.areas.split(',');
        if (areasList.length > 0) {
            whereClause = 'WHERE (';
            const areasParams = areasList.map((_, index) => '專案區位 = ?');
            whereClause += areasParams.join(' OR ');
            whereClause += ')';
            queryParams = areasList;
        }
    }
    
    // 取得各樹種的數量統計
    const speciesQuery = `
        SELECT 樹種名稱, COUNT(*) as count 
        FROM tree_survey 
        ${whereClause}
        GROUP BY 樹種名稱 
        ORDER BY count DESC
    `;

    // 取得各專案的樹木數量統計
    const projectQuery = `
        SELECT 專案名稱, COUNT(*) as count 
        FROM tree_survey 
        GROUP BY 專案名稱 
        ORDER BY count DESC
    `;

    // 取得各區位的樹木數量統計
    const areaQuery = `
        SELECT 專案區位, COUNT(*) as count 
        FROM tree_survey 
        GROUP BY 專案區位 
        ORDER BY count DESC
    `;

    // 取得樹木高度和胸徑的統計
    const sizeQuery = `
        SELECT 
            AVG(樹高（公尺）) as avg_height,
            MAX(樹高（公尺）) as max_height,
            MIN(樹高（公尺）) as min_height,
            AVG(胸徑（公分）) as avg_dbh,
            MAX(胸徑（公分）) as max_dbh,
            MIN(胸徑（公分）) as min_dbh
        FROM tree_survey
    `;

    // 取得碳儲存量的統計
    const carbonQuery = `
        SELECT 
            SUM(碳儲存量) as total_carbon,
            AVG(碳儲存量) as avg_carbon,
            SUM(推估年碳吸存量) as total_annual_carbon,
            AVG(推估年碳吸存量) as avg_annual_carbon
        FROM tree_survey
    `;

    // 執行所有查詢
    db.query(speciesQuery, queryParams, (err, speciesResults) => {
        if (err) {
            console.error('物種統計錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '取得物種統計時發生錯誤'
            });
        }

        db.query(projectQuery, (err, projectResults) => {
            if (err) {
                console.error('專案統計錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '取得專案統計時發生錯誤'
                });
            }

            db.query(areaQuery, (err, areaResults) => {
                if (err) {
                    console.error('區位統計錯誤:', err);
                    return res.status(500).json({
                        success: false,
                        message: '取得區位統計時發生錯誤'
                    });
                }

                db.query(sizeQuery, (err, sizeResults) => {
                    if (err) {
                        console.error('尺寸統計錯誤:', err);
                        return res.status(500).json({
                            success: false,
                            message: '取得尺寸統計時發生錯誤'
                        });
                    }

                    db.query(carbonQuery, (err, carbonResults) => {
                        if (err) {
                            console.error('碳儲存量統計錯誤:', err);
                            return res.status(500).json({
                                success: false,
                                message: '取得碳儲存量統計時發生錯誤'
                            });
                        }

                        // 組合所有統計結果
                        res.json({
                            success: true,
                            data: {
                                species: speciesResults,
                                projects: projectResults,
                                areas: areaResults,
                                sizes: sizeResults[0],
                                carbon: carbonResults[0]
                            }
                        });
                    });
                });
            });
        });
    });
});

// 修改 chat API 路由使用 OpenAI 或 Gemini
app.post('/api/chat', aiLimiter, async (req, res) => {
    try {
        const { message, projectAreas, userId, model_preference = 'chatgpt' } = req.body; // 新增 model_preference，預設為 chatgpt
    
        // 從資料庫獲取相關的樹木數據
        let treeData = [];
        let treeDataError = null;
        
        if (projectAreas && projectAreas.length > 0) {
            const placeholders = projectAreas.map(() => '?').join(',');
            const query = `
                SELECT 
                    專案區位,
                    樹種名稱,
                    \`樹高（公尺）\`,
                    \`胸徑（公分）\`,
                    碳儲存量,
                    推估年碳吸存量
                FROM tree_survey 
                WHERE 專案區位 IN (${placeholders})
            `;
            
            try {
                treeData = await new Promise((resolve, reject) => {
                    db.query(query, projectAreas, (err, results) => {
                        if (err) return reject(err);
                        resolve(results);
                    });
                });
            } catch (err) {
                console.error('查詢樹木資料錯誤:', err);
                treeDataError = '查詢樹木資料時發生錯誤'; 
                // 不直接 return，讓流程繼續，但 AI 會知道資料查詢失敗
            }
        }
    
        // 準備發送給 AI 的樹木數據上下文
        // TODO: 這裡的 treeDataContext 依然可能是超長 JSON，需要根據模型和上下文總長度進行摘要或截斷
        const treeDataContext = treeDataError 
            ? `樹木資料查詢失敗: ${treeDataError}`
            : (treeData.length > 0 
                    ? `以下是相關區域的樹木數據：${JSON.stringify(treeData)}`
                    : '目前沒有選擇特定區域的樹木數據');
    
        // 新增調試日誌
        console.log('[API /api/chat DEBUG] typeof db:', typeof db);
        console.log('[API /api/chat DEBUG] typeof db.pool:', typeof db.pool);
        // console.log('[API /api/chat DEBUG] db.pool object:', db.pool); // 這一行如果db.pool是複雜對象，可能打印過多信息，先註釋
        if (db && db.pool) {
            console.log('[API /api/chat DEBUG] db.pool is defined.');
        } else {
            console.error('[API /api/chat DEBUG] db.pool is UNDEFINED or db is UNDEFINED!');
        }

        console.log(`[API /api/chat] 正在為訊息 "${message.substring(0, 50)}..." 檢索知識片段...`);
        // 將 similarityThreshold 修改為 0.45
        const currentSimilarityThreshold = 0.45; 
        const passages = await getSimilarPassages(message, 15, currentSimilarityThreshold); 
        
        let knowledgeContext = '';
        if (passages && passages.length > 0) {
            knowledgeContext = '\n\n以下是從知識庫檢索到的相關資訊，請參考 (若與使用者問題無直接關聯，則忽略此段資訊)：\n';
            passages.forEach((p, index) => {
                knowledgeContext += `\n--- 知識片段 ${index + 1} ---\n`;
                if (p.original_source_title) {
                    knowledgeContext += `標題: ${p.original_source_title}\n`;
                }
                if (p.original_source_type_detailed) {
                    knowledgeContext += `類型: ${p.original_source_type_detailed}\n`;
                }
                // 優先使用 text_content，如果沒有則使用 summary_cn
                const contentToUse = p.text_content || p.summary_cn || '[內容摘要不可用]';
                knowledgeContext += `內容摘要: ${contentToUse.substring(0, 300)}${contentToUse.length > 300 ? '...': ''}\n`; // 限制摘要長度
                if (p.original_source_url_or_doi) {
                    knowledgeContext += `參考連結: ${p.original_source_url_or_doi}\n`;
                }
                knowledgeContext += `(知識庫內部ID: ${p.id}, 相關度: ${p.score.toFixed(3)})\n`;
            });
            knowledgeContext += '--- 知識片段結束 ---\n';
            console.log(`[API /api/chat] 已構建知識上下文 (前200字元): ${knowledgeContext.substring(0, 200)}...`);
        } else {
            console.log('[API /api/chat] 未從知識庫檢索到相關片段。');
        }
    
        let aiResponse = '';
        let modelUsed = model_preference; // 由後續邏輯決定預設值
        let sourceInfo = ' (未知來源)';

        const systemInstructionBase = '你是一位專業的樹木永續發展與碳匯專家。';
        const fullContextForAI = `${treeDataContext}${knowledgeContext}`;
        
        const systemMessageForOpenAICompatible = `${systemInstructionBase}${fullContextForAI} \n請根據用戶的問題提供專業的建議和分析，並在需要時引用(知識庫內部ID)標註。`;
        const systemInstructionForGemini = `${systemInstructionBase}\n可用資料上下文：${fullContextForAI}\n請根據用戶的問題提供專業的建議和分析，並在需要時引用(知識庫內部ID)標註。`;
        const systemPromptForClaude = `${systemInstructionBase}\n可用資料上下文：${fullContextForAI}\n請根據用戶的問題提供專業的建議和分析，並在需要時引用(知識庫內部ID)標註。請直接回答問題，不要在回答前說例如\"好的，這是一個關於XX的問題...\"這類開場白。`;

        try {
            if (model_preference && model_preference.startsWith('gemini-')) {
                console.log(`[API Chat] 使用 Gemini 模型 (${model_preference}) 處理請求。`);
                modelUsed = model_preference; // modelName 已在 geminiService 中有預設值
                aiResponse = await generateGeminiChatResponse(message, systemInstructionForGemini, [], modelUsed);
                sourceInfo = ` (由 ${modelUsed.replace('-latest','').replace('-preview',' Preview')} 回答)`;
            
            } else if (model_preference && 
                       (model_preference === 'claude-3-7-sonnet-latest' || 
                        model_preference === 'claude-3-5-haiku-latest'
                       )
                      ) {
                if (!anthropic) {
                    console.error('[API Chat] Claude SDK 未初始化，無法處理請求。');
                    throw new Error("Claude服務未配置，請聯繫管理員。");
                }
                console.log(`[API Chat] 使用 Claude 模型 (${model_preference}) 處理請求。`);
                modelUsed = model_preference;
                const claudeResponse = await anthropic.messages.create({
                    model: modelUsed,
                    max_tokens: 2048, 
                    system: systemPromptForClaude, 
                    messages: [{ role: 'user', content: message }],
                    temperature: 0.7,
                });
                if (claudeResponse.content && claudeResponse.content.length > 0 && claudeResponse.content[0].text) {
                    aiResponse = claudeResponse.content[0].text;
                } else {
                    throw new Error("Claude API 未返回有效內容。詳情請查看後端日誌。");
                }
                sourceInfo = ` (由 ${modelUsed.split('@')[0]} 回答)`;
            
            } else if (model_preference === 'gpt-4.1-2025-04-14') { // 修改條件以匹配前端發送的精確值
                modelUsed = 'gpt-4.1'; // 堅持使用 'gpt-4.1' 作為 API 調用的 model ID
                console.log(`[API Chat] 使用 OpenAI 模型 (${modelUsed}) 處理請求。前端選擇: ${model_preference}`);
                const completion = await openai.chat.completions.create({
                    model: modelUsed, // 使用 'gpt-4.1'
                    messages: [
                        { role: "system", content: systemMessageForOpenAICompatible },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 1500,
                });
                aiResponse = completion.choices[0].message.content;
                sourceInfo = ` (由 ChatGPT 4.1 回答)`; // 更新來源標示
            
            } else if (model_preference === 'Qwen/Qwen3-235B-A22B' || (model_preference && model_preference.startsWith('deepseek-ai/')) ) {
                if (!siliconFlowLlm) {
                    console.error('[API Chat] SiliconFlow SDK 未初始化，無法處理請求。');
                    throw new Error("SiliconFlow 服務未配置，請聯繫管理員。");
                }
                
                let siliconFlowModelId = model_preference; // 預設直接使用前端傳來的值
                // 如果 SiliconFlow 對於 HuggingFace 模型名稱有特定要求 (例如需要組織名 Qwen/)
                // 或者 DeepSeek-V3 和 DeepSeek-R1 在 SiliconFlow上有不同ID，則在此處處理
                if (model_preference === 'Qwen3-235B-A22B') {
                     siliconFlowModelId = "Qwen/Qwen3-235B-A22B"; 
                } else if (model_preference === 'DeepSeek-V3') {
                    siliconFlowModelId = "deepseek-chat"; // 假設 SiliconFlow 使用此 ID，請確認
                } else if (model_preference === 'DeepSeek-R1') {
                    siliconFlowModelId = "deepseek-coder"; // 假設 SiliconFlow 使用此 ID，請確認
                }

                console.log(`[API Chat] 使用 SiliconFlow 模型 (${siliconFlowModelId} via ${model_preference}) 處理請求。`);
                modelUsed = model_preference; // 記錄前端選擇的原始偏好
                
                const completion = await siliconFlowLlm.chat.completions.create({
                    model: siliconFlowModelId,
                    messages: [
                        { role: "system", content: systemMessageForOpenAICompatible }, // 可考慮為 Qwen/DeepSeek 微調
                        { role: "user", content: message }
                    ],
                    temperature: (model_preference.startsWith('Qwen')) ? 0.6 : 0.7, // Qwen 建議0.6 for thinking
                    top_p: (model_preference.startsWith('Qwen')) ? 0.95 : null, // Qwen 建議0.95 for thinking, 其他模型可不設或用預設
                    max_tokens: 1800, // 稍微增加 token
                });

                if (completion.choices && completion.choices.length > 0 && completion.choices[0].message.content) {
                    aiResponse = completion.choices[0].message.content;
                    if (model_preference.startsWith('Qwen')) {
                        aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); // 移除思考標籤
                    }
                } else {
                     throw new Error("SiliconFlow API (${siliconFlowModelId}) 未返回有效內容。詳情請查看後端日誌。");
                }
                sourceInfo = ` (由 ${model_preference} via SiliconFlow 回答)`;

            } else if (model_preference === 'gpt-4.1') { 
                modelUsed = 'gpt-4.1'; 
                console.log(`[API Chat] 使用 OpenAI 模型 (${modelUsed}) 處理請求。`);
                const completion = await openai.chat.completions.create({
                    model: modelUsed,
                    messages: [
                        { role: "system", content: systemMessageForOpenAICompatible },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 1500,
                });
                aiResponse = completion.choices[0].message.content;
                sourceInfo = ` (由 ChatGPT 4.1 回答)`;
            
            } else { // 預設或未知的 model_preference，統一走 OpenAI GPT-4.1-mini
                modelUsed = 'gpt-4.1-mini'; // 設定預設為 gpt-4.1-mini
                console.log(`[API Chat] model_preference 未匹配或未提供，使用預設 OpenAI 模型 (${modelUsed}) 處理請求。原始 preference: ${model_preference}`);
                const completion = await openai.chat.completions.create({
                    model: modelUsed,
                    messages: [
                        { role: "system", content: systemMessageForOpenAICompatible },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 1500 
                });
                aiResponse = completion.choices[0].message.content;
                sourceInfo = ` (由 ChatGPT 4.1-mini 回答)`;
            }
        } catch (llmError) {
            console.error(`[API Chat] LLM (${modelUsed || model_preference}) API 錯誤:`, llmError.message);
            aiResponse = `處理 AI 回應時發生錯誤 (${modelUsed || model_preference})。`;
            if (llmError.message) aiResponse += ` 詳情: ${llmError.message.substring(0, 200)}`; //限制錯誤訊息長度
            if (llmError.status === 400 && llmError.message && llmError.message.includes('context_length_exceeded')) {
                 aiResponse = `錯誤：傳送給 ${modelUsed || model_preference} 的訊息長度超過模型限制。請嘗試減少選擇的專案區域或簡化問題。`;
            }
            sourceInfo = ` (AI (${modelUsed || model_preference}) 處理失敗)`;
        }

        // 將對話記錄保存到資料庫
        const chatLog = {
            user_id: userId,
            message: message,
            response: aiResponse + sourceInfo,
            model_used: modelUsed, // 記錄使用的模型
            project_areas: projectAreas ? JSON.stringify(projectAreas) : null,
            created_at: new Date()
        };

        db.query('INSERT INTO chat_logs SET ?', chatLog, (err) => {
            if (err) {
                console.error('保存對話記錄錯誤:', err);
            }
        });

        // 修改返回給前端的 sources 結構以包含更多元數據
        const frontendSources = passages.map(p => ({
            id: p.id, 
            score: p.score,
            text_content: p.text_content, // 確保傳遞 text_content
            summary_cn: p.summary_cn,
            source_type: p.source_type,
            internal_source_table_name: p.internal_source_table_name,
            internal_source_record_id: p.internal_source_record_id,
            original_source_title: p.original_source_title,
            original_source_author: p.original_source_author,
            original_source_publication_year: p.original_source_publication_year,
            original_source_url_or_doi: p.original_source_url_or_doi,
            original_source_type_detailed: p.original_source_type_detailed,
            keywords: p.keywords,
            confidence_score: p.confidence_score,
            last_verified_at: p.last_verified_at
        }));
        
        if(frontendSources.length > 0){
            console.log('[API /api/chat] 準備回傳給前端的 sources (第一個片段的元數據): ', JSON.stringify(frontendSources[0]));
        } else {
            console.log('[API /api/chat] 沒有知識片段來源可以回傳給前端。');
        }

        res.json({
            success: true,
            response: aiResponse + sourceInfo, 
            sources: frontendSources, 
            modelUsed: modelUsed
        });
    } catch (error) {
        console.error('AI 聊天 API 發生未預期錯誤:', error);
        res.status(500).json({
            success: false,
            error: '處理 AI 聊天時發生未預期錯誤'
    });
  }
});

// 新增碳匯教育內容API
app.get('/api/carbon-education/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const content = await openaiController.generateCarbonEducationContent(topic);
    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('生成碳匯教育內容錯誤:', error);
    res.status(500).json({
      success: false,
      message: '生成碳匯教育內容時發生錯誤',
      error: error.message
    });
  }
});

// 碳足跡計算與抵消建議API
app.post('/api/carbon-footprint/advice', async (req, res) => {
    try {
        const { activityType, amount, unit } = req.body;
        
        if (!activityType || !amount || !unit) {
            return res.status(400).json({
                success: false,
                message: '請提供活動類型、數量和單位'
            });
        }

        const { generateCarbonFootprintAdvice } = require('./controllers/openaiController');
        const advice = await generateCarbonFootprintAdvice(req.body);
        
        res.json({
            success: true,
            advice
        });
    } catch (error) {
        console.error('生成碳足跡建議錯誤:', error);
        res.status(500).json({
            success: false,
            message: '生成碳足跡建議時發生錯誤',
            error: error.message
        });
    }
});

// 碳足跡抵消計算 API
app.post('/api/carbon-footprint/offset', async (req, res) => {
    try {
        const { amount, unit } = req.body;
        
        if (!amount || !unit) {
            return res.status(400).json({
                success: false,
                message: '請提供碳足跡數量和單位'
            });
        }

        const { calculateCarbonOffsetTree } = require('./controllers/openaiController');
        const offsetResults = await calculateCarbonOffsetTree({
            amount,
            unit
        });
        
        res.json({
            success: true,
            data: offsetResults
        });
    } catch (error) {
        console.error('計算碳足跡抵消錯誤:', error);
        res.status(500).json({
            success: false,
            message: '計算碳足跡抵消時發生錯誤',
            error: error.message
        });
    }
});

// 碳足跡計算器 API
app.post('/api/carbon-footprint/calculator', async (req, res) => {
    try {
        const { activityType, amount, unit } = req.body;
        
        if (!activityType || !amount || !unit) {
            return res.status(400).json({
                success: false,
                message: '請提供活動類型、數量和單位'
            });
        }

        // 先嘗試從資料庫 emission_factors 取得排放因子
        let emissionFactor = null;
        let factorSource = null;
        try {
            const sql = 'SELECT factor_value, source FROM emission_factors WHERE activity_type = ? AND unit = ? LIMIT 1';
            const rows = await new Promise((resolve, reject) => {
                db.query(sql, [activityType, unit], (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                });
            });

            if (rows.length > 0) {
                emissionFactor = parseFloat(rows[0].factor_value);
                factorSource = rows[0].source || '資料庫 emission_factors';
                console.log(`[DEBUG] 從資料庫取得排放因子: ${activityType} (${unit}) -> ${emissionFactor}`);
            } else {
                console.log(`[DEBUG] 資料庫無排放因子: ${activityType} (${unit})`);
            }
        } catch (dbErr) {
            console.error('查詢 emission_factors 時發生錯誤:', dbErr);
            }
            
        // 若資料庫仍找不到排放因子，直接回傳錯誤（前端將限制 activityType 選項）
        if (emissionFactor === null) {
                return res.status(400).json({
                    success: false,
                message: `資料庫無排放因子：${activityType} (${unit})，請先於 emission_factors 表新增`,
            });
        }

        /*
         * 若為「電力」活動，同時計算「電力間接」排放量。
         * － 電力：直接排放（用電本身）
         * － 電力間接：輸配電過程等間接排放
         */
        let indirectEmissionFactor = null;
        let carbonFootprintIndirectKg = 0;
        let indirectFactorSource = null;

        if (activityType === '電力') {
            try {
                const sqlIndirect = 'SELECT factor_value, source FROM emission_factors WHERE activity_type = ? AND unit = ? LIMIT 1';
                const rowsIndirect = await new Promise((resolve, reject) => {
                    db.query(sqlIndirect, ['電力間接', unit], (err, results) => {
                        if (err) return reject(err);
                        resolve(results);
                    });
                });

                if (rowsIndirect.length > 0) {
                    indirectEmissionFactor = parseFloat(rowsIndirect[0].factor_value);
                    indirectFactorSource = rowsIndirect[0].source || '資料庫 emission_factors';
                    carbonFootprintIndirectKg = parseFloat(amount) * indirectEmissionFactor;
                    console.log(`[DEBUG] 從資料庫取得排放因子: 電力間接 (${unit}) -> ${indirectEmissionFactor}`);
                } else {
                    console.log('[DEBUG] 資料庫無排放因子: 電力間接');
                }
            } catch (err) {
                console.error('查詢電力間接排放因子時發生錯誤:', err);
            }
        }
        
        // ------------------ 計算碳足跡 ------------------
        const carbonFootprintDirectKg = parseFloat(amount) * emissionFactor;
        const carbonFootprintTotalKg = carbonFootprintDirectKg + carbonFootprintIndirectKg;
        
        // 單位轉換
        let resultUnit = 'kg CO₂-eq';
        let carbonFootprintDirect = carbonFootprintDirectKg;
        let carbonFootprintIndirect = carbonFootprintIndirectKg;
        let carbonFootprintTotal = carbonFootprintTotalKg;
        let formula = `${amount} ${unit} * ${emissionFactor.toFixed(3)} kg CO₂-eq/${unit} = ${carbonFootprintDirectKg.toFixed(2)} kg CO₂-eq`;
        if (activityType === '電力' && indirectEmissionFactor !== null) {
            formula += ` (直接); ${amount} ${unit} * ${indirectEmissionFactor.toFixed(3)} kg CO₂-eq/${unit} = ${carbonFootprintIndirectKg.toFixed(2)} kg CO₂-eq (間接)`;
        }

        if (carbonFootprintTotalKg > 1000) {
            carbonFootprintDirect = carbonFootprintDirectKg / 1000;
            carbonFootprintIndirect = carbonFootprintIndirectKg / 1000;
            carbonFootprintTotal = carbonFootprintTotalKg / 1000;
            resultUnit = 'ton CO₂-eq';
        }
        
        // ------------ 計算碳抵消建議 (動態從 tree_carbon_data) ------------
        let offsetResults = {
            carbonFootprintKg: carbonFootprintTotalKg, // 統一使用公斤計算抵消
            treesNeededForOneYear: null,
            treesNeededFor10Years: null,
            treesNeededFor20Years: null,
            speciesComparison: {},
            note: "樹木抵消碳排放是長期過程，樹木的碳吸收率會隨年齡和種類而變化。本計算基於資料庫中樹種的平均年碳吸存量，實際效果可能因環境條件、樹木健康狀況等因素而異。"
        };

        try {
            // 1. 查詢所有樹種的平均年碳吸存量 (取min和max的平均值，再整體平均)
            const avgAbsorptionSql = `
                SELECT 
                    AVG((carbon_absorption_min + carbon_absorption_max) / 2) as avg_annual_absorption_kg
                FROM tree_carbon_data
                WHERE carbon_absorption_min IS NOT NULL AND carbon_absorption_max IS NOT NULL;
            `;
            const avgResult = await new Promise((resolve, reject) => {
                db.query(avgAbsorptionSql, (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                });
            });

            let generalAvgAbsorption = 20; // 預設值，以防資料庫無資料
            if (avgResult.length > 0 && avgResult[0].avg_annual_absorption_kg) {
                generalAvgAbsorption = parseFloat(avgResult[0].avg_annual_absorption_kg);
                console.log(`[DEBUG] 資料庫樹種平均年碳吸存量: ${generalAvgAbsorption.toFixed(2)} kg CO₂-eq/株/年`);
            } else {
                console.warn('[WARN] tree_carbon_data 無法計算平均年碳吸存量，將使用預設值 20kg。');
            }

            if (generalAvgAbsorption > 0) {
                offsetResults.treesNeededForOneYear = Math.ceil(carbonFootprintTotalKg / generalAvgAbsorption);
                offsetResults.treesNeededFor10Years = Math.ceil(carbonFootprintTotalKg / (generalAvgAbsorption * 10));
                offsetResults.treesNeededFor20Years = Math.ceil(carbonFootprintTotalKg / (generalAvgAbsorption * 20));
            }
            
            // 2. 查詢幾種常見或高效樹種的碳吸存能力進行比較
            const topSpeciesSql = `
                SELECT 
                    common_name_zh, 
                    (carbon_absorption_min + carbon_absorption_max) / 2 as avg_absorption
                FROM tree_carbon_data
                WHERE carbon_absorption_min IS NOT NULL AND carbon_absorption_max IS NOT NULL
                ORDER BY avg_absorption DESC
                LIMIT 4; 
            `; // 例如取前4名
            const topSpeciesResult = await new Promise((resolve, reject) => {
                db.query(topSpeciesSql, (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                });
            });

            if (topSpeciesResult.length > 0) {
                topSpeciesResult.forEach(species => {
                    const avgAbsorption = parseFloat(species.avg_absorption);
                    if (avgAbsorption > 0) {
                        offsetResults.speciesComparison[species.common_name_zh] = Math.ceil(carbonFootprintTotalKg / avgAbsorption);
                    }
                });
                console.log('[DEBUG] 碳抵消樹種比較資料:', offsetResults.speciesComparison);
            }

        } catch (offsetErr) {
            console.error('計算碳抵消建議時發生資料庫錯誤:', offsetErr);
            // 即使抵銷建議出錯，還是回傳碳足跡計算結果
            offsetResults.note = "計算碳抵消樹種建議時發生錯誤，部分資訊可能不完整。";
        }
        // ------------------ END 計算碳抵消建議 ------------------

        // 組合回傳資料
        const responseData = {
                activityType,
                amount,
                unit,
            emissionFactor,           // 直接排放因子
            factorSource,
            formula, // 新增計算公式
            carbonFootprintDirect: parseFloat(carbonFootprintDirect.toFixed(2)),
                resultUnit,
            offsetResults, // 使用新的 offsetResults
            carbonFootprintTotal: parseFloat(carbonFootprintTotal.toFixed(2)),
        };

        // 若有電力間接，加入相關欄位
        if (indirectEmissionFactor !== null) {
            responseData.indirectEmissionFactor = indirectEmissionFactor;
            responseData.indirectFactorSource = indirectFactorSource;
            responseData.carbonFootprintIndirect = parseFloat(carbonFootprintIndirect.toFixed(2));
        }

        return res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('計算碳足跡錯誤:', error);
        res.status(500).json({
            success: false,
            message: '計算碳足跡時發生錯誤',
            error: error.message
        });
    }
});

// 樹種碳匯比較API
app.post('/api/species-comparison', async (req, res) => {
    try {
        const { species } = req.body;
        
        if (!species || !Array.isArray(species) || species.length === 0) {
            return res.status(400).json({
                success: false,
                message: '請提供樹種列表'
            });
        }
        
        const { generateSpeciesCarbonComparison } = require('./controllers/openaiController');
        const comparison = await generateSpeciesCarbonComparison(species);
        
        res.json({
            success: true,
            comparison
        });
    } catch (error) {
        console.error('生成樹種比較錯誤:', error);
        res.status(500).json({
            success: false,
            message: '生成樹種比較時發生錯誤',
            error: error.message
        });
    }
});

// 添加測試路由
app.post('/api/test', (req, res) => {
        res.json({
            success: true,
        message: '測試請求成功',
        data: {
            requestTime: new Date().toISOString()
        }
    });
});

// AI 智能諮詢
app.post('/api/tree-query', async (req, res) => {
    try {
        const { query } = req.body;
        
        // 從資料庫獲取相關數據
        const [dbData] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_trees,
                    ROUND(SUM(碳儲存量)/1000, 2) as total_carbon_storage,
                    ROUND(SUM(推估年碳吸存量)/1000, 2) as total_annual_carbon,
                    ROUND(AVG(樹高（公尺）), 2) as avg_height
                FROM tree_survey
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        const response = await handleTreeQuery(query, dbData);
        res.json({ success: true, response });
    } catch (error) {
        console.error('處理查詢錯誤:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 生成永續報告
app.get('/api/sustainability-report', async (req, res) => {
    try {
        // 從資料庫獲取報告所需數據
        const [stats] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_trees,
                    ROUND(SUM(碳儲存量)/1000, 2) as total_carbon_storage,
                    ROUND(SUM(推估年碳吸存量)/1000, 2) as total_annual_carbon,
                    ROUND(AVG(樹高（公尺）), 2) as avg_height
                FROM tree_survey
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        const data = {
            總樹數: stats.total_trees + "棵",
            總碳儲存: stats.total_carbon_storage + "噸",
            年碳吸收: stats.total_annual_carbon + "噸",
            平均樹高: stats.avg_height + "公尺"
        };

        const report = await generateSustainabilityReport(data);
        res.json({ success: true, report, data });
    } catch (error) {
        console.error('生成報告錯誤:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 預測生長趨勢
app.get('/api/growth-prediction', async (req, res) => {
    try {
        // 獲取歷史數據
        const historicalData = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    YEAR(調查時間) as year,
                    ROUND(AVG(樹高（公尺）), 2) as avg_height,
                    ROUND(AVG(胸徑（公分）), 2) as avg_dbh,
                    ROUND(SUM(碳儲存量)/1000, 2) as total_carbon
                FROM tree_survey
                GROUP BY YEAR(調查時間)
                ORDER BY year
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        const prediction = await predictGrowthTrend(historicalData);
        res.json({ success: true, prediction, historicalData });
    } catch (error) {
        console.error('生成預測錯誤:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 報告相關路由
app.get('/api/reports/sustainability', reportController.generateSustainabilityReport);
app.get('/api/reports/ai-sustainability', aiLimiter, aiReportController.generateAIReport);

// 新增 AI 永續報告 PDF 下載路由
app.get('/api/reports/ai-sustainability/pdf', aiLimiter, async (req, res) => {
    try {
        // 暫存 res.json 方法
        const originalJson = res.json;
        let reportJsonData = null;

        // 覆寫 res.json 以捕獲 aiReportController.generateAIReport 的數據
        res.json = (data) => {
            reportJsonData = data;
            // 恢復原來的 res.json，以防後續需要
            res.json = originalJson; 
        };

        // 1. 調用現有的 generateAIReport 函數來獲取 JSON 數據
        // 注意：我們傳遞 req 和一個特殊的 res 對象來捕獲數據，而不是直接發送回應
        await aiReportController.generateAIReport(req, res);

        if (reportJsonData && reportJsonData.success) {
            // 2. 使用獲取的數據生成 PDF
            const pdfBuffer = await aiReportController.generateAIReportPDF(reportJsonData.data);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `AI_Sustainability_Report_${timestamp}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(pdfBuffer);
        } else {
            // 如果獲取 JSON 數據失敗，則恢復 res.json 並發送錯誤
            res.json = originalJson; // 確保恢復
            res.status(500).json({
                success: false,
                message: '無法獲取 AI 報告數據以生成 PDF',
                error: reportJsonData ? reportJsonData.error : '未知錯誤'
            });
        }
    } catch (error) {
        console.error('Error generating AI sustainability report PDF:', error);
        // 確保在錯誤情況下也恢復 res.json (如果它被修改過)
        if (res.json !== originalJson && typeof originalJson === 'function') {
            res.json = originalJson;
        }
        res.status(500).json({
            success: false,
            message: '生成 AI 永續報告 PDF 時發生錯誤',
            error: error.message
        });
    }
});

// 添加 API 密鑰管理路由
app.post('/api/admin/apikeys', (req, res) => {
    const { name, permissions } = req.body;
    
    if (!name) {
        return res.status(400).json({
            success: false,
            message: '請提供 API 密鑰名稱'
        });
    }
    
    try {
        const apiKey = apiKeys.generateApiKey(name, permissions || ['read']);
        res.status(201).json({
            success: true,
            message: 'API 密鑰創建成功',
            apiKey
        });
    } catch (error) {
        console.error('創建 API 密鑰錯誤:', error);
        res.status(500).json({
            success: false,
            message: '創建 API 密鑰時發生錯誤'
        });
    }
});

app.get('/api/admin/apikeys', (req, res) => {
    try {
        const keys = apiKeys.listApiKeys();
        res.json({
            success: true,
            keys
        });
    } catch (error) {
        console.error('獲取 API 密鑰列表錯誤:', error);
        res.status(500).json({
            success: false,
            message: '獲取 API 密鑰列表時發生錯誤'
        });
    }
});

app.delete('/api/admin/apikeys/:id', (req, res) => {
    const { id } = req.params;
    
    try {
        const success = apiKeys.deleteApiKey(id);
        if (success) {
            res.json({
                success: true,
                message: 'API 密鑰刪除成功'
            });
        } else {
            res.status(404).json({
                success: false,
                message: '找不到要刪除的 API 密鑰'
            });
        }
    } catch (error) {
        console.error('刪除 API 密鑰錯誤:', error);
        res.status(500).json({
            success: false,
            message: '刪除 API 密鑰時發生錯誤'
        });
    }
});

// 後端新增功能示例
app.post('/api/ai-assistant/query', async (req, res) => {
    const { query } = req.body;
    
    // 步驟1: 使用AI分析用戶問題，提取關鍵查詢條件
    const queryAnalysis = await analyzeUserQuery(query);
    
    // 步驟2: 執行相應數據庫操作
    const dbResults = await executeDbQuery(queryAnalysis.dbQuery);
        
    // 步驟3: 生成回應
    const response = await generateEnhancedResponse(query, dbResults, queryAnalysis);
    
    res.json({ success: true, response });
});

// 永續發展政策建議API
app.post('/api/sustainability-policy', async (req, res) => {
    try {
        const { focusArea } = req.body;
        
        if (!focusArea) {
            return res.status(400).json({
                success: false,
                message: '請提供關注領域'
            });
        }
        
        // 獲取樹木資料用於政策建議
        const [treeStats] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_trees,
                    ROUND(SUM(碳儲存量)/1000, 2) as total_carbon_storage,
                    ROUND(SUM(推估年碳吸存量)/1000, 2) as total_annual_carbon,
                    ROUND(AVG(樹高（公尺）), 2) as avg_height,
                    COUNT(DISTINCT 樹種名稱) as species_diversity
                FROM tree_survey
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        
        // 取得主要樹種
        const mainSpecies = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 樹種名稱, COUNT(*) as count
                FROM tree_survey
                GROUP BY 樹種名稱
                ORDER BY count DESC
                LIMIT 5
            `, (err, results) => {
                if (err) reject(err);
                else {
                    const speciesNames = results.map(s => s.樹種名稱).join('、');
                    resolve(speciesNames);
                }
            });
        });
        
        // 取得區域分佈
        const areaDistribution = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 專案區位, COUNT(*) as count
                FROM tree_survey
                GROUP BY 專案區位
                ORDER BY count DESC
            `, (err, results) => {
                if (err) reject(err);
                else {
                    const areaInfo = results.map(a => `${a.專案區位}(${a.count}棵)`).join('、');
                    resolve(areaInfo);
                }
            });
        });
        
        // 組合樹木數據
        const treeData = {
            ...treeStats,
            main_species: mainSpecies,
            area_distribution: areaDistribution
        };
        
        // 使用 OpenAI 生成政策建議
        const { generateSustainabilityPolicyRecommendations } = require('./controllers/openaiController');
        const policyRecommendations = await generateSustainabilityPolicyRecommendations(treeData, focusArea);
        
        res.json({
            success: true,
            policyRecommendations,
            treeData
        });
    } catch (error) {
        console.error('永續政策建議錯誤:', error);
        res.status(500).json({
            success: false,
            message: '生成永續政策建議時發生錯誤',
            error: error.message
        });
    }
});

// 設置上傳存儲
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.includes('excel') || 
        file.mimetype.includes('spreadsheetml') || 
        file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳Excel或CSV文件'));
    }
  }
});

// 批量匯入樹木資料
app.post('/api/tree_survey/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '請選擇要上傳的文件'
      });
    }

    // 讀取Excel或CSV文件
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // 驗證數據
    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: '文件中沒有數據'
      });
    }

    // 批量插入數據
    let successCount = 0;
    let errorCount = 0;
    let errors = [];

    const processData = async () => {
      for (const row of data) {
        const treeData = {
          專案區位: row['專案區位'] || '無',
          專案代碼: row['專案代碼'] || '無',
          專案名稱: row['專案名稱'] || '無',
          系統樹木: parseInt(row['系統樹木']) || 0,
          專案樹木: parseInt(row['專案樹木']) || 0,
          樹種編號: row['樹種編號'] || '無',
          樹種名稱: row['樹種名稱'] || '無',
          X坐標: parseFloat(row['X坐標']) || 0,
          Y坐標: parseFloat(row['Y坐標']) || 0,
          狀況: row['狀況'] || '無',
          註記: row['註記'] || '無',
          樹木備註: row['樹木備註'] || '無',
          '樹高（公尺）': parseFloat(row['樹高（公尺）']) || 0,
          '胸徑（公分）': parseFloat(row['胸徑（公分）']) || 0,
          調查備註: row['調查備註'] || '無',
          調查時間: row['調查時間'] || new Date().toISOString(),
          碳儲存量: parseFloat(row['碳儲存量']) || 0,
          推估年碳吸存量: parseFloat(row['推估年碳吸存量']) || 0
        };

        const sql = `
          INSERT INTO tree_survey 
          (\`專案區位\`, \`專案代碼\`, \`專案名稱\`, \`系統樹木\`, \`專案樹木\`, \`樹種編號\`, 
          \`樹種名稱\`, \`X坐標\`, \`Y坐標\`, \`狀況\`, \`註記\`, \`樹木備註\`, \`樹高（公尺）\`, 
          \`胸徑（公分）\`, \`調查備註\`, \`調查時間\`, \`碳儲存量\`, \`推估年碳吸存量\`) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        try {
          await new Promise((resolve, reject) => {
            db.query(sql, Object.values(treeData), (err, results) => {
              if (err) {
                errorCount++;
                errors.push({
                  row: row,
                  error: err.message
                });
                reject(err);
              } else {
                successCount++;
                resolve(results);
              }
            });
          });
        } catch (err) {
          console.error('行處理錯誤:', err);
          // 繼續處理下一行
        }
      }

      // 刪除臨時文件
      fs.unlinkSync(req.file.path);

      // 返回結果
        res.json({
            success: true,
        message: `成功導入${successCount}條記錄，失敗${errorCount}條`,
        details: {
          successCount,
          errorCount,
          errors: errors.length > 10 ? errors.slice(0, 10) : errors
        }
      });
    };

    processData();
    } catch (error) {
    console.error('批量導入錯誤:', error);
        res.status(500).json({
            success: false,
      message: '批量導入時發生錯誤',
            error: error.message
        });
    }
});

// 下載模板
app.get('/api/tree_survey/template', (req, res) => {
  const templatePath = path.join(__dirname, 'data', 'tree_survey_template.xlsx');
  
  // 如果模板不存在，創建一個新模板
  if (!fs.existsSync(templatePath)) {
    const workbook = xlsx.utils.book_new();
    const templateData = [
      {
        '專案區位': '範例區域',
        '專案代碼': 'P001',
        '專案名稱': '範例專案',
        '系統樹木': 'T001',
        '專案樹木': 'PT001',
        '樹種編號': 'S001',
        '樹種名稱': '臺灣欒樹',
        'X坐標': 121.5,
        'Y坐標': 25.0,
        '狀況': '健康',
        '註記': '',
        '樹木備註': '',
        '樹高（公尺）': 5.5,
        '胸徑（公分）': 20.0,
        '調查備註': '',
        '調查時間': new Date().toISOString(),
        '碳儲存量': 50.5,
        '推估年碳吸存量': 10.2
      }
    ];
    
    const worksheet = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(workbook, worksheet, '樹木調查模板');
    
    // 確保目錄存在
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    xlsx.writeFile(workbook, templatePath);
  }
  
  res.download(templatePath, '樹木調查模板.xlsx');
});

// 取得專案區位列表
app.get('/api/project_areas', (req, res) => {
    const { city } = req.query;
    let sql = 'SELECT * FROM project_areas';
    const params = [];

    if (city) {
        if (city.endsWith('市') || city.endsWith('縣')) {
            sql += ' WHERE city = ?';
            params.push(city);
        } else {
            sql += ' WHERE city = ? OR city = ?';
            params.push(city + '市', city + '縣');
        }
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('查詢區位時發生錯誤:', err);
            return res.status(500).send('查詢區位時發生錯誤');
        }
        res.json({ success: true, data: results });
    });
});

// 新增專案區位（自動產生唯一 area_code，優先補缺號，並在提交時才正式拿座標定位縣市）
app.post('/api/project_areas', (req, res) => {
    const requestTime = new Date().toISOString();
    console.log(`[${requestTime}] ===> 收到了 POST /api/project_areas 的請求`);
    console.log('請求內容:', req.body);
    
    const { area_name, description, city, xCoord, yCoord, X坐標, Y坐標, isSubmit } = req.body;
    if (!area_name) {
        console.log(`[${requestTime}] 錯誤: 區位名稱不能為空`);
        return res.status(400).send('區位名稱不能為空');
    }

    console.log(`[${requestTime}] 開始處理區位新增: ${area_name}`);
    console.log(`[${requestTime}] 提交狀態: isSubmit=${isSubmit}, 座標: (${xCoord || X坐標}, ${yCoord || Y坐標}), 預設縣市: ${city}`);

    // 查詢所有現有 area_code，並檢查區位名稱是否已存在
    db.query('SELECT area_code, city FROM project_areas WHERE area_name = ?', [area_name], (err, results) => {
        if (err) {
            console.error(`[${requestTime}] 查詢區位代碼錯誤:`, err);
            return res.status(500).send('查詢區位代碼時發生錯誤');
        }

        // 若區位已存在，則直接寫入（不重新判斷 city）
        if (results.length > 0) {
            console.log(`[${requestTime}] 區位 ${area_name} 已存在，使用現有代碼: ${results[0].area_code}`);
            const nextCode = results[0].area_code;
            const finalCity = results[0].city;
            db.query(
                'INSERT INTO project_areas (area_name, area_code, description, city) VALUES (?, ?, ?, ?)',
                [area_name, nextCode, description, finalCity],
                (err, result) => {
                    if (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            console.log(`[${requestTime}] 錯誤: 區位名稱或代碼重複: ${area_name}`);
                            return res.status(400).json({ success: false, message: '區位名稱或代碼已存在，請更換名稱' });
        }
                        console.error(`[${requestTime}] 新增區位時發生錯誤:`, err);
                        return res.status(500).send('新增區位時發生錯誤');
                    }
                    console.log(`[${requestTime}] 成功新增已存在區位: ${area_name}, 代碼: ${nextCode}, 縣市: ${finalCity}`);
                    res.json({ success: true, data: { id: result.insertId, area_name, area_code: nextCode, description, city: finalCity } });
                }
            );
            return;
        }

        console.log(`[${requestTime}] 區位 ${area_name} 不存在，開始生成新代碼`);

        // 若區位不存在，則自動產生 area_code（優先補缺號）
        db.query('SELECT area_code FROM project_areas', (err, results) => {
            if (err) {
                console.error(`[${requestTime}] 查詢區位代碼錯誤:`, err);
                return res.status(500).send('查詢區位代碼時發生錯誤');
            }
            const usedNumbers = new Set();
            results.forEach(row => {
                const match = row.area_code && row.area_code.match(/^AREA-(\d{3})$/);
                if (match) {
                    usedNumbers.add(parseInt(match[1], 10));
                }
            });
            let nextNum = 1;
            while (usedNumbers.has(nextNum)) {
                nextNum++;
            }
            const nextCode = `AREA-${String(nextNum).padStart(3, '0')}`;
            console.log(`[${requestTime}] 生成新區位代碼: ${nextCode}`);

            // 處理縣市判斷
            let finalCity = city;
            const lng = xCoord || X坐標;
            const lat = yCoord || Y坐標;

            if (isSubmit && lat && lng) {
                console.log(`[${requestTime}] 使用座標定位縣市: 經度=${lng}, 緯度=${lat}`);
                const detectedCity = getCountyByCoordinates(lat, lng);
                if (detectedCity) {
                    // 根據縣市名稱決定是否加上「市」或「縣」
                    if (detectedCity.match(/(台北|新北|桃園|台中|台南|高雄|基隆|新竹市|嘉義市)/)) {
                        finalCity = detectedCity + '市';
                    } else {
                        finalCity = detectedCity + '縣';
                    }
                    console.log(`[${requestTime}] 座標定位結果: ${finalCity}`);
                } else {
                    console.log(`[${requestTime}] 警告: 無法從座標判斷縣市，使用預設縣市: ${city}`);
                }
            } else {
                // 如果沒有座標或未提交，嘗試從區位名稱判斷縣市
                const cityKeywords = {
                    '台北': ['台北', '臺北', '北市', '信義', '大安', '士林', '中正', '萬華', '文山', '松山', '內湖', '南港', '北投'],
                    '新北': ['新北', '新北市', '板橋', '三重', '中和', '永和', '新店', '新莊', '泰山', '林口', '淡水', '三峽', '鶯歌', '樹林'],
                    // ... 其他縣市關鍵字 ...
                };

                for (const [cityName, keywords] of Object.entries(cityKeywords)) {
                    if (keywords.some(keyword => area_name.includes(keyword))) {
                        finalCity = cityName + (cityName.match(/(台北|新北|桃園|台中|台南|高雄|基隆|新竹市|嘉義市)/) ? '市' : '縣');
                        console.log(`[${requestTime}] 從區位名稱判斷縣市: ${finalCity}`);
                        break;
                    }
                }

                if (!finalCity) {
                    console.log(`[${requestTime}] 警告: 無法從區位名稱判斷縣市，使用預設縣市: ${city}`);
                }
            }

            console.log(`[${requestTime}] 準備寫入資料庫: 區位=${area_name}, 代碼=${nextCode}, 縣市=${finalCity}`);
            db.query(
                'INSERT INTO project_areas (area_name, area_code, description, city) VALUES (?, ?, ?, ?)',
                [area_name, nextCode, description, finalCity],
                (err, result) => {
            if (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            console.log(`[${requestTime}] 錯誤: 區位名稱或代碼重複: ${area_name}`);
                            return res.status(400).json({ success: false, message: '區位名稱或代碼已存在，請更換名稱' });
                        }
                        console.error(`[${requestTime}] 新增區位時發生錯誤:`, err);
                        return res.status(500).send('新增區位時發生錯誤');
                    }
                    console.log(`[${requestTime}] 成功新增區位: ${area_name}, 代碼: ${nextCode}, 縣市: ${finalCity}`);
                    res.json({ success: true, data: { id: result.insertId, area_name, area_code: nextCode, description, city: finalCity } });
                }
            );
        });
    });
});

// 修改專案區位
app.put('/api/project_areas/:id', (req, res) => {
    const { id } = req.params;
    const { area_name, area_code, description } = req.body;
    if (!area_name || !area_code) {
        return res.status(400).json({ success: false, message: '請提供區位名稱與代碼' });
            }
    db.query('UPDATE project_areas SET area_name = ?, area_code = ?, description = ? WHERE id = ?', [area_name, area_code, description || null, id], (err, result) => {
        if (err) {
            console.error('更新區位錯誤:', err);
            return res.status(500).json({ success: false, message: '更新區位失敗' });
        }
        res.status(200).json({ success: true, message: '區位更新成功' });
            });
        });

// 刪除專案區位
app.delete('/api/project_areas/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM project_areas WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('刪除區位錯誤:', err);
            return res.status(500).json({ success: false, message: '刪除區位失敗' });
        }
        res.status(200).json({ success: true, message: '區位刪除成功' });
    });
});

// 取得樹種列表
app.get('/api/tree_species', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_species 的請求`);
    
    // 從資料庫獲取樹種資料
    db.query('SELECT DISTINCT 樹種編號 as id, 樹種名稱 as name FROM tree_survey WHERE 樹種名稱 IS NOT NULL AND 樹種名稱 != "" ORDER BY 樹種名稱', (err, results) => {
        if (err) {
            console.error('取得樹種列表錯誤:', err);
            return res.status(200).json({
                success: true,
                message: '發生錯誤，返回預設資料',
                data: [
                    { id: '001', name: '臺灣欒樹' },
                    { id: '002', name: '羊蹄甲' },
                    { id: '003', name: '樟樹' },
                    { id: '004', name: '榕樹' },
                    { id: '005', name: '楓香' }
                ]
            });
        }
        
        // 檢查結果
        console.log('從資料庫獲取的樹種:', results);
        
        // 如果沒有資料，添加一些默認值
        if (results.length === 0) {
            console.log('資料庫中沒有樹種，添加預設值');
            results = [
                { id: '001', name: '臺灣欒樹' },
                { id: '002', name: '羊蹄甲' },
                { id: '003', name: '樟樹' },
                { id: '004', name: '榕樹' },
                { id: '005', name: '楓香' }
            ];
        }
        
        // 返回資料
        res.status(200).json({
            success: true,
            message: '成功獲取樹種列表',
            data: results
        });
    });
});

// 獲取下一個可用的樹種編號
app.get('/api/tree_species/next_number', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_species/next_number 的請求`);
    
    // 從 tree_species 表中獲取所有編號
    db.query('SELECT id FROM tree_species ORDER BY id', (err, results) => {
        if (err) {
            console.error('獲取樹種編號錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '獲取樹種編號時發生錯誤'
            });
        }
        
        // 如果樹種表為空，嘗試從 tree_survey 表獲取編號
        if (results.length === 0) {
            db.query('SELECT DISTINCT 樹種編號 as id FROM tree_survey WHERE 樹種編號 IS NOT NULL AND 樹種編號 != "" AND 樹種編號 REGEXP "^[0-9]{4}$" ORDER BY 樹種編號', (err, surveyResults) => {
                if (err) {
                    console.error('從 tree_survey 獲取樹種編號錯誤:', err);
                    return res.json({
                        success: true,
                        nextNumber: '0001', // 如果發生錯誤，從 0001 開始
                        padded: true
                    });
                }
                
                // 處理從 tree_survey 獲取的編號
                processResults(surveyResults);
            });
        } else {
            // 處理從 tree_species 獲取的編號
            processResults(results);
        }
        
        // 處理獲取的編號結果
        function processResults(results) {
            try {
                // 解析現有編號中的數字
                const existingNumbers = results
                    .map(row => {
                        // 處理不同形式的編號
                        let idStr = row.id?.toString() || '';
                        // 如果是4位數字格式，直接使用
                        if (/^\d{4}$/.test(idStr)) {
                            return parseInt(idStr, 10);
                        }
                        // 嘗試提取純數字
                        const match = idStr.match(/(\d+)/);
                        return match ? parseInt(match[1], 10) : null;
                    })
                    .filter(num => num !== null && !isNaN(num))
                    .sort((a, b) => a - b);
                
                console.log('現有樹種編號:', existingNumbers);
                
                // 找出第一個缺失的數字
                let nextNumber = 1;
                for (const num of existingNumbers) {
                    if (num === nextNumber) {
                        nextNumber++;
                    } else if (num > nextNumber) {
                        break;
                    }
                }
                
                // 如果沒有缺失的數字，則使用最大值+1
                if (existingNumbers.length > 0 && nextNumber > existingNumbers[existingNumbers.length - 1]) {
                    nextNumber = existingNumbers[existingNumbers.length - 1] + 1;
                }
                
                // 格式化為4位數字，前補0
                const formattedNumber = nextNumber.toString().padStart(4, '0');
                
                console.log(`生成的下一個樹種編號: ${formattedNumber}`);
                res.json({
                    success: true,
                    nextNumber: formattedNumber,
                    padded: true
                });
            } catch (e) {
                console.error('處理樹種編號時發生錯誤:', e);
                res.json({
                    success: true,
                    nextNumber: '0001', // 錯誤時的預設編號
                    padded: true,
                    error: e.message
                });
            }
        }
    });
});

// 新增樹種
app.post('/api/tree_species', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 POST /api/tree_species 的請求`);
    console.log('請求內容:', req.body);
    
    const { name, id } = req.body;
    if (!name) {
        console.log('缺少樹種名稱');
        return res.status(400).json({
            success: false,
            message: '請提供樹種名稱'
        });
    }

    // 檢查是否已在 tree_species 表中存在
    db.query('SELECT COUNT(*) as count FROM tree_species WHERE name = ?', [name], (err, speciesResults) => {
        if (err) {
            console.error('檢查樹種表錯誤:', err);
            // 繼續檢查 tree_survey 表
            checkTreeSurveyTable();
        } else if (speciesResults[0].count > 0) {
            console.log('樹種已存在於 tree_species 表:', name);
            return res.status(200).json({
                success: true,
                message: '此樹種已存在'
            });
        } else {
            // 不在 tree_species 表中，檢查 tree_survey 表
            checkTreeSurveyTable();
        }
    });

    // 檢查是否在 tree_survey 表中存在
    function checkTreeSurveyTable() {
        db.query('SELECT COUNT(*) as count FROM tree_survey WHERE 樹種名稱 = ?', [name], (err, surveyResults) => {
            if (err) {
                console.error('檢查樹種在 tree_survey 錯誤:', err);
                // 繼續添加新樹種
                addNewSpeciesWithNextNumber();
            } else if (surveyResults[0].count > 0) {
                console.log('樹種已存在於 tree_survey 表:', name);
            return res.status(200).json({
                success: true,
                message: '此樹種已存在'
            });
            } else {
                // 樹種不存在於任何表中，可以添加
                addNewSpeciesWithNextNumber();
            }
        });
        }

    // 如果沒有提供ID，自動生成一個
    function addNewSpeciesWithNextNumber() {
        if (id && id.trim() !== '') {
            // 如果有提供ID，直接添加
            addSpecies(id);
        } else {
            // 獲取下一個可用編號
            http.get({
                hostname: 'localhost',
                port: process.env.PORT || 3000,
                path: '/api/tree_species/next_number'
            }, (resp) => {
                let data = '';
                resp.on('data', (chunk) => {
                    data += chunk;
                });
                resp.on('end', () => {
                    try {
                        const nextNumberData = JSON.parse(data);
                        if (nextNumberData.success) {
                            const nextId = nextNumberData.nextNumber;
                            addSpecies(nextId);
                        } else {
                            // 如果獲取失敗，使用隨機數作為備用
                            const fallbackId = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
                            addSpecies(fallbackId);
                        }
                    } catch (e) {
                        console.error('解析下一個編號時發生錯誤:', e);
                        const fallbackId = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
                        addSpecies(fallbackId);
                    }
                });
            }).on('error', (e) => {
                console.error('獲取下一個編號時發生錯誤:', e);
                const fallbackId = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
                addSpecies(fallbackId);
            });
        }
    }

    // 添加新樹種到兩個表
    function addSpecies(speciesId) {
        console.log(`正在添加樹種 ${name} 使用編號 ${speciesId}`);
        
        // 只添加到 tree_species 表，不再自動添加到 tree_survey 表
        db.query('INSERT INTO tree_species (id, name) VALUES (?, ?)', [speciesId, name], (err) => {
            if (err) {
                console.error('新增樹種到 tree_species 表錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '新增樹種失敗'
                });
            }
            
            console.log('樹種新增成功:', name, speciesId);
            res.status(201).json({
                success: true,
                message: '樹種新增成功',
                id: speciesId,
                name: name
            });
        });
    }
});

// 取得專案列表
app.get('/api/projects', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/projects 的請求`);
    
    // 從資料庫獲取專案資料
    db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area FROM tree_survey WHERE 專案名稱 IS NOT NULL AND 專案名稱 != "" ORDER BY 專案名稱', (err, results) => {
        if (err) {
            console.error('取得專案列表錯誤:', err);
            return res.status(200).json({
                success: true,
                message: '發生錯誤，返回預設資料',
                data: [
                    { name: '綠化專案一期', code: 'GRN-001', area: '高雄港' },
                    { name: '植樹專案二期', code: 'PJT-002', area: '布袋港' },
                    { name: '海濱綠化專案', code: 'SEA-003', area: '基隆港' }
                ]
            });
        }
        
        // 檢查結果
        console.log('從資料庫獲取的專案:', results);
        
        // 如果沒有資料，添加一些默認值
        if (results.length === 0) {
            console.log('資料庫中沒有專案，添加預設值');
            results = [
                { name: '綠化專案一期', code: 'GRN-001', area: '高雄港' },
                { name: '植樹專案二期', code: 'PJT-002', area: '布袋港' },
                { name: '海濱綠化專案', code: 'SEA-003', area: '基隆港' }
            ];
        }
        
        // 返回資料
        res.status(200).json({
            success: true,
            message: '成功獲取專案列表',
            data: results
        });
    });
});

// 根據專案區位獲取專案列表
app.get('/api/projects/by_area/:area', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/projects/by_area/${req.params.area} 的請求`);
    
    const area = req.params.area;
    
    // 從資料庫獲取特定區位的專案資料
    db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area FROM tree_survey WHERE 專案區位 = ? AND 專案名稱 IS NOT NULL AND 專案名稱 != "" ORDER BY 專案名稱', [area], (err, results) => {
        if (err) {
            console.error('取得專案列表錯誤:', err);
            return res.status(200).json({
                success: true,
                message: '發生錯誤，返回預設資料',
                data: [
                    { name: `${area}綠化專案`, code: 'AREA-001', area: area }
                ]
            });
        }
        
        // 檢查結果
        console.log('從資料庫獲取的專案:', results);
        
        // 如果沒有資料，添加一些默認值
        if (results.length === 0) {
            console.log('資料庫中沒有該區位的專案，添加預設值');
            results = [
                { name: `${area}綠化專案`, code: 'AREA-001', area: area }
            ];
        }
        
        // 返回資料
        res.status(200).json({
            success: true,
            message: '成功獲取專案列表',
            data: results
        });
    });
});

// 新增專案
app.post('/api/projects', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 POST /api/projects 的請求`);
    console.log('請求內容:', req.body);
    
    const { name, area } = req.body;
    if (!name) {
        console.log('缺少專案名稱');
        return res.status(400).json({
            success: false,
            message: '請提供專案名稱'
        });
    }
    
    if (!area) {
        console.log('缺少專案區位');
        return res.status(400).json({
            success: false,
            message: '請提供專案區位'
        });
    }

    // 生成專案代碼（簡單方法）
    const code = `PRJ-${Math.floor(Math.random() * 9000) + 1000}`;

    // 新增專案 (使用最小化的樹木記錄)
    db.query('INSERT INTO tree_survey (專案名稱, 專案代碼, 專案區位, 樹種名稱) VALUES (?, ?, ?, "預設樹種")', [name, code, area], (err, results) => {
        if (err) {
            console.error('新增專案錯誤:', err);
            return res.status(200).json({
                success: true,
                message: '專案已記錄（僅本地）',
                code: code
            });
        }
        
        console.log('專案新增成功:', name);
        res.status(201).json({
            success: true,
            message: '專案新增成功',
            code: code
        });
    });
});

// 根據專案名稱獲取專案信息
app.get('/api/projects/by_name/:name', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/projects/by_name/${req.params.name} 的請求`);
    
    const projectName = req.params.name;
    console.log('專案名稱:', projectName);

    // 先嘗試完全匹配
    db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area, id FROM tree_survey WHERE 專案名稱 = ? LIMIT 1', [projectName], (err, results) => {
        if (err) {
            console.error('查詢專案錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '查詢專案時發生錯誤'
            });
        }
        
        if (results.length > 0) {
            console.log('找到完全匹配的專案:', results[0]);
            
            // 查找該專案的其他資訊
            const projectInfo = {
                id: results[0].id,
                name: results[0].name,
                code: results[0].code,
                area: results[0].area,
                description: '這是一個樹木調查專案',
                location: results[0].area,
                status: '進行中',
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
            };
            
            return res.status(200).json(projectInfo);
        }
        
        // 如果沒有完全匹配，嘗試模糊匹配
        console.log('未找到完全匹配的專案，嘗試模糊匹配');
        db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area, id FROM tree_survey WHERE 專案名稱 LIKE ? LIMIT 1', [`%${projectName}%`], (err, fuzzyResults) => {
            if (err) {
                console.error('模糊查詢專案錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '模糊查詢專案時發生錯誤'
                });
            }
            
            if (fuzzyResults.length > 0) {
                console.log('找到模糊匹配的專案:', fuzzyResults[0]);
                
                const projectInfo = {
                    id: fuzzyResults[0].id,
                    name: fuzzyResults[0].name,
                    code: fuzzyResults[0].code,
                    area: fuzzyResults[0].area,
                    description: '這是一個樹木調查專案',
                    location: fuzzyResults[0].area,
                    status: '進行中',
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
                };
                
                return res.status(200).json(projectInfo);
            }
            
            // 如果連模糊匹配都沒有找到，新增一個預設專案
            console.log('未找到模糊匹配的專案，新增預設專案');
            
            // 生成專案代碼
            const code = `PRJ-${Math.floor(Math.random() * 9000) + 1000}`;
            
            // 處理專案區位，嘗試從名稱中提取
            let area = '';
            if (projectName.includes('港')) {
                area = projectName.split('港')[0] + '港';
            } else {
                area = '預設區位';
            }
            
            // 新增專案
            db.query('INSERT INTO tree_survey (專案名稱, 專案代碼, 專案區位, 樹種名稱) VALUES (?, ?, ?, "預設樹種")', [projectName, code, area], (err, insertResults) => {
                if (err) {
                    console.error('新增預設專案錯誤:', err);
                    return res.status(404).json({
                        success: false,
                        message: '找不到專案且無法創建新專案'
                    });
                }
                
                console.log('已新增預設專案:', projectName);
                
                const projectInfo = {
                    id: insertResults.insertId,
                    name: projectName,
                    code: code,
                    area: area,
                    description: '這是一個自動創建的專案',
                    location: area,
                    status: '新建',
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
                };
                
                return res.status(200).json(projectInfo);
            });
        });
    });
});

// 根據專案代碼獲取專案信息
app.get('/api/projects/by_code/:code', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/projects/by_code/${req.params.code} 的請求`);
    
    const projectCode = req.params.code;
    console.log('專案代碼:', projectCode);
    
    // 先嘗試完全匹配
    db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area, id FROM tree_survey WHERE 專案代碼 = ? LIMIT 1', [projectCode], (err, results) => {
        if (err) {
            console.error('查詢專案錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '查詢專案時發生錯誤'
            });
        }
        
        if (results.length > 0) {
            console.log('找到完全匹配的專案:', results[0]);
            
            // 查找該專案的其他資訊
            const projectInfo = {
                id: results[0].id,
                name: results[0].name,
                code: results[0].code,
                area: results[0].area,
                description: '這是一個樹木調查專案',
                location: results[0].area,
                status: '進行中',
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
            };
            
            return res.status(200).json(projectInfo);
        }
        
        // 如果沒有完全匹配，嘗試模糊匹配
        console.log('未找到完全匹配的專案，嘗試模糊匹配');
        db.query('SELECT DISTINCT 專案名稱 as name, 專案代碼 as code, 專案區位 as area, id FROM tree_survey WHERE 專案代碼 LIKE ? LIMIT 1', [`%${projectCode}%`], (err, fuzzyResults) => {
            if (err) {
                console.error('模糊查詢專案錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '模糊查詢專案時發生錯誤'
                });
            }
            
            if (fuzzyResults.length > 0) {
                console.log('找到模糊匹配的專案:', fuzzyResults[0]);
                
                const projectInfo = {
                    id: fuzzyResults[0].id,
                    name: fuzzyResults[0].name,
                    code: fuzzyResults[0].code,
                    area: fuzzyResults[0].area,
                    description: '這是一個樹木調查專案',
                    location: fuzzyResults[0].area,
                    status: '進行中',
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
                };
                
                return res.status(200).json(projectInfo);
            }
            
            // 如果連模糊匹配都沒有找到，返回404
            console.log('未找到模糊匹配的專案，返回404');
            return res.status(404).json({
                success: false,
                message: '找不到該專案代碼的專案'
            });
        });
    });
});

// 根據專案名稱獲取樹木
app.get('/api/tree_survey/by_project/:projectName', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_survey/by_project/${req.params.projectName} 的請求`);
    
    const projectName = req.params.projectName;
    
    // 從資料庫獲取特定專案的樹木資料
    db.query('SELECT * FROM tree_survey WHERE 專案名稱 = ?', [projectName], (err, results) => {
        if (err) {
            console.error('獲取樹木資料錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '獲取樹木資料時發生錯誤'
            });
        }
        
        // 如果沒有樹木資料，返回空數組
        if (results.length === 0) {
            console.log(`沒有找到專案「${projectName}」的樹木資料`);
            // 返回空數組而不是錯誤，這樣前端可以顯示「沒有樹木」而不是錯誤
            return res.status(200).json([]);
        }
        
        console.log(`成功獲取專案「${projectName}」的樹木資料，共 ${results.length} 筆`);
        res.status(200).json(results);
    });
});

// 根據區位名稱獲取樹木
app.get('/api/tree_survey/by_area/:areaName', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_survey/by_area/${req.params.areaName} 的請求`);
    
    const areaName = req.params.areaName;
    
    // 從資料庫獲取特定區位的樹木資料
    db.query('SELECT * FROM tree_survey WHERE 專案區位 = ?', [areaName], (err, results) => {
        if (err) {
            console.error('獲取樹木資料錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '獲取樹木資料時發生錯誤'
            });
        }
        
        // 如果沒有樹木資料，返回空數組
        if (results.length === 0) {
            console.log(`沒有找到區位「${areaName}」的樹木資料`);
            // 返回空數組而不是錯誤，這樣前端可以顯示「沒有樹木」而不是錯誤
            return res.status(200).json([]);
        }
        
        console.log(`成功獲取區位「${areaName}」的樹木資料，共 ${results.length} 筆`);
        res.status(200).json(results);
    });
});

// 啟動伺服器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
});

// 取得系統樹木和專案樹木的最大編號
app.get('/api/tree_survey/next-ids', (req, res) => {
    console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_survey/next-ids 的請求`);
    
    // 獲取系統樹木最大編號
    db.query('SELECT MAX(CAST(SUBSTRING_INDEX(系統樹木, "-", -1) AS UNSIGNED)) as max_system_id FROM tree_survey WHERE 系統樹木 REGEXP "^[A-Za-z]+-[0-9]+$"', (err, systemResults) => {
        if (err) {
            console.error('獲取系統樹木最大編號錯誤:', err);
            return res.status(200).json({
                success: true,
                message: '發生錯誤，返回預設編號',
                data: {
                    nextSystemId: 'T-1001',
                    nextProjectId: 'PT-1001'
                }
            });
        }
        
        // 獲取專案樹木最大編號
        db.query('SELECT MAX(CAST(SUBSTRING_INDEX(專案樹木, "-", -1) AS UNSIGNED)) as max_project_id FROM tree_survey WHERE 專案樹木 REGEXP "^[A-Za-z]+-[0-9]+$"', (err, projectResults) => {
            if (err) {
                console.error('獲取專案樹木最大編號錯誤:', err);
                return res.status(200).json({
                    success: true,
                    message: '發生錯誤，返回預設編號',
                    data: {
                        nextSystemId: 'T-1001',
                        nextProjectId: 'PT-1001'
                    }
                });
            }
            
            // 計算下一個編號
            let maxSystemId = systemResults[0].max_system_id || 1000;
            let maxProjectId = projectResults[0].max_project_id || 1000;
            
            console.log('獲取到系統樹木最大編號:', maxSystemId);
            console.log('獲取到專案樹木最大編號:', maxProjectId);
            
            // 生成下一個編號
            const nextSystemId = `T-${Number(maxSystemId) + 1}`;
            const nextProjectId = `PT-${Number(maxProjectId) + 1}`;
            
            // 返回結果
            res.status(200).json({
                success: true,
                data: {
                    nextSystemId,
                    nextProjectId
                }
            });
        });
    });
});

// 獲取下一個系統樹木編號
app.get('/api/tree_survey/next_system_number', (req, res) => {
  const getNumbersSql = 'SELECT DISTINCT 系統樹木 FROM tree_survey WHERE 系統樹木 IS NOT NULL';
  db.query(getNumbersSql, (err, results) => {
    if (err) {
      console.error('獲取系統樹木編號錯誤:', err);
      return res.status(500).json({ success: false, message: '獲取系統樹木編號時發生錯誤' });
    }

    // 解析現有編號中的數字
    const existingNumbers = results
      .map(row => row.系統樹木)
      .filter(num => num && !isNaN(num))
      .map(num => parseInt(num))
      .filter(num => num > 0)
      .sort((a, b) => a - b);

    console.log('現有系統樹木編號:', existingNumbers);

    // 找出第一個缺失的數字
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }

    // 如果沒有缺失的數字，則使用最大值+1
    if (existingNumbers.length > 0 && nextNumber > existingNumbers[existingNumbers.length - 1]) {
      nextNumber = existingNumbers[existingNumbers.length - 1] + 1;
    }

    console.log(`生成的下一個系統樹木編號: ${nextNumber}`);
    res.json({ success: true, nextNumber: nextNumber });
  });
});

// 獲取下一個專案樹木編號（根據專案代碼）
app.get('/api/tree_survey/next_project_number/:projectCode', (req, res) => {
    const { projectCode } = req.params;
    
    console.log(`[${new Date().toISOString()}] 正在查詢專案代碼 ${projectCode} 的下一個專案樹木編號`);
    
    // 先檢查專案是否存在
    db.query('SELECT COUNT(*) as count FROM tree_survey WHERE 專案代碼 = ?', [projectCode], (err, projectResults) => {
        if (err) {
            console.error('查詢專案錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '查詢專案時發生錯誤'
            });
        }
        
        if (projectResults[0].count === 0) {
            console.log(`專案代碼 ${projectCode} 不存在，從 1 開始`);
            return res.json({
                success: true,
                nextNumber: 1,
                message: '專案不存在，從 1 開始'
            });
        }
        
        // 查詢所有該專案下的樹木編號，支持多種可能的格式
        const numberQuery = `
            SELECT 專案樹木
            FROM tree_survey 
            WHERE 專案代碼 = ? 
        `;
        
        db.query(numberQuery, [projectCode], (err, results) => {
            if (err) {
                console.error('查詢專案樹木編號錯誤:', err);
                return res.status(500).json({
                    success: false,
                    message: '查詢專案樹木編號時發生錯誤'
                });
            }
            
            console.log(`查詢結果: 找到 ${results.length} 個專案樹木編號`);
            
            // 收集所有有效的數字編號
            const usedNumbers = new Set();
            let maxNumber = 0;
            
            for (let result of results) {
                try {
                    let treeNum = result.專案樹木;
                    let num = 0;
                    
                    // 處理不同格式的編號
                    if (typeof treeNum === 'string') {
                        // 格式如 "PT-123" 或 "123"
                        if (treeNum.includes('-')) {
                            num = parseInt(treeNum.split('-')[1]);
                        } else {
                            num = parseInt(treeNum);
                        }
                    } else if (typeof treeNum === 'number') {
                        num = treeNum;
                    }
                    
                    if (!isNaN(num)) {
                        usedNumbers.add(num);
                        maxNumber = Math.max(maxNumber, num);
                    }
                } catch (e) {
                    console.log(`跳過無效編號: ${result.專案樹木}`);
                }
            }
            
            console.log('現有編號集合:', Array.from(usedNumbers).sort((a, b) => a - b));
            
            // 如果該專案沒有記錄或無法解析的編號，從1開始
            if (usedNumbers.size === 0) {
                console.log('沒有可用的專案樹木編號，從 1 開始');
                return res.json({
                    success: true,
                    nextNumber: 1
                });
            }
            
            // 找出第一個缺失的編號
            let nextNumber = 1;
            while (usedNumbers.has(nextNumber)) {
                nextNumber++;
            }
            
            console.log(`下一個可用編號: ${nextNumber}`);
            
            res.json({
                success: true,
                nextNumber: nextNumber,
                existingNumbers: Array.from(usedNumbers).sort((a, b) => a - b)
            });
        });
    });
});

// 碳匯分析與碳交易相關 API
app.get('/api/carbon_trading/market_data', async (req, res) => {
  try {
    // 這裡模擬獲取碳交易市場數據
    // 實際應用中可連接真實碳交易市場API或使用歷史數據
    const marketData = {
      current_price: 25.75, // 美元/噸碳
      trend: 'up',
      historic_prices: [22.5, 23.1, 24.3, 25.2, 25.75],
      forecast: 'rising',
      last_updated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: marketData
    });
  } catch (err) {
    console.error('Error fetching carbon market data:', err);
    res.status(500).json({
      success: false,
      error: '獲取碳交易市場數據失敗'
    });
  }
});

app.get('/api/carbon_trading/credit_calculator', async (req, res) => {
  try {
    // 獲取查詢參數（如項目區域、樹種等）
    const filters = req.query;
    let whereClause = '';
    const params = [];
    
    if (filters.projectArea) {
      whereClause += ' WHERE 專案區位 = ?';
      params.push(filters.projectArea);
    }
    
    if (filters.species) {
      whereClause += whereClause ? ' AND 樹種名稱 = ?' : ' WHERE 樹種名稱 = ?';
      params.push(filters.species);
    }
    
    // 獲取碳儲存和碳吸存數據
    const carbonDataSql = `
      SELECT 
        SUM(碳儲存量) as total_carbon_storage,
        SUM(推估年碳吸存量) as annual_carbon_sequestration
      FROM tree_survey${whereClause}
    `;
    
    const carbonData = await db.query(carbonDataSql, params);
    
    if (!carbonData || carbonData.length === 0) {
      throw new Error('無法計算碳信用額度，資料不足');
    }
    
    const totalCarbonStorage = carbonData[0].total_carbon_storage || 0;
    const annualCarbonSequestration = carbonData[0].annual_carbon_sequestration || 0;
    
    // 模擬碳信用計算 (使用簡化公式)
    // 實際應用中可能需考慮更多變量
    const carbonCredits = {
      // 碳信用通常以噸為單位，數據庫存的是公斤，所以除以1000
      total_credits: totalCarbonStorage / 1000,
      annual_credits: annualCarbonSequestration / 1000,
      estimated_value: {
        current: (totalCarbonStorage / 1000) * 25.75, // 以當前模擬價格計算，美元
        annual_potential: (annualCarbonSequestration / 1000) * 25.75
      },
      details: {
        storage_kg: totalCarbonStorage,
        sequestration_kg_per_year: annualCarbonSequestration,
        market_price_per_ton: 25.75
      }
    };
    
    res.json({
      success: true,
      data: carbonCredits
    });
    
  } catch (err) {
    console.error('Error calculating carbon credits:', err);
    res.status(500).json({
      success: false,
      error: '計算碳信用額度失敗: ' + err.message
    });
  }
});
/*
app.get('/api/carbon_optimization/species_recommendation', async (req, res) => {
  try {
    // 獲取地區參數
    const region = req.query.region || '台北';
    
    // 基於地區獲取適合的樹種推薦
    // 實際應用中可能需要更複雜的計算或外部專家系統
    const speciesRecommendations = [
      {
        species_name: '樟樹',
        carbon_efficiency: 'high',
        growth_rate: 'medium',
        lifespan: 'long',
        maintenance: 'low',
        benefits: ['高碳吸存', '良好適應性', '病蟲害抵抗力強'],
        estimated_annual_sequestration_per_tree: 18.5 // kg/年
      },
      {
        species_name: '台灣欒樹',
        carbon_efficiency: 'medium',
        growth_rate: 'fast',
        lifespan: 'medium',
        maintenance: 'low',
        benefits: ['快速生長', '適應城市環境', '觀賞價值高'],
        estimated_annual_sequestration_per_tree: 15.2 // kg/年
      },
      {
        species_name: '楓香',
        carbon_efficiency: 'high',
        growth_rate: 'medium',
        lifespan: 'long',
        maintenance: 'medium',
        benefits: ['高碳吸存', '抗污染', '水土保持'],
        estimated_annual_sequestration_per_tree: 20.1 // kg/年
      }
    ];
    
    res.json({
      success: true,
      data: {
        region: region,
        recommendations: speciesRecommendations
      }
    });
  } catch (err) {
    console.error('Error generating species recommendations:', err);
    res.status(500).json({
      success: false,
      error: '樹種推薦生成失敗'
    });
  }
});
*/
app.get('/api/carbon_optimization/management_advice', async (req, res) => {
  try {
    // 獲取過濾條件（如項目區域）
    const filters = req.query;
    let whereClause = '';
    const params = [];
    
    if (filters.projectArea) {
      whereClause += ' WHERE 專案區位 = ?';
      params.push(filters.projectArea);
    }
    
    // 獲取樹木健康狀況統計
    const healthStatsSql = `
      SELECT 
        狀況,
        COUNT(*) as count
      FROM tree_survey${whereClause}
      GROUP BY 狀況
    `;
    
    const healthStats = await db.query(healthStatsSql, params);
    
    // 生成樹木管理建議
    const managementAdvice = {
      health_summary: healthStats,
      general_recommendations: [
        {
          category: '健康維護',
          actions: [
            '定期進行樹木健康檢查，特別關注任何疾病或害蟲跡象',
            '確保適當的澆水和施肥計劃，尤其在乾旱期間',
            '修剪損壞或患病的樹枝，改善整體樹冠健康'
          ]
        },
        {
          category: '碳吸存優化',
          actions: [
            '優先保護和維護大型成熟樹木，它們具有最高的碳儲存量',
            '規劃新植樹種結構多樣性，包括不同年齡和大小的樹木',
            '在空地區域增加樹冠覆蓋以最大化碳吸收潛力'
          ]
        },
        {
          category: '長期規劃',
          actions: [
            '開發長期樹木更新計劃，確保森林連續性和持續碳吸收',
            '考慮氣候變化對本地樹種適應性的影響',
            '建立監測系統追蹤樹木健康和碳吸存績效'
          ]
        }
      ]
    };
    
    res.json({
      success: true,
      data: managementAdvice
    });
  } catch (err) {
    console.error('Error generating management advice:', err);
    res.status(500).json({
      success: false,
      error: '管理建議生成失敗'
    });
  }
});

// 碳匯助手相關路由

// AI永續碳匯助手API路由
app.get('/api/carbon-sink/species', carbonSinkController.calculateSpeciesCarbon);
app.post('/api/carbon-sink/calculate', carbonSinkController.calculateTotalCarbon);
app.get('/api/carbon-sink/recommend-by-region', carbonSinkController.recommendByRegion);
app.get('/api/carbon-sink/filter-by-efficiency', carbonSinkController.filterByEfficiency);
app.get('/api/carbon-sink/filter-by-environment', carbonSinkController.filterByEnvironment);
app.post('/api/carbon-sink/mixed-forest', carbonSinkController.generateMixedForest);

// 碳交易市場資料
app.get('/api/carbon_trading/market_data', (req, res) => {
    // 這裡是模擬的碳交易市場資料
    const marketData = {
        current_price: 25.75, // USD per ton
        daily_change: +0.35,
        volume_24h: 1250000,
        market_cap: 4500000000,
        historical_prices: [
            { date: '2023-01-01', price: 22.45 },
            { date: '2023-02-01', price: 23.10 },
            { date: '2023-03-01', price: 24.30 },
            { date: '2023-04-01', price: 23.80 },
            { date: '2023-05-01', price: 24.55 },
            { date: '2023-06-01', price: 25.20 },
            { date: '2023-07-01', price: 25.40 }
        ],
        trading_volume: [
            { date: '2023-01-01', volume: 980000 },
            { date: '2023-02-01', volume: 1050000 },
            { date: '2023-03-01', volume: 1150000 },
            { date: '2023-04-01', volume: 1000000 },
            { date: '2023-05-01', volume: 1100000 },
            { date: '2023-06-01', volume: 1200000 },
            { date: '2023-07-01', volume: 1250000 }
        ]
    };

    res.json({
        success: true,
        data: marketData
    });
});

// 永續碳匯助手 - 樹種資料
app.get('/api/carbon-sink/tree-species', carbonSinkController.getTreeSpecies);

// 永續碳匯助手 - 計算特定樹種的碳吸收量
app.get('/api/carbon-sink/species', carbonSinkController.calculateSpeciesCarbon);

// 永續碳匯助手 - 計算總碳吸收量
app.post('/api/carbon-sink/calculate', carbonSinkController.calculateTotalCarbon);

// 永續碳匯助手 - 根據地區推薦適合樹種
app.get('/api/carbon-sink/recommend-by-region', carbonSinkController.recommendByRegion);

// 永續碳匯助手 - 依碳吸收效率篩選樹種
app.get('/api/carbon-sink/filter-by-efficiency', carbonSinkController.filterByEfficiency);

// 永續碳匯助手 - 根據環境條件篩選樹種
app.get('/api/carbon-sink/filter-by-environment', carbonSinkController.filterByEnvironment);

// 永續碳匯助手 - 生成混合造林推薦
app.post('/api/carbon-sink/mixed-forest', carbonSinkController.generateMixedForest);

// 樹木知識管理 API 路由
app.post('/api/knowledge', knowledgeController.addKnowledge);
app.get('/api/knowledge', knowledgeController.getKnowledge);
app.delete('/api/knowledge/:id', knowledgeController.deleteKnowledge);
app.get('/api/knowledge/search', knowledgeController.searchKnowledge);
app.post('/api/knowledge/initialize', knowledgeController.initializeDefaultKnowledge);

// 獲取專案的常見樹種
app.get('/api/tree_survey/common_species/:projectCode', (req, res) => {
  console.log(`[${new Date().toISOString()}] ===> 收到了 GET /api/tree_survey/common_species/${req.params.projectCode} 的請求`);
  
  const projectCode = req.params.projectCode;
  
  // 查詢該專案中最常見的樹種
  const sql = `
    SELECT 樹種編號, 樹種名稱, COUNT(*) as count
    FROM tree_survey
    WHERE 專案代碼 = ?
    GROUP BY 樹種編號, 樹種名稱
    ORDER BY count DESC
    LIMIT 5
  `;
  
  db.query(sql, [projectCode], (err, results) => {
    if (err) {
      console.error('獲取常見樹種錯誤:', err);
      return res.status(500).json({
        success: false,
        message: '獲取常見樹種時發生錯誤'
      });
    }
    
    console.log('專案常見樹種:', results);
    
    res.json({
      success: true,
      data: results
    });
  });
});

// 驗證位置是否在指定區位的合理範圍內
app.post('/api/location/validate', (req, res) => {
  console.log(`[${new Date().toISOString()}] ===> 收到了 POST /api/location/validate 的請求`);
  console.log('請求內容:', req.body);
  
  const { area, latitude, longitude } = req.body;
  
  // 定義各區位的合理範圍（經緯度）
  const areaBoundaries = {
    '高雄港': {
      minLat: 22.5,
      maxLat: 22.7,
      minLng: 120.2,
      maxLng: 120.4,
      buffer: 0.1 // 邊界緩衝區（度）
    },
    '花蓮港': {
      minLat: 23.9,
      maxLat: 24.1,
      minLng: 121.5,
      maxLng: 121.7,
      buffer: 0.1
    },
    '基隆港': {
      minLat: 25.1,
      maxLat: 25.3,
      minLng: 121.7,
      maxLng: 121.9,
      buffer: 0.1
    },
    '台中港': {
      minLat: 24.2,
      maxLat: 24.4,
      minLng: 120.4,
      maxLng: 120.6,
      buffer: 0.1
    },
    '台北港': {
      minLat: 25.1,
      maxLat: 25.3,
      minLng: 121.3,
      maxLng: 121.5,
      buffer: 0.1
    }
  };

  // 檢查是否在緩衝區內
  const isInBuffer = (lat, lng, boundary) => {
    const buffer = boundary.buffer;
    return (
      lat >= boundary.minLat - buffer &&
      lat <= boundary.maxLat + buffer &&
      lng >= boundary.minLng - buffer &&
      lng <= boundary.maxLng + buffer
    );
  };

  // 檢查是否在主要範圍內
  const isInMainArea = (lat, lng, boundary) => {
    return (
      lat >= boundary.minLat &&
      lat <= boundary.maxLat &&
      lng >= boundary.minLng &&
      lng <= boundary.maxLng
    );
  };

  // 獲取區位的邊界
  const boundary = areaBoundaries[area];
  if (!boundary) {
    return res.json({
      success: false,
      message: '未知的區位',
      isValid: false
    });
  }

  // 檢查位置
  const inMainArea = isInMainArea(latitude, longitude, boundary);
  const inBuffer = isInBuffer(latitude, longitude, boundary);

  // 計算到最近邊界的距離
  const distanceToBoundary = Math.min(
    Math.abs(latitude - boundary.minLat),
    Math.abs(latitude - boundary.maxLat),
    Math.abs(longitude - boundary.minLng),
    Math.abs(longitude - boundary.maxLng)
  );

  res.json({
    success: true,
    isValid: inMainArea || inBuffer,
    inMainArea: inMainArea,
    inBuffer: inBuffer,
    distanceToBoundary: distanceToBoundary,
    message: inMainArea
        ? '位置在區位範圍內'
        : inBuffer
            ? '位置在區位邊界附近'
            : '位置超出區位範圍'
  });
});

// 建議合理的區位
app.post('/api/location/suggest_area', (req, res) => {
  console.log(`[${new Date().toISOString()}] ===> 收到了 POST /api/location/suggest_area 的請求`);
  console.log('請求內容:', req.body);
  
  const { latitude, longitude } = req.body;
  
  // 定義各區位的合理範圍（經緯度）
  const areaBoundaries = {
    '高雄港': {
      minLat: 22.5,
      maxLat: 22.7,
      minLng: 120.2,
      maxLng: 120.4,
      buffer: 0.1
    },
    '花蓮港': {
      minLat: 23.9,
      maxLat: 24.1,
      minLng: 121.5,
      maxLng: 121.7,
      buffer: 0.1
    },
    '基隆港': {
      minLat: 25.1,
      maxLat: 25.3,
      minLng: 121.7,
      maxLng: 121.9,
      buffer: 0.1
    },
    '台中港': {
      minLat: 24.2,
      maxLat: 24.4,
      minLng: 120.4,
      maxLng: 120.6,
      buffer: 0.1
    },
    '台北港': {
      minLat: 25.1,
      maxLat: 25.3,
      minLng: 121.3,
      maxLng: 121.5,
      buffer: 0.1
    }
  };

  // 計算到每個區位中心的距離
  const distances = Object.entries(areaBoundaries).map(([area, boundary]) => {
    const centerLat = (boundary.minLat + boundary.maxLat) / 2;
    const centerLng = (boundary.minLng + boundary.maxLng) / 2;
    
    // 使用簡化的距離計算（不考慮地球曲率）
    const distance = Math.sqrt(
      Math.pow(latitude - centerLat, 2) +
      Math.pow(longitude - centerLng, 2)
    );
    
    return { area, distance };
  });

  // 按距離排序
  distances.sort((a, b) => a.distance - b.distance);

  // 返回最近的區位
  res.json({
    success: true,
    suggestedArea: distances[0].area,
    distance: distances[0].distance,
    alternatives: distances.slice(1, 3).map(d => ({
      area: d.area,
      distance: d.distance
    }))
  });
});

// 新增專案
app.post('/api/projects/add', (req, res) => {
  const { name, area } = req.body;
  
  // 1. 獲取現有專案代碼
  const getCodesSql = 'SELECT DISTINCT 專案代碼 FROM tree_survey WHERE 專案代碼 IS NOT NULL';
  db.query(getCodesSql, (err, codeResults) => {
    if (err) {
      console.error('獲取專案代碼錯誤:', err);
      return res.status(500).json({ success: false, message: '獲取現有專案代碼時發生錯誤' });
    }

    // 解析現有代碼中的數字
    const existingNumbers = codeResults
      .map(row => row.專案代碼)
      .filter(code => code && !isNaN(code))
      .map(code => parseInt(code))
      .filter(num => num > 0)
      .sort((a, b) => a - b);

    console.log('現有專案代碼數字:', existingNumbers);

    // 找出第一個缺失的數字
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }

    // 如果沒有缺失的數字，則使用最大值+1
    if (existingNumbers.length > 0 && nextNumber > existingNumbers[existingNumbers.length - 1]) {
      nextNumber = existingNumbers[existingNumbers.length - 1] + 1;
    }

    const newCode = nextNumber.toString(); // 轉換為字串
    console.log(`生成的專案代碼: ${newCode}`);

    // 2. 新增專案記錄（預設樹木）
    const insertSql = 'INSERT INTO tree_survey (專案名稱, 專案代碼, 專案區位, 樹種名稱, 系統樹木, 專案樹木, 樹種編號, X坐標, Y坐標, 狀況, 註記, 樹木備註, 樹高（公尺）, 胸徑（公分）, 調查備註, 調查時間, 碳儲存量, 推估年碳吸存量) VALUES (?, ?, ?, "預設樹種", 0, 0, "0000", 0, 0, "正常", "無", "無", 0, 0, "無", NOW(), 0, 0)';
    db.query(insertSql, [name, newCode, area], (err, insertResult) => {
      if (err) {
        console.error('新增專案記錄錯誤:', err);
        return res.status(500).json({ success: false, message: '新增專案記錄時發生錯誤' });
      }

      // 3. 檢查並刪除預設樹種記錄
      const checkDefaultSql = 'SELECT COUNT(*) as total FROM tree_survey WHERE 專案名稱 = ?';
      db.query(checkDefaultSql, [name], (err, countResult) => {
        if (err) {
          console.error('檢查預設樹種記錄錯誤:', err);
          return res.status(500).json({ success: false, message: '檢查預設樹種記錄時發生錯誤' });
        }

        const totalCount = countResult[0].total;
        console.log(`專案 ${name} 的總記錄數: ${totalCount}`);

        // 如果只有一筆記錄（預設樹種）或是多筆記錄，則刪除預設樹種
        if (totalCount > 0) {
          const deleteDefaultSql = 'DELETE FROM tree_survey WHERE 專案名稱 = ? AND 樹種名稱 = "預設樹種"';
          db.query(deleteDefaultSql, [name], (err, deleteResult) => {
            if (err) {
              console.error('刪除預設樹種記錄錯誤:', err);
              return res.status(500).json({ success: false, message: '刪除預設樹種記錄時發生錯誤' });
            }
            console.log(`已刪除專案 ${name} 的預設樹種記錄`);
          });
        }

        res.status(201).json({
          success: true,
          message: '專案新增成功',
          project: {
            name: name,
            code: newCode,
            area: area
          }
        });
      });
    });
  });
});

// 提交樹木資料時，刪除預設記錄
app.post('/api/tree_survey', (req, res) => {
  // 先刪除該專案的預設記錄
  const deleteDefaultSql = 'DELETE FROM tree_survey WHERE 專案代碼 = ? AND 樹種名稱 = "預設樹種"';
  db.query(deleteDefaultSql, [req.body.專案代碼], (err, deleteResult) => {
    if (err) {
      console.error('刪除預設記錄錯誤:', err);
      return res.status(500).json({ success: false, message: '刪除預設記錄時發生錯誤' });
    }

    console.log('已刪除預設記錄，影響行數:', deleteResult.affectedRows);

    // 新增實際的樹木資料
    const fields = {
      專案區位: req.body.專案區位 || '無',
      專案代碼: req.body.專案代碼 || '無',
      專案名稱: req.body.專案名稱 || '無',
      系統樹木: req.body.系統樹木 || '無',
      專案樹木: req.body.專案樹木 || '無',
      樹種編號: req.body.樹種編號 || '無',
      樹種名稱: req.body.樹種名稱 || '無',
      X坐標: req.body.X坐標 || 0,
      Y坐標: req.body.Y坐標 || 0,
      狀況: req.body.狀況 || '無',
      註記: req.body.註記 || '無',
      樹木備註: req.body.樹木備註 || '無',
      樹高公尺: req.body["樹高（公尺）"] || 0,
      胸徑公分: req.body["胸徑（公分）"] || 0,
      調查備註: req.body.調查備註 || '無',
      調查時間: req.body.調查時間 || new Date().toISOString(),
      碳儲存量: req.body.碳儲存量 || 0,
      推估年碳吸存量: req.body.推估年碳吸存量 || 0
    };

    const sql = `
      INSERT INTO tree_survey 
      (\`專案區位\`, \`專案代碼\`, \`專案名稱\`, \`系統樹木\`, \`專案樹木\`, \`樹種編號\`, 
      \`樹種名稱\`, \`X坐標\`, \`Y坐標\`, \`狀況\`, \`註記\`, \`樹木備註\`, \`樹高（公尺）\`, 
      \`胸徑（公分）\`, \`調查備註\`, \`調查時間\`, \`碳儲存量\`, \`推估年碳吸存量\`) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, Object.values(fields), (err, results) => {
      if (err) {
        console.error('新增樹木資料錯誤:', err);
        return res.status(500).json({ success: false, message: '新增樹木資料時發生錯誤' });
      }
      res.status(201).json({ success: true, message: '樹木資料新增成功' });
    });
  });
});

// 取消或失敗時，刪除預設記錄
app.delete('/api/tree_survey/default/:projectCode', (req, res) => {
  const deleteSql = 'DELETE FROM tree_survey WHERE 專案代碼 = ? AND 樹種名稱 = "預設樹種"';
  db.query(deleteSql, [req.params.projectCode], (err, result) => {
    if (err) {
      console.error('刪除預設記錄錯誤:', err);
      return res.status(500).json({ success: false, message: '刪除預設記錄時發生錯誤' });
    }
    console.log('已刪除預設記錄，影響行數:', result.affectedRows);
    res.json({ success: true, message: '預設記錄已刪除' });
  });
});

// 更新使用者關聯專案
app.put('/api/users/:userId/projects', (req, res) => {
    const { userId } = req.params;
    const { projects } = req.body; // 專案代碼陣列

    if (!Array.isArray(projects)) {
        return res.status(400).json({
            success: false,
            message: '專案清單格式錯誤'
        });
    }

    const projectsString = projects.join(',');
    const updateQuery = 'UPDATE users SET associated_projects = ? WHERE user_id = ?';

    db.query(updateQuery, [projectsString, userId], (err, result) => {
        if (err) {
            console.error('更新關聯專案錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '更新關聯專案時發生錯誤'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }

        res.json({
            success: true,
            message: '關聯專案更新成功'
        });
    });
});

// 獲取使用者關聯專案
app.get('/api/users/:userId/projects', (req, res) => {
    const { userId } = req.params;

    const query = 'SELECT associated_projects FROM users WHERE user_id = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('獲取關聯專案錯誤:', err);
            return res.status(500).json({
                success: false,
                message: '獲取關聯專案時發生錯誤'
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }

        const associatedProjects = results[0].associated_projects;
        const projectList = associatedProjects ? associatedProjects.split(',') : [];

        // 獲取專案詳細資訊
        if (projectList.length > 0) {
            const projectQuery = 'SELECT DISTINCT 專案代碼, 專案名稱, 專案區位 FROM tree_survey WHERE 專案代碼 IN (?)';
            db.query(projectQuery, [projectList], (err, projectResults) => {
                if (err) {
                    console.error('獲取專案詳細資訊錯誤:', err);
                    return res.status(500).json({
                        success: false,
                        message: '獲取專案詳細資訊時發生錯誤'
                    });
                }

                res.json({
                    success: true,
                    projects: projectResults
                });
            });
        } else {
            res.json({
                success: true,
                projects: []
            });
        }
    });
});

// 初始化 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 添加一個測試路由來驗證 OpenAI 設置
app.get('/api/test-openai', async (req, res) => {
  try {
    console.log('Testing OpenAI connection...');
    console.log('API Key status:', process.env.OPENAI_API_KEY ? 'Set' : 'Not Set');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Hello! This is a test message."
        }
      ],
      max_tokens: 50
    });

    res.json({
      success: true,
      message: completion.choices[0].message.content
    });
  } catch (error) {
    console.error('OpenAI test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 永續報告路由
app.get('/api/reports/sustainability', async (req, res) => {
    try {
        // 從資料庫獲取基本統計數據
        const [basicStats] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_trees,
                    COUNT(DISTINCT 樹種名稱) as species_count,
                    AVG(樹高（公尺）) as avg_height,
                    AVG(胸徑（公分）) as avg_dbh,
                    SUM(碳儲存量) as total_carbon_storage,
                    SUM(推估年碳吸存量) as total_annual_carbon_sequestration
                FROM tree_survey
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // 獲取物種多樣性數據
        const [speciesDiversity] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    樹種名稱,
                    COUNT(*) as count,
                    (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
                FROM tree_survey 
                GROUP BY 樹種名稱
                ORDER BY count DESC
                LIMIT 5
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // 獲取健康狀況數據
        const [healthStatus] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    狀況,
                    COUNT(*) as count,
                    (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
                FROM tree_survey 
                GROUP BY 狀況
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // 獲取胸徑分佈數據
        const [dbhDistribution] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    CASE 
                        WHEN 胸徑（公分） < 20 THEN '0-20'
                        WHEN 胸徑（公分） < 40 THEN '20-40'
                        WHEN 胸徑（公分） < 60 THEN '40-60'
                        WHEN 胸徑（公分） < 80 THEN '60-80'
                        ELSE '80+'
                    END as dbh_range,
                    COUNT(*) as count,
                    (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
                FROM tree_survey 
                GROUP BY dbh_range
                ORDER BY MIN(胸徑（公分）)
            `, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        const reportData = {
            basicStats: basicStats[0],
            speciesDiversity,
            healthStatus,
            dbhDistribution,
            generatedAt: new Date().toISOString()
        };

        // 使用 OpenAI 生成報告內容
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "你是一個專業的樹木調查報告生成助手。請根據提供的資料生成一份詳細的報告。"
                },
                {
                    role: "user",
                    content: `請根據以下數據生成一份專業的樹木調查報告：
                    
基本統計：
- 總樹木數量：${reportData.basicStats.total_trees} 棵
- 物種數量：${reportData.basicStats.species_count} 種
- 平均樹高：${reportData.basicStats.avg_height?.toFixed(2)} 公尺
- 平均胸徑：${reportData.basicStats.avg_dbh?.toFixed(2)} 公分
- 總碳儲存量：${reportData.basicStats.total_carbon_storage?.toFixed(2)} 公斤
- 年碳吸存量：${reportData.basicStats.total_annual_carbon_sequestration?.toFixed(2)} 公斤/年

物種多樣性（前5名）：
${reportData.speciesDiversity.map(s => `- ${s.樹種名稱}: ${s.count} 棵 (${s.percentage.toFixed(1)}%)`).join('\n')}

健康狀況分佈：
${reportData.healthStatus.map(h => `- ${h.狀況}: ${h.count} 棵 (${h.percentage.toFixed(1)}%)`).join('\n')}

胸徑分佈：
${reportData.dbhDistribution.map(d => `- ${d.dbh_range} 公分: ${d.count} 棵 (${d.percentage.toFixed(1)}%)`).join('\n')}

請生成一份包含以下內容的報告：
1. 總體概述
2. 物種多樣性分析
3. 樹木健康狀況評估
4. 生長狀況分析
5. 碳匯貢獻評估
6. 管理建議
7. 結論`
                }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });

        res.json({
            success: true,
            data: reportData,
            report: completion.choices[0].message.content
        });
    } catch (error) {
        console.error('生成永續報告錯誤:', error);
        res.status(500).json({
            success: false,
            message: '生成永續報告時發生錯誤',
            error: error.message
        });
    }
});

// 刪除樹木時自動清理無用區位
const cleanupUnusedProjectAreas = (callback) => {
  // 找出所有在 project_areas 但 tree_survey 沒有用到的區位
  const sql = `DELETE FROM project_areas WHERE area_name NOT IN (SELECT DISTINCT 專案區位 FROM tree_survey WHERE 專案區位 IS NOT NULL AND 專案區位 != '')`;
  db.query(sql, callback);
};

// 移除舊的間接修改路由的方式 (註釋掉而非刪除，以便將來參考)
/*
const oldDeleteTreeSurvey = app._router.stack.find(r => r.route && r.route.path === '/api/tree_survey/:id' && r.route.methods.delete);
if (oldDeleteTreeSurvey) {
  const oldHandler = oldDeleteTreeSurvey.route.stack[0].handle;
  oldDeleteTreeSurvey.route.stack[0].handle = function(req, res, next) {
    oldHandler.call(this, req, res, function() {
      cleanupUnusedProjectAreas(() => {});
      next && next();
    });
  };
}
*/

// 新增一個 API 供前端手動清理
app.post('/api/project_areas/cleanup', (req, res) => {
  // 先清理未使用的樹種
  cleanupUnusedSpecies();
  
  // 再清理未使用區位
  cleanupUnusedProjectAreas((err, result) => {
    if (err) {
      console.error('清理無用區位失敗:', err);
      return res.status(500).json({ success: false, message: '清理失敗' });
    }
    res.json({ 
      success: true, 
      message: '清理完成', 
      affectedRows: result ? result.affectedRows : 0 
    });
  });
});

// 載入台灣縣市 GeoJSON 資料
const taiwanGeoJSON = JSON.parse(fs.readFileSync('./data/twCounty2010.fixed.geo.json', 'utf8'));

// 將 GeoJSON 轉換為 Map，方便查詢
const countyPolygons = new Map();
taiwanGeoJSON.features.forEach((feature) => {
  // 將縣市名稱標準化（例如「臺北市」→「台北」）
  const name = feature.properties.COUNTYNAME.replace('臺', '台').replace('市', '').replace('縣', '');
  countyPolygons.set(name, feature.geometry);
});

// 定義各縣市的坐標範圍
const cityBounds = {
  '台北': { minLat: 25.01, maxLat: 25.22, minLng: 121.45, maxLng: 121.65 },
  '新北': { minLat: 24.70, maxLat: 25.30, minLng: 121.28, maxLng: 122.05 },
  '桃園': { minLat: 24.80, maxLat: 25.10, minLng: 121.10, maxLng: 121.45 },
  '台中': { minLat: 24.05, maxLat: 24.40, minLng: 120.55, maxLng: 121.05 },
  '台南': { minLat: 22.90, maxLat: 23.40, minLng: 120.10, maxLng: 120.50 },
  '高雄': { minLat: 22.40, maxLat: 23.00, minLng: 120.15, maxLng: 120.50 },
  '基隆': { minLat: 25.05, maxLat: 25.20, minLng: 121.65, maxLng: 121.85 },
  '新竹': { minLat: 24.70, maxLat: 24.85, minLng: 120.90, maxLng: 121.05 },
  '嘉義': { minLat: 23.45, maxLat: 23.55, minLng: 120.40, maxLng: 120.50 },
  '宜蘭': { minLat: 24.50, maxLat: 24.90, minLng: 121.65, maxLng: 121.95 },
  '花蓮': { minLat: 23.30, maxLat: 24.40, minLng: 121.30, maxLng: 121.65 },
  '台東': { minLat: 22.50, maxLat: 23.40, minLng: 120.90, maxLng: 121.20 },
  '澎湖': { minLat: 23.45, maxLat: 23.70, minLng: 119.40, maxLng: 119.70 },
  '金門': { minLat: 24.40, maxLat: 24.55, minLng: 118.25, maxLng: 118.45 },
  '連江': { minLat: 25.95, maxLat: 26.30, minLng: 119.90, maxLng: 120.20 },
  '苗栗': { minLat: 24.25, maxLat: 24.70, minLng: 120.65, maxLng: 121.10 },
  '彰化': { minLat: 23.85, maxLat: 24.15, minLng: 120.35, maxLng: 120.60 },
  '南投': { minLat: 23.60, maxLat: 24.10, minLng: 120.75, maxLng: 121.15 },
  '雲林': { minLat: 23.55, maxLat: 23.80, minLng: 120.15, maxLng: 120.50 },
  '屏東': { minLat: 22.10, maxLat: 22.80, minLng: 120.40, maxLng: 120.80 }
};

// 判斷點是否在縣市內 (改進版)
function isPointInCounty(lat, lng, countyName) {
  const polygon = countyPolygons.get(countyName);
  if (!polygon) return false;
  
  const point = turf.point([lng, lat]);
  
  try {
    if (polygon.type === 'Polygon') {
      // 直接使用完整多邊形
      const poly = turf.polygon(polygon.coordinates);
      return turf.booleanPointInPolygon(point, poly);
    } 
    else if (polygon.type === 'MultiPolygon') {
      // 對每個多邊形進行檢查
      for (const polyCoords of polygon.coordinates) {
        const poly = turf.polygon(polyCoords);
        if (turf.booleanPointInPolygon(point, poly)) {
          return true;
        }
      }
    }
    return false;
  } catch (e) {
    console.error('isPointInCounty 發生錯誤:', e);
    // 發生錯誤時嘗試使用坐標範圍判斷
    return isPointInCityBounds(lat, lng, countyName);
  }
}

// 使用坐標範圍判斷縣市
function isPointInCityBounds(lat, lng, countyName) {
  const bounds = cityBounds[countyName];
  if (!bounds) return false;
  
  return (
    lat >= bounds.minLat && 
    lat <= bounds.maxLat && 
    lng >= bounds.minLng && 
    lng <= bounds.maxLng
  );
}

// 根據經緯度判斷所屬縣市 (改進版)
function getCountyByCoordinates(lat, lng) {
  // 先嘗試精確的GeoJSON判斷
  for (const [county, polygon] of countyPolygons) {
    const result = isPointInCounty(lat, lng, county);
    if (result) {
      console.log(`[DEBUG] 座標(${lat},${lng}) 命中縣市(GeoJSON): ${county}`);
      return county;
    }
  }
  
  // 如果精確判斷失敗，嘗試用坐標範圍判斷
  for (const [county, bounds] of Object.entries(cityBounds)) {
    if (
      lat >= bounds.minLat && 
      lat <= bounds.maxLat && 
      lng >= bounds.minLng && 
      lng <= bounds.maxLng
    ) {
      console.log(`[DEBUG] 座標(${lat},${lng}) 命中縣市(坐標範圍): ${county}`);
      return county;
    }
  }
  
  // 特殊處理台北市中心區域 (補充判斷)
  if (lat >= 25.0 && lat <= 25.1 && lng >= 121.45 && lng <= 121.6) {
    console.log(`[DEBUG] 座標(${lat},${lng}) 特殊判斷為台北市`);
    return '台北';
  }
  
  console.log(`[DEBUG] 座標(${lat},${lng}) 未命中任何縣市`);
  return null;
}

// 新增一個清理未使用樹種的函數
function cleanupUnusedSpecies() {
    console.log(`[${new Date().toISOString()}] ===> 開始清理未使用的樹種`);
    
    // 找出在 tree_survey 表中沒有對應資料的樹種
    const query = `
        DELETE ts FROM tree_species ts
        LEFT JOIN tree_survey tsv ON ts.id = tsv.樹種編號
        WHERE tsv.樹種編號 IS NULL
        AND ts.id != '0000'  -- 保留"其他"這個特殊樹種
    `;
    
    db.query(query, (err, result) => {
        if (err) {
            console.error('清理未使用樹種時發生錯誤:', err);
            return;
        }
        if (result.affectedRows > 0) {
            console.log(`已清理 ${result.affectedRows} 個未使用的樹種`);
        }
    });
}

// 新版：樹種碳匯比較與推薦 API
app.get('/api/carbon_optimization/species_recommendation', async (req, res) => {
    try {
        const { region_code, limit = 5, min_score = 3, min_carbon_absorption_per_year = 0 } = req.query;

        if (!region_code) {
            return res.status(400).json({ success: false, message: '請提供 region_code (區域代碼)' });
        }

        const query = `
            SELECT 
                tcd.id AS species_id,
                tcd.common_name_zh,
                tcd.scientific_name,
                tcd.carbon_absorption_min,
                tcd.carbon_absorption_max,
                (tcd.carbon_absorption_min + tcd.carbon_absorption_max) / 2 AS avg_carbon_absorption,
                tcd.carbon_efficiency,
                tcd.growth_rate,
                tcd.ecological_value,
                srs.score AS region_score,
                srs.region_code
            FROM 
                tree_carbon_data tcd
            JOIN 
                species_region_score srs ON tcd.id = srs.species_id
            WHERE 
                srs.region_code = ? AND srs.score >= ?
            HAVING 
                avg_carbon_absorption >= ? 
            ORDER BY 
                srs.score DESC, avg_carbon_absorption DESC
            LIMIT ?;
        `;

        const recommendations = await new Promise((resolve, reject) => {
            db.query(query, [region_code, parseFloat(min_score), parseFloat(min_carbon_absorption_per_year), parseInt(limit)], (err, results) => {
                if (err) {
                    console.error('查詢樹種推薦時發生錯誤:', err);
                    return reject(err);
                }
                resolve(results);
            });
        });

        if (recommendations.length === 0) {
            return res.status(404).json({ success: false, message: '在指定條件下找不到符合的樹種推薦。請嘗試調整查詢參數 (例如降低 min_score 或 min_carbon_absorption_per_year)。' });
        }

        res.json({ success: true, data: recommendations });

    } catch (error) {
        console.error('獲取樹種推薦時發生錯誤:', error);
        res.status(500).json({ success: false, message: '獲取樹種推薦時發生內部錯誤' });
    }
});

// 新增：獲取所有樹種列表 (用於前端選擇)
app.get('/api/tree-carbon-data/species-list', async (req, res) => {
    console.log(`[API] Received GET /api/tree-carbon-data/species-list`);
    try {
        const query = 'SELECT id, common_name_zh FROM tree_carbon_data ORDER BY common_name_zh';
        const speciesList = await new Promise((resolve, reject) => {
            db.query(query, (err, results) => {
                if (err) {
                    console.error('[API Error] Error fetching species list:', err);
                    return reject(err);
                }
                resolve(results);
            });
        });
        console.log(`[API Success] Fetched ${speciesList.length} species.`);
        res.json({ success: true, data: speciesList });
    } catch (error) {
        console.error('[API Error] Internal error fetching species list:', error);
        res.status(500).json({ success: false, message: '獲取樹種列表時發生內部錯誤' });
    }
});

// 新增：獲取選定樹種在特定區域的詳細比較數據
app.post('/api/species-comparison/details', async (req, res) => {
    const { species_ids, region_code } = req.body;
    console.log(`[API] Received POST /api/species-comparison/details with species_ids: ${JSON.stringify(species_ids)}, region_code: ${region_code}`);

    if (!species_ids || !Array.isArray(species_ids) || species_ids.length === 0) {
        return res.status(400).json({ success: false, message: '請提供有效的 species_ids (樹種ID陣列)' });
    }
    if (!region_code) {
        return res.status(400).json({ success: false, message: '請提供 region_code (區域代碼)' });
    }

    try {
        const placeholders = species_ids.map(() => '?').join(',');
        const query = `
            SELECT 
                tcd.id AS species_id,
                tcd.common_name_zh,
                tcd.scientific_name,
                (tcd.carbon_absorption_min + tcd.carbon_absorption_max) / 2 AS avg_carbon_absorption,
                srs.score AS region_score,
                tcd.growth_rate,
                (tcd.max_height_min + tcd.max_height_max) / 2 AS max_height_avg,
                (tcd.lifespan_min + tcd.lifespan_max) / 2 AS lifespan_avg,
                tcd.drought_tolerance,
                tcd.salt_tolerance,
                tcd.ecological_value,
                tcd.carbon_efficiency
            FROM 
                tree_carbon_data tcd
            LEFT JOIN 
                species_region_score srs ON tcd.id = srs.species_id AND srs.region_code = ?
            WHERE 
                tcd.id IN (${placeholders})
            ORDER BY FIELD(tcd.id, ${placeholders});
        `;
        // ORDER BY FIELD ensures the results are in the same order as species_ids

        const queryParams = [region_code, ...species_ids, ...species_ids];
        
        console.log(`[API Query] Executing SQL: ${query} with params: ${JSON.stringify(queryParams)}`);

        const comparisonData = await new Promise((resolve, reject) => {
            db.query(query, queryParams, (err, results) => {
                if (err) {
                    console.error('[API Error] Error fetching species comparison details:', err);
                    return reject(err);
                }
                resolve(results);
            });
        });

        if (comparisonData.length === 0) {
            console.log(`[API Info] No comparison data found for species_ids: ${JSON.stringify(species_ids)} and region_code: ${region_code}`);
            return res.status(404).json({ success: false, message: '找不到指定樹種或區域的比較數據。' });
        }
        
        // Ensure region_score is null if no match in species_region_score, rather than the row being excluded
        // The LEFT JOIN handles this, but we can explicitly format if needed.
        const formattedData = comparisonData.map(item => ({
            ...item,
            avg_carbon_absorption: parseFloat(item.avg_carbon_absorption?.toFixed(2) ?? 0),
            max_height_avg: parseFloat(item.max_height_avg?.toFixed(2) ?? 0),
            lifespan_avg: parseFloat(item.lifespan_avg?.toFixed(2) ?? 0),
            region_score: item.region_score === null ? 0 : item.region_score // Default score to 0 if no specific region score found
        }));

        console.log(`[API Success] Fetched comparison data: ${JSON.stringify(formattedData)}`);
        res.json({ success: true, data: formattedData });

    } catch (error) {
        console.error('[API Error] Internal error fetching species comparison details:', error);
        res.status(500).json({ success: false, message: '獲取樹種比較數據時發生內部錯誤' });
    }
});

// 樹木管理建議 API 路由
app.post('/api/tree-management/actions/generate', treeManagementController.generateManagementActions);
app.get('/api/tree-management/actions', treeManagementController.getManagementActions);
app.put('/api/tree-management/actions/:action_id', treeManagementController.updateManagementAction);
app.delete('/api/tree-management/actions/:action_id', treeManagementController.deleteManagementAction);

// 初始化 Anthropic 客戶端 (如果 API Key 存在)
let anthropic;
if (process.env.Claude_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.Claude_API_KEY });
    console.log('[API Init] Claude SDK initialized.');
} else {
    console.warn("[API Init] Claude API Key (Claude_API_KEY) not set in .env. Claude models will be unavailable.");
}

// 新增：初始化 SiliconFlow 客戶端 (如果 API Key 存在)
let siliconFlowLlm;
if (process.env.SiliconFlow_API_KEY) {
    siliconFlowLlm = new OpenAI({ // 使用 OpenAI SDK 因為 SiliconFlow API 兼容
        apiKey: process.env.SiliconFlow_API_KEY,
        baseURL: 'https://api.siliconflow.cn/v1', // 請再次確認此端點是否正確
    });
    console.log('[API Init] SiliconFlow SDK (for Qwen/DeepSeek) initialized.');
} else {
    console.warn("[API Init] SiliconFlow API Key (SiliconFlow_API_KEY) not set in .env. Qwen/DeepSeek models via SiliconFlow will be unavailable.");
}
