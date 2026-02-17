const express = require('express');
const router = express.Router();
const db = require('../config/db');
const rateLimit = require('express-rate-limit');
const { getSimilarPassages } = require('../services/knowledgeEmbeddingService');
const { generateGeminiChatResponse } = require('../services/geminiService');
const reportController = require('../controllers/reportController');
const aiReportController = require('../controllers/aiReportController');
const openaiController = require('../controllers/openaiController');
const format = require('pg-format');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const apiKeys = require('../config/apiKeys');
const adminAuth = require('../middleware/adminAuth'); // Import auth middleware

// Script runners
// const populateKnowledgeFromSurvey = require('../scripts/populate_knowledge_from_survey');
// const populateSpeciesRegionScore = require('../scripts/populateSpeciesRegionScore');
// const generateEmbeddings = require('../scripts/generateEmbeddings');

// --- Admin Script Execution Endpoint ---
router.post('/run-script', adminAuth, async (req, res) => {
    const { scriptName } = req.body;

    if (!scriptName) {
        return res.status(400).json({ success: false, message: 'Script name is required' });
    }

    try {
        let resultMessage = '';
        
        // Execute script based on name
        switch (scriptName) {
            case 'populate_knowledge_from_survey':
                console.log('[Admin] Triggering populate_knowledge_from_survey...');
                // Assuming these scripts export a main function or we can run them effectively
                // Since we refactored them to export, we can call directly
                // BUT scripts might be async and logging to console. capturing output is harder this way.
                // For now, just await their completion.
                
                // Note: populate_knowledge_from_survey.js might not export a function in current version, 
                // let's check if we need to wrap it or use child_process.
                // Checking file content... it runs processTreeSurveyData() at the end.
                // We should modify it to export the function instead of auto-running if imported.
                // For safety, let's use child_process for scripts that might not be perfectly module-ready
                // OR better, we refactored populateSpeciesRegionScore to export. Let's assume we will refactor others too.
                // For now, using child_process fork is safest to isolate execution context.
                
                await runScriptInChildProcess('populate_knowledge_from_survey.js');
                resultMessage = 'Knowledge from survey population started/completed.';
                break;

            case 'populateSpeciesRegionScore':
                console.log('[Admin] Triggering populateSpeciesRegionScore...');
                await runScriptInChildProcess('populateSpeciesRegionScore.js');
                resultMessage = 'Species region score population started/completed.';
                break;

            case 'generateEmbeddings':
                console.log('[Admin] Triggering generateEmbeddings...');
                await runScriptInChildProcess('generateEmbeddings.js');
                resultMessage = 'Advanced embedding generation started/completed.';
                break;

            case 'generate_species_knowledge':
                console.log('[Admin] Triggering generate_species_knowledge...');
                // Note: This script uses Gemini API and might take a long time.
                // Running in background to prevent timeout.
                runScriptInChildProcess('generate_species_knowledge.js')
                    .then(() => console.log('[Admin] generate_species_knowledge completed.'))
                    .catch(err => console.error('[Admin] generate_species_knowledge failed:', err));
                resultMessage = 'Species knowledge generation started in background (this may take a while).';
                break;

            case 'enrich_species_synonyms':
                console.log('[Admin] Triggering enrich_species_synonyms...');
                // Background execution for LLM-heavy task
                runScriptInChildProcess('enrich_species_synonyms.js')
                    .then(() => console.log('[Admin] enrich_species_synonyms completed.'))
                    .catch(err => console.error('[Admin] enrich_species_synonyms failed:', err));
                resultMessage = 'Species synonym enrichment started in background (this may take a while).';
                break;

            default:
                return res.status(400).json({ success: false, message: 'Unknown script name' });
        }

        res.json({ success: true, message: resultMessage });

    } catch (error) {
        console.error(`[Admin] Error running script ${scriptName}:`, error);
        res.status(500).json({ success: false, message: `Error running script: ${error.message}` });
    }
});

// Helper to run script
function runScriptInChildProcess(scriptFileName) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', scriptFileName);
        const { fork } = require('child_process');
        
        const child = fork(scriptPath);

        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Script exited with code ${code}`));
        });

        child.on('error', (err) => reject(err));
    });
}


// 根據您的 index_1.js，初始化 OpenAI, Anthropic, SiliconFlow
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let anthropic;
if (process.env.Claude_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.Claude_API_KEY });
}

let siliconFlowLlm;
if (process.env.SiliconFlow_API_KEY) {
    siliconFlowLlm = new OpenAI({
        apiKey: process.env.SiliconFlow_API_KEY,
        baseURL: 'https://api.siliconflow.cn/v1',
    });
}


// AI 路由速率限制
const aiLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30分鐘
    max: 50, // 增加限制次數
    message: {
        success: false,
        message: 'AI請求過於頻繁，請稍後再試'
    }
});


// Chat API — 需要 adminAuth 保護（防止未授權使用付費 AI API）
router.post('/chat', adminAuth, aiLimiter, async (req, res) => {
    try {
        const { message, projectAreas, userId, model_preference = 'gpt-4.1-mini' } = req.body;
    
        let treeData = [];
        let treeDataError = null;
        
        if (projectAreas && projectAreas.length > 0) {
            const query = format(`
                SELECT 
                    "專案區位", "樹種名稱", "樹高（公尺）", "胸徑（公分）", 
                    "碳儲存量", "推估年碳吸存量"
                FROM tree_survey 
                WHERE "專案區位" IN (%L)
            `, projectAreas);
            
            try {
                const { rows } = await db.query(query);
                treeData = rows;
            } catch (err) {
                console.error('查詢樹木資料錯誤:', err);
                treeDataError = '查詢樹木資料時發生錯誤';
            }
        }
    
        const treeDataContext = treeDataError 
            ? `樹木資料查詢失敗: ${treeDataError}`
            : (treeData.length > 0 
                    ? `以下是相關區域的樹木數據：${JSON.stringify(treeData)}`
                    : '目前沒有選擇特定區域的樹木數據');
    
        const passages = await getSimilarPassages(message, 15, 0.45); 
        
        let knowledgeContext = '';
        if (passages && passages.length > 0) {
            knowledgeContext = '\n\n以下是從知識庫檢索到的相關資訊，請參考 (若與使用者問題無直接關聯，則忽略此段資訊)：\n' + 
            passages.map((p, i) => `--- 知識片段 ${i + 1} ---\n標題: ${p.original_source_title || 'N/A'}\n內容摘要: ${(p.text_content || p.summary_cn || '[內容摘要不可用]').substring(0, 300)}...\n(知識庫內部ID: ${p.id}, 相關度: ${p.score.toFixed(3)})\n`).join('');
        }
    
        let aiResponse = '';
        let modelUsed = model_preference;
        let sourceInfo = '';

        const fullContextForAI = `${treeDataContext}${knowledgeContext}`;
        const systemMessage = `你是一位專業的樹木永續發展與碳匯專家。\n可用資料上下文：${fullContextForAI}\n請根據用戶的問題提供專業的建議和分析，並在需要時引用(知識庫內部ID)標註。`;

        try {
            if (model_preference.startsWith('gemini-')) {
                aiResponse = await generateGeminiChatResponse(message, systemMessage, [], model_preference);
                sourceInfo = ` (由 ${model_preference.replace('-latest','')} 回答)`;
            } else if (model_preference.startsWith('claude-')) {
                if (!anthropic) throw new Error("Claude服務未配置");
                const claudeResponse = await anthropic.messages.create({
                    model: model_preference,
                    max_tokens: 2048, 
                    system: systemMessage, 
                    messages: [{ role: 'user', content: message }],
                });
                aiResponse = claudeResponse.content[0].text;
                sourceInfo = ` (由 ${model_preference.split('@')[0]} 回答)`;
            } else if (model_preference.startsWith('Qwen/') || model_preference.startsWith('deepseek-ai/')) {
                 if (!siliconFlowLlm) throw new Error("SiliconFlow 服務未配置");
                 const completion = await siliconFlowLlm.chat.completions.create({
                    model: model_preference,
                    messages: [{ role: "system", content: systemMessage }, { role: "user", content: message }],
                 });
                 aiResponse = completion.choices[0].message.content;
                 sourceInfo = ` (由 ${model_preference} via SiliconFlow 回答)`;
            } else { // Default to OpenAI
                const completion = await openai.chat.completions.create({
                    model: model_preference, // e.g., 'gpt-4.1-mini'
                    messages: [{ role: "system", content: systemMessage }, { role: "user", content: message }],
                });
                aiResponse = completion.choices[0].message.content;
                sourceInfo = ` (由 ${model_preference} 回答)`;
            }
        } catch (llmError) {
            console.error(`LLM (${modelUsed}) API 錯誤:`, llmError.message);
            aiResponse = `處理 AI 回應時發生錯誤。`;
            sourceInfo = ` (AI (${modelUsed}) 處理失敗)`;
        }

        // Save chat log
        const chatLog = {
            user_id: userId,
            message: message,
            response: aiResponse + sourceInfo,
            model_used: modelUsed,
            project_areas: projectAreas ? JSON.stringify(projectAreas) : null,
        };
        await db.query('INSERT INTO chat_logs (user_id, message, response, model_used, project_areas) VALUES ($1, $2, $3, $4, $5)', Object.values(chatLog));

        res.json({
            success: true,
            response: aiResponse + sourceInfo, 
            sources: passages, 
            modelUsed: modelUsed
        });
    } catch (error) {
        console.error('AI 聊天 API 發生未預期錯誤:', error);
        res.status(500).json({ success: false, error: '處理 AI 聊天時發生未預期錯誤' });
  }
});

// AI報告相關路由 — 全部加上 adminAuth
router.get('/reports/ai-sustainability', adminAuth, aiLimiter, aiReportController.generateAIReport);
router.get('/reports/ai-sustainability/pdf', adminAuth, aiLimiter, async (req, res) => {
    // 此路由較複雜，暫時保持原樣，待確認 controller 內部邏輯
    try {
        const originalJson = res.json;
        let reportJsonData = null;
        res.json = (data) => {
            reportJsonData = data;
            res.json = originalJson; 
        };
        await aiReportController.generateAIReport(req, res);
        if (reportJsonData && reportJsonData.success) {
            const pdfBuffer = await aiReportController.generateAIReportPDF(reportJsonData.data);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `AI_Sustainability_Report_${timestamp}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(pdfBuffer);
        } else {
            res.json = originalJson;
            res.status(500).json({ success: false, message: '無法獲取 AI 報告數據以生成 PDF' });
        }
    } catch (error) {
        console.error('生成 AI 永續報告 PDF 時發生錯誤:', error);
        res.status(500).json({ success: false, message: '生成 AI 永續報告 PDF 時發生錯誤' });
    }
});

// 其他 AI 相關路由 — 全部加上 adminAuth
router.post('/sustainability-policy', adminAuth, aiLimiter, openaiController.generateSustainabilityPolicyRecommendations);
router.get('/carbon-education/:topic', adminAuth, aiLimiter, openaiController.generateCarbonEducationContent);
router.post('/carbon-footprint/advice', adminAuth, aiLimiter, openaiController.generateCarbonFootprintAdvice);
router.post('/species-comparison', adminAuth, aiLimiter, openaiController.generateSpeciesCarbonComparison);


// --- 備份與還原 (使用 pg_dump 和 pg_restore) ---

// 備份資料庫
router.post('/backup', adminAuth, (req, res) => {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

    // 從 DATABASE_URL 中解析資料庫連接信息
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbName = dbUrl.pathname.slice(1);
    const user = dbUrl.username;
    const password = dbUrl.password;
    const host = dbUrl.hostname;
    const port = dbUrl.port;

    // 構建 pg_dump 命令
    // 使用環境變數傳遞密碼，避免在命令行中暴露
    const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} -F c -b -v -f "${backupFile}"`;

    exec(command, { env: { ...process.env, PGPASSWORD: password } }, (error, stdout, stderr) => {
        if (error) {
            console.error('PostgreSQL 備份錯誤:', stderr);
            return res.status(500).json({
                success: false,
                message: '資料庫備份時發生錯誤',
                error: stderr
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
router.post('/restore', adminAuth, (req, res) => {
    const { backupFile } = req.body;
    
    // 防止路徑遍歷和命令注入
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!backupFile || typeof backupFile !== 'string') {
        return res.status(400).json({ success: false, message: '無效的備份檔案' });
    }
    
    // 只允許 backups 目錄下的檔案，防止路徑遍歷
    const resolvedPath = path.resolve(backupDir, path.basename(backupFile));
    if (!resolvedPath.startsWith(path.resolve(backupDir))) {
        return res.status(400).json({ success: false, message: '不允許的檔案路徑' });
    }
    if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ success: false, message: '備份檔案不存在' });
    }
    
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbName = dbUrl.pathname.slice(1);
    const user = dbUrl.username;
    const password = dbUrl.password;
    const host = dbUrl.hostname;
    const port = dbUrl.port;

    // 構建 pg_restore 命令 — 使用 resolvedPath 而非用戶輸入
    const command = `pg_restore -h ${host} -p ${port} -U ${user} -d ${dbName} --clean --if-exists -v "${resolvedPath}"`;

    exec(command, { env: { ...process.env, PGPASSWORD: password } }, (error, stdout, stderr) => {
        if (error) {
            console.error('PostgreSQL 還原錯誤:', stderr);
            return res.status(500).json({
                success: false,
                message: '資料庫還原時發生錯誤',
                error: stderr
            });
        }
        res.json({
            success: true,
            message: '資料庫還原成功'
        });
    });
});


// --- API 密鑰管理 ---

router.post('/apikeys', adminAuth, (req, res) => {
    try {
        const { name, key } = req.body;
        if (!name || !key) {
            return res.status(400).json({ success: false, message: 'API Key 名稱和金鑰不能為空' });
        }
        const newKey = { name, key };
        apiKeys.push(newKey);
        res.json({ success: true, data: newKey });
    } catch (error) {
        console.error('創建 API 密鑰錯誤:', error);
        res.status(500).json({
            success: false,
            message: '創建 API 密鑰時發生錯誤',
            error: error.message
        });
    }
});

router.get('/apikeys', adminAuth, (req, res) => {
    try {
        res.json({ success: true, data: apiKeys });
    } catch (error) {
        console.error('獲取 API 密鑰列表錯誤:', error);
        res.status(500).json({
            success: false,
            message: '獲取 API 密鑰列表時發生錯誤',
            error: error.message
        });
    }
});

router.delete('/apikeys/:id', adminAuth, (req, res) => {
    const { id } = req.params;
    
    try {
        const initialLength = apiKeys.length;
        apiKeys = apiKeys.filter((_, index) => index !== parseInt(id));
        if (apiKeys.length < initialLength) {
            res.json({ success: true, message: 'API Key 已刪除' });
        } else {
            res.status(404).json({ success: false, message: 'API Key 未找到' });
        }
    } catch (error) {
        console.error('刪除 API 密鑰錯誤:', error);
        res.status(500).json({
            success: false,
            message: '刪除 API 密鑰時發生錯誤',
            error: error.message
        });
    }
});

module.exports = router;
