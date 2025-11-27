require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimiter');
const { 
    cleanupUnusedProjectAreas, 
    cleanupUnusedSpecies, 
    cleanupOrphanedPlaceholders 
} = require('./utils/cleanup');

const { execSync } = require('child_process');

const app = express();

// [CRITICAL FIX] 強制在應用程式啟動時執行資料庫遷移
// ------------------------------------------------------------------
// [Context / 背景]
// 由於部署平台 (Render) 的 Start Command 有時會覆蓋 package.json 的設定，
// 導致 `npm start` 中的 `node scripts/migrate.js` 未被執行。
// 這會造成新部署的程式碼依賴新的 DB Schema，但 DB 卻還沒更新，引發崩潰。
//
// [Current Solution / 當前解法]
// 在 app.js 啟動前，透過 child_process 同步執行 migrate.js。
// 優點：保證 Code 與 DB 絕對同步。
// 缺點：增加啟動時間；若多實例同時啟動可能會有多重執行 (雖 SQL 已做冪等防護)。
//
// [Future Improvement / 未來改進]
// 1. 修正 Render.com 的 Start Command 設定，確保它執行 `npm start`。
// 2. 將 Migration 移至 CI/CD 流程的 "Pre-Deploy" 階段。
// 3. 當確認平台設定正確後，可移除此段 execSync 程式碼。
// ------------------------------------------------------------------
try {
    console.log('[Startup] Forcing database migration...');
    const output = execSync('node scripts/migrate.js', { encoding: 'utf-8' });
    console.log('[Startup] Migration output:\n', output);

    // [DEBUG] Run diagnosis script immediately after migration
    console.log('[Startup] Running DB Diagnosis...');
    const diagOutput = execSync('node scripts/diagnose_db.js', { encoding: 'utf-8' });
    console.log('[Startup] Diagnosis output:\n', diagOutput);

} catch (e) {
    console.error('[Startup] Migration/Diagnosis failed:', e.message);
    console.error('[Startup] Details:', e.stdout || e.stderr);
    // 選擇性：如果遷移失敗，是否要讓伺服器崩潰？
    // process.exit(1); 
}

// [DEBUG] Print package.json content to verify start script update
try {
    const packageJson = require('./package.json');
    console.log('[DEBUG] Loaded package.json version:', packageJson.version);
    console.log('[DEBUG] Start script:', packageJson.scripts.start);
} catch (e) {
    console.error('[DEBUG] Failed to load package.json:', e.message);
}

// 設定信任反向代理，修復 express-rate-limit 在 Render.com 上的問題
// 數字 1 表示信任第一個躍點的代理
app.set('trust proxy', 1);

// --- 中介軟體 (Middleware) ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(express.json({ limit: '50mb' })); // 增加請求大小限制以應對潛在的大請求
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 路由 (Routes) ---
// 將所有 API 路由都放在 /api 前綴下
const apiRouter = express.Router();

// 掛載已完成的模組
const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const projectAreasRoutes = require('./routes/project_areas');
const treeSurveyRoutes = require('./routes/treeSurvey');
const treeSpeciesRoutes = require('./routes/treeSpecies');
const reportsRoutes = require('./routes/reports');
const statisticsRoutes = require('./routes/statistics');
const aiRoutes = require('./routes/ai');
const carbonRoutes = require('./routes/carbon');
const adminRoutes = require('./routes/admin');
const locationRoutes = require('./routes/location');
const managementRoutes = require('./routes/management');
const carbonDataRoutes = require('./routes/carbon_data'); // 引入新的路由
const knowledgeRoutes = require('./routes/knowledge'); // 引入知識庫路由
// const testRoutes = require('./routes/test'); // 引入測試路由

apiRouter.use('/', usersRoutes); // 包含 /login
apiRouter.use('/projects', projectsRoutes);
apiRouter.use('/project_areas', projectAreasRoutes);
apiRouter.use('/tree_survey', treeSurveyRoutes);
apiRouter.use('/tree_species', treeSpeciesRoutes);
apiRouter.use('/', reportsRoutes); // 包含 /export
apiRouter.use('/tree_statistics', statisticsRoutes);
apiRouter.use('/', aiRoutes); // 包含 /chat, /reports/ai-sustainability 等
apiRouter.use('/carbon', carbonRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/location', locationRoutes);
apiRouter.use('/tree-management', managementRoutes);
apiRouter.use('/tree-carbon-data', carbonDataRoutes); // 掛載新的路由
// apiRouter.use('/test', testRoutes); // 掛載測試路由
apiRouter.use('/knowledge', knowledgeRoutes); // 掛載知識庫路由


// 將所有 API 路由應用速率限制並掛載到 /api
app.use('/api', apiLimiter, apiRouter);


// --- 靜態檔案服務 (可選) ---
// 如果前端 build 檔案會放在後端目錄下，可以取消註解
// app.use(express.static(path.join(__dirname, 'public')));


// --- 錯誤處理 ---
app.use((err, req, res, next) => {
    console.error('未處理的錯誤:', err.stack);
    res.status(500).send({ success: false, message: '伺服器發生未預期的錯誤' });
});

// --- 啟動伺服器 ---
const PORT = process.env.PORT || 3000;

// [DEBUG] Explicitly try to run migration if not running via start script
if (process.env.NODE_ENV === 'production') {
    console.log('[DEBUG] Production environment detected. Checking migration status...');
    // 這裡不直接執行 migrate，避免與 start script 衝突，僅作檢查
}

app.listen(PORT, () => {
    console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
    console.log('環境變數 DB_HOST:', process.env.DB_HOST ? '已設置' : '未設置');
    console.log('環境變數 DATABASE_URL:', process.env.DATABASE_URL ? '已設置' : '未設置');

    // 設定每小時執行一次的定期清理任務
    const cleanupInterval = 60 * 60 * 1000; // 1小時
    setInterval(async () => {
        console.log('[Scheduler] Running hourly cleanup tasks...');
        await cleanupOrphanedPlaceholders();
        await cleanupUnusedSpecies();
        await cleanupUnusedProjectAreas();
        console.log('[Scheduler] Hourly cleanup tasks finished.');
    }, cleanupInterval);
});
