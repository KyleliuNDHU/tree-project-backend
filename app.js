require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// --- 中介軟體 (Middleware) ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(express.json({ limit: '50mb' })); // 增加請求大小限制以應對潛在的大請求
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 速率限制 (Rate Limiting) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 200, // 增加通用請求限制
    message: {
        success: false,
        message: '請求過於頻繁，請稍後再試'
    },
});

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
app.listen(PORT, () => {
    console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
    console.log('環境變數 DB_HOST:', process.env.DB_HOST ? '已設置' : '未設置');
    console.log('環境變數 DATABASE_URL:', process.env.DATABASE_URL ? '已設置' : '未設置');
});
