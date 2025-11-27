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


// Chat API
router.post('/chat', aiLimiter, async (req, res) => {
    try {
        let { message, projectAreas, userId, model_preference = 'gemini-2.5-flash' } = req.body;

        // --- PRODUCTION MODEL ENFORCEMENT ---
        if (process.env.NODE_ENV === 'production') {
            const allowedProdModels = [
                'deepseek-ai/DeepSeek-V3',
                'Qwen/Qwen3-VL-32B-Instruct',
                'gpt-5-mini'
            ];
            
            if (!allowedProdModels.includes(model_preference)) {
                console.log(`[PROD-GUARD] Forbidden model '${model_preference}' requested. Overriding with fallback 'gpt-5-mini'.`);
                model_preference = 'gpt-5-mini'; // Override to the safe fallback
            }
        }
        // --- END ENFORCEMENT ---
    
        let treeData = [];
        let treeDataError = null;
        
        if (projectAreas && projectAreas.length > 0) {
            const query = format(`
                SELECT 
                    project_location, species_name, tree_height_m, dbh_cm, 
                    carbon_storage, carbon_sequestration_per_year
                FROM tree_survey 
                WHERE project_location IN (%L)
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
                    ? `以下是相關區域的樹木數據：${JSON.stringify(treeData.map(t => ({
                        "專案區位": t.project_location,
                        "樹種名稱": t.species_name,
                        "樹高（公尺）": t.tree_height_m,
                        "胸徑（公分）": t.dbh_cm,
                        "碳儲存量": t.carbon_storage,
                        "推估年碳吸存量": t.carbon_sequestration_per_year
                      })))}`
                    : '目前沒有選擇特定區域的樹木數據');
    
        const passages = await getSimilarPassages(message, 15, 0.45); 
        
        let knowledgeContext = '';
        if (passages && passages.length > 0) {
            knowledgeContext = '\n\n以下是從知識庫檢索到的相關資訊，請參考 (若與使用者問題無直接關聯，則忽略此段資訊)：\n' + 
            passages.map((p, i) => `--- 知識片段 ${i + 1} ---\n標題: ${p.original_source_title || 'N/A'}\n內容摘要: ${(p.text_content || p.summary_cn || '[內容摘要不可用]').substring(0, 300)}...\n(知識庫內部ID: ${p.id}, 相關度: ${p.score.toFixed(3)})\n`).join('');
        }
    
        // --- 獲取歷史對話上下文 (Context) ---
        // 僅獲取該用戶在最近 30 分鐘內的最近 15 筆對話，以保持上下文連貫但不過期
        let chatHistory = [];
        if (userId) {
            const historyQuery = `
                SELECT message, response 
                FROM chat_logs 
                WHERE user_id = $1 
                AND created_at > NOW() - INTERVAL '30 minutes'
                ORDER BY created_at DESC 
                LIMIT 15
            `;
            try {
                const { rows } = await db.query(historyQuery, [userId]);
                // 資料庫撈出來是倒序 (最新的在最前)，要反轉回正序 (舊 -> 新) 給 AI
                chatHistory = rows.reverse().map(row => ([
                    { role: 'user', content: row.message },
                    { role: 'assistant', content: row.response }
                ])).flat();
            } catch (err) {
                console.warn('獲取歷史對話失敗:', err.message);
            }
        }

        let aiResponse = '';
        let modelUsed = model_preference;
        let sourceInfo = '';

        const fullContextForAI = `${treeDataContext}${knowledgeContext}`;
        const systemMessage = `你是一位專業的樹木永續發展與碳匯專家。\n可用資料上下文：${fullContextForAI}\n請根據用戶的問題提供專業的建議和分析，並在需要時引用(知識庫內部ID)標註。`;

        try {
            // 構建完整的訊息串列
            const messages = [
                { role: "system", content: systemMessage },
                ...chatHistory, // 插入歷史對話
                { role: "user", content: message }
            ];

            if (model_preference.startsWith('gemini-')) {
                // Gemini 處理邏輯微調 (Gemini SDK 可能有不同的 history 格式，這裡先維持原樣，視需要調整 generateGeminiChatResponse)
                // 注意：generateGeminiChatResponse 目前介面可能只接受單一 message，若要支援 history 需修改該 service
                // 暫時將 history 拼接到 systemMessage 或 message 中作為折衷，或者假設 generateGeminiChatResponse 已支援
                // 這裡示範將 history 拼接到 user message (簡單解法)
                const historyText = chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
                const messageWithHistory = historyText ? `Previous conversation:\n${historyText}\n\nCurrent question:\n${message}` : message;
                
                aiResponse = await generateGeminiChatResponse(messageWithHistory, systemMessage, [], model_preference);
                sourceInfo = ` (由 ${model_preference} 回答)`;
            } else if (model_preference.startsWith('claude-')) {
                if (!anthropic) throw new Error("Claude服務未配置");
                const claudeResponse = await anthropic.messages.create({
                    model: model_preference,
                    max_tokens: 2048, 
                    system: systemMessage, 
                    messages: messages.filter(m => m.role !== 'system'), // Claude SDK 的 messages 不含 system
                });
                aiResponse = claudeResponse.content[0].text;
                sourceInfo = ` (由 ${model_preference.split('@')[0]} 回答)`;
            } else if (model_preference.startsWith('Qwen/') || model_preference.startsWith('deepseek-ai/')) {
                 if (!siliconFlowLlm) throw new Error("SiliconFlow 服務未配置");
                 const completion = await siliconFlowLlm.chat.completions.create({
                    model: model_preference,
                    messages: messages,
                 });
                 aiResponse = completion.choices[0].message.content;
                 sourceInfo = ` (由 ${model_preference} via SiliconFlow 回答)`;
            } else { // Default to OpenAI
                const completion = await openai.chat.completions.create({
                    model: model_preference, 
                    messages: messages,
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
            response: aiResponse, // 只儲存純粹的 AI 回應，不包含來源資訊
            model_used: modelUsed,
            project_areas: projectAreas ? JSON.stringify(projectAreas) : null,
        };
        await db.query('INSERT INTO chat_logs (user_id, message, response, model_used, project_areas) VALUES ($1, $2, $3, $4, $5)', Object.values(chatLog));

        res.json({
            success: true,
            response: aiResponse, // Return the pure AI response
            sources: passages, 
            modelUsed: modelUsed
        });
    } catch (error) {
        console.error('AI 聊天 API 發生未預期錯誤:', error);
        res.status(500).json({ success: false, error: '處理 AI 聊天時發生未預期錯誤' });
  }
});


// New route for direct OpenAI chat requests from frontend
router.post('/ai/direct-chat', aiLimiter, async (req, res) => {
    try {
        const { message, systemPrompt } = req.body;

        if (!message || !systemPrompt) {
            return res.status(400).json({ success: false, message: '請求中缺少 message 或 systemPrompt' });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4.1', 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const aiResponse = completion.choices[0].message.content;
        res.json({
            success: true,
            response: aiResponse,
        });

    } catch (error) {
        console.error('Direct OpenAI chat API 發生錯誤:', error);
        res.status(500).json({ success: false, error: '處理 Direct OpenAI chat 時發生錯誤' });
    }
});


// AI報告相關路由
router.get('/reports/ai-sustainability', aiLimiter, aiReportController.generateAIReport);
router.get('/reports/ai-sustainability/pdf', aiLimiter, async (req, res) => {
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

// 其他 AI 相關路由
router.post('/sustainability-policy', aiLimiter, openaiController.generateSustainabilityPolicyRecommendations);
router.get('/carbon-education/:topic', aiLimiter, openaiController.generateCarbonEducationContent);
router.post('/carbon-footprint/advice', aiLimiter, openaiController.generateCarbonFootprintAdvice);
router.post('/species-comparison', aiLimiter, openaiController.generateSpeciesCarbonComparison);


module.exports = router;
