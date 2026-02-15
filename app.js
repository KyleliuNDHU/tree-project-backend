require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimiter');
const { jwtAuth } = require('./middleware/jwtAuth');
const { 
    cleanupUnusedProjectAreas, 
    cleanupUnusedSpecies, 
    cleanupOrphanedPlaceholders,
    cleanupOldChatLogs
} = require('./utils/cleanup');
const { scheduledSynonymMaintenance } = require('./services/speciesSynonymService');
const migrate = require('./scripts/migrate'); // Import migration script

const app = express();

// [Standard Deployment] Execute database migration before starting server
// This ensures the DB schema is always up-to-date with the code.
// We use an IIFE (Immediately Invoked Function Expression) to handle async/await
(async () => {
    try {
        if (process.env.NODE_ENV === 'production') {
            console.log('[Startup] Running database migration...');
            await migrate();
            console.log('[Startup] Migration completed.');
        }
    } catch (e) {
        console.error('[Startup] Migration failed:', e);
        // Decide if you want to crash the server if migration fails
        // process.exit(1); 
    }
})();

// 設定信任反向代理，修復 express-rate-limit 在 Render.com 上的問題
// 數字 1 表示信任第一個躍點的代理
app.set('trust proxy', 1);

// 健康檢查端點 (Health Check)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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
const speciesIdentificationRoutes = require('./routes/speciesIdentification'); // 樹種辨識路由
const pendingMeasurementsRoutes = require('./routes/pending_measurements'); // 待測量樹木路由
const projectBoundariesRoutes = require('./routes/project_boundaries'); // V3 專案邊界路由
const mlTrainingDataRoutes = require('./routes/ml_training_data'); // V3 ML 訓練數據收集路由
const treeImagesRoutes = require('./routes/tree_images'); // 樹木影像路由
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
apiRouter.use('/species', speciesIdentificationRoutes); // 掛載樹種辨識路由
apiRouter.use('/pending-measurements', pendingMeasurementsRoutes); // 掛載待測量樹木路由
apiRouter.use('/project-boundaries', projectBoundariesRoutes); // 掛載專案邊界路由
apiRouter.use('/ml-training', mlTrainingDataRoutes); // 掛載 ML 訓練數據路由
apiRouter.use('/tree-images', treeImagesRoutes); // 掛載樹木影像路由


// 將所有 API 路由應用速率限制並掛載到 /api
app.use('/api', apiLimiter, jwtAuth, apiRouter);


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
        await cleanupOldChatLogs(); // 清理超過 24 小時的聊天記錄
        await scheduledSynonymMaintenance(); // 定期執行樹種同義詞分析與合併
        console.log('[Scheduler] Hourly cleanup tasks finished.');
    }, cleanupInterval);

    // 啟動時也執行一次清理（特別是聊天記錄）
    setTimeout(async () => {
        console.log('[Startup] Running initial chat logs cleanup...');
        await cleanupOldChatLogs();
        console.log('[Startup] Initial cleanup finished.');
    }, 5000); // 延遲 5 秒執行，讓伺服器先穩定
});
