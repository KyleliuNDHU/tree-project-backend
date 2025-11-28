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

// [NEW] 引入 SQL Query Service
const sqlQueryService = require('../services/sqlQueryService');

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


// ============================================
// [舊版] Chat API - RAG 版本
// 保留供日後需要時使用
// ============================================
router.post('/chat_old_rag_version', aiLimiter, async (req, res) => {
    try {
        let { message, projectAreas, userId, model_preference = 'gemini-2.5-flash' } = req.body;

        // --- PRODUCTION MODEL ENFORCEMENT ---
        // 允許的模型清單 (2025.11 更新):
        // - OpenAI: gpt-4.1-nano, gpt-4.1-mini, gpt-4.1, gpt-5-mini
        // - Google: gemini-2.5-flash
        // - SiliconFlow: deepseek-ai/DeepSeek-V3, Qwen/Qwen3-VL-32B-Instruct
        if (process.env.NODE_ENV === 'production') {
            const allowedProdModels = [
                'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini',
                'gemini-2.5-flash',
                'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-VL-32B-Instruct'
            ];
            
            if (!allowedProdModels.includes(model_preference)) {
                console.log(`[PROD-GUARD] Forbidden model '${model_preference}' requested. Overriding with fallback 'gpt-4.1-nano'.`);
                model_preference = 'gpt-4.1-nano'; // Override to the safe fallback
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
        // 僅獲取該用戶在最近 30 分鐘內的最近 30 筆對話，以保持上下文連貫但不過期
        let chatHistory = [];
        if (userId) {
            const historyQuery = `
                SELECT message, response 
                FROM chat_logs 
                WHERE user_id = $1 
                AND created_at > NOW() - INTERVAL '30 minutes'
                ORDER BY created_at DESC 
                LIMIT 30
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


// ============================================
// [NEW] Chat V2 - Text-to-SQL + 直接 LLM 混合架構
// ============================================
// 
// 這是新版的聊天 API，採用以下策略：
// 1. 意圖分類：判斷使用者是「查資料」還是「問知識」
// 2. 查資料：使用 Text-to-SQL，直接從資料庫取得精確結果
// 3. 問知識：直接讓 LLM 回答（不經過 RAG）
//
// 優點：
// - 省去 RAG 的 Embedding API 費用
// - 查詢速度更快
// - 資料查詢結果更精確
//
// 此路由現在是主要的 /chat 端點
// ============================================

// 訊息長度限制（避免 LLM token 超限和記憶體問題）
const MAX_MESSAGE_LENGTH = 500;

router.post('/chat', aiLimiter, async (req, res) => {
    try {
        let { message, userId, projectAreas, model_preference = 'gpt-4.1-nano' } = req.body;

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ success: false, error: '請提供有效的訊息內容' });
        }

        // 訊息長度限制
        if (message.length > MAX_MESSAGE_LENGTH) {
            console.log(`[Chat V2] 訊息過長 (${message.length} 字)，已截斷`);
            message = message.substring(0, MAX_MESSAGE_LENGTH) + '...(訊息已截斷)';
        }

        console.log(`[Chat V2] 收到查詢: "${message.substring(0, 50)}..."`);
        
        // 處理 projectAreas
        const validProjectAreas = Array.isArray(projectAreas) && projectAreas.length > 0 
            ? projectAreas.filter(a => a && typeof a === 'string' && a.trim() !== '')
            : [];
        if (validProjectAreas.length > 0) {
            console.log(`[Chat V2] 區域過濾: ${validProjectAreas.join(', ')}`);
        }
        // --- PRODUCTION MODEL ENFORCEMENT ---
        // 允許的模型清單 (2025.11 更新):
        // - SiliconFlow: deepseek-ai/DeepSeek-V3, Qwen/Qwen3-VL-32B-Instruct (前端 APP 使用)
        // - OpenAI/Google: 備用
        if (process.env.NODE_ENV === 'production') {
            const allowedProdModels = [
                'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-VL-32B-Instruct',
                'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini',
                'gemini-2.5-flash'
            ];
            if (!allowedProdModels.includes(model_preference)) {
                model_preference = 'deepseek-ai/DeepSeek-V3'; // 預設用 DeepSeek
            }
        }

        let aiResponse = '';
        let queryMode = 'knowledge'; // 'data' or 'knowledge'
        let executedSQL = null;
        let queryResults = null;

        // Step 0: 獲取歷史對話上下文（優化版：使用 sqlQueryService 的配置）
        let chatHistory = [];
        if (userId) {
            try {
                const historyQuery = sqlQueryService.getHistoryQuerySQL(userId);
                const { rows } = await db.query(historyQuery.text, historyQuery.values);
                // 反轉回正序 (舊 -> 新)
                chatHistory = rows.reverse();
                if (chatHistory.length > 0) {
                    console.log(`[Chat V2] 載入 ${chatHistory.length} 筆歷史對話 (${sqlQueryService.HISTORY_WINDOW_MINUTES}分鐘內)`);
                }
            } catch (err) {
                console.warn('[Chat V2] 獲取歷史對話失敗:', err.message);
            }
        }

        // Step 1: 意圖分類 - 判斷是否需要查詢資料庫
        const shouldQuery = sqlQueryService.shouldQueryDatabase(message);
        console.log(`[Chat V2] 意圖分類結果: ${shouldQuery ? '查資料' : '問知識'}`);

        if (shouldQuery) {
            queryMode = 'data';
            
            // Step 2a: 讓 LLM 生成 SQL
            console.log('[Chat V2] 正在生成 SQL...');
            
            // 構建 SQL prompt，包含 projectAreas 過濾資訊
            let sqlPrompt = sqlQueryService.buildSQLGenerationPrompt(message, chatHistory);
            
            // 如果有 projectAreas，加入過濾提示
            if (validProjectAreas.length > 0) {
                const areasCondition = validProjectAreas.map(a => `'${a}'`).join(', ');
                sqlPrompt += `\n\n【重要】使用者已選擇特定區域，SQL 必須加上區域過濾條件：
WHERE project_location IN (${areasCondition})
如果查詢已有 WHERE，請用 AND 連接此條件。`;
            }
            
            let generatedSQL = '';
            try {
                const sqlCompletion = await openai.chat.completions.create({
                    model: 'gpt-4.1-nano', // 用最小模型生成 SQL (最便宜且足夠)
                    messages: [{ role: 'user', content: sqlPrompt }],
                    temperature: 0.1, // 低溫度確保穩定輸出
                    max_tokens: 500,
                });
                generatedSQL = sqlCompletion.choices[0].message.content.trim();
            } catch (llmErr) {
                console.error('[Chat V2] SQL 生成失敗:', llmErr.message);
                // Fallback 到知識問答模式
                queryMode = 'knowledge';
            }

            // 檢查 LLM 是否判斷這不是資料查詢
            if (generatedSQL === 'NOT_A_DATA_QUERY') {
                console.log('[Chat V2] LLM 判斷此問題不需要查資料庫');
                queryMode = 'knowledge';
            }

            if (queryMode === 'data' && generatedSQL) {
                console.log(`[Chat V2] 生成的 SQL: ${generatedSQL}`);
                
                // Step 2b: 安全驗證並執行 SQL
                const queryResult = await sqlQueryService.executeSecureQuery(generatedSQL);
                
                if (queryResult.success) {
                    executedSQL = queryResult.executedSQL;
                    queryResults = queryResult.rows;
                    
                    // Step 2c: 讓 LLM 解釋結果
                    const explanationPrompt = sqlQueryService.buildResultExplanationPrompt(
                        message, 
                        executedSQL, 
                        queryResults, 
                        queryResult.rowCount,
                        chatHistory
                    );
                    const explainSystemPrompt = '你是一位專業的樹木與碳匯專家助理。請用繁體中文回答。如果使用者提到「剛才」或「上一個」問題，請參考對話歷史。';
                    
                    try {
                        // 根據模型類型選擇對應的 API
                        if (model_preference.startsWith('gemini-')) {
                            aiResponse = await generateGeminiChatResponse(explanationPrompt, explainSystemPrompt, [], model_preference);
                        } else if (model_preference.startsWith('Qwen/') || model_preference.startsWith('deepseek-ai/')) {
                            if (!siliconFlowLlm) throw new Error('SiliconFlow 服務未配置');
                            const completion = await siliconFlowLlm.chat.completions.create({
                                model: model_preference,
                                messages: [
                                    { role: 'system', content: explainSystemPrompt },
                                    { role: 'user', content: explanationPrompt }
                                ],
                                temperature: 0.7,
                                max_tokens: 1500,
                            });
                            aiResponse = completion.choices[0].message.content;
                        } else {
                            // OpenAI 模型
                            const completion = await openai.chat.completions.create({
                                model: model_preference,
                                messages: [
                                    { role: 'system', content: explainSystemPrompt },
                                    { role: 'user', content: explanationPrompt }
                                ],
                                temperature: 0.7,
                                max_tokens: 1500,
                            });
                            aiResponse = completion.choices[0].message.content;
                        }
                    } catch (explainErr) {
                        console.error('[Chat V2] 結果解釋失敗:', explainErr.message);
                        // 直接回傳原始結果
                        aiResponse = `查詢到 ${queryResult.rowCount} 筆資料：\n${JSON.stringify(queryResults.slice(0, 10), null, 2)}`;
                    }
                } else {
                    console.warn('[Chat V2] SQL 執行失敗:', queryResult.error);
                    // Fallback 到知識問答
                    queryMode = 'knowledge';
                }
            }
        }

        // Step 3: 知識問答模式（不使用 RAG）
        if (queryMode === 'knowledge') {
            console.log('[Chat V2] 使用知識問答模式（直接 LLM）');
            
            const systemPrompt = `你是一位專業的樹木永續發展與碳匯專家。
你擁有豐富的林業、生態學、碳循環相關知識。
請用繁體中文回答使用者的問題，提供專業且易懂的解答。
如果使用者詢問的是特定資料（如特定樹木編號、統計數據），
請告知他們可以使用更具體的查詢方式，例如指定樹木編號或專案名稱。`;

            // 構建包含歷史對話的 messages 陣列
            const messages = [
                { role: 'system', content: systemPrompt }
            ];
            
            // 加入歷史對話
            chatHistory.forEach(h => {
                messages.push({ role: 'user', content: h.message });
                messages.push({ role: 'assistant', content: h.response });
            });
            
            // 加入當前問題
            messages.push({ role: 'user', content: message });

            try {
                // 根據模型類型選擇對應的 API
                if (model_preference.startsWith('gemini-')) {
                    // Gemini 需要特殊處理歷史對話
                    const historyText = chatHistory.map(h => `用戶: ${h.message}\nAI: ${h.response}`).join('\n\n');
                    const messageWithHistory = historyText ? `${historyText}\n\n用戶: ${message}` : message;
                    aiResponse = await generateGeminiChatResponse(messageWithHistory, systemPrompt, [], model_preference);
                } else if (model_preference.startsWith('Qwen/') || model_preference.startsWith('deepseek-ai/')) {
                    if (!siliconFlowLlm) throw new Error('SiliconFlow 服務未配置');
                    const completion = await siliconFlowLlm.chat.completions.create({
                        model: model_preference,
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 1500,
                    });
                    aiResponse = completion.choices[0].message.content;
                } else {
                    // OpenAI 模型
                    const completion = await openai.chat.completions.create({
                        model: model_preference,
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 1500,
                    });
                    aiResponse = completion.choices[0].message.content;
                }
            } catch (llmError) {
                console.error('[Chat V2] LLM 回答失敗:', llmError.message);
                aiResponse = '抱歉，處理您的問題時發生錯誤，請稍後再試。';
            }
        }

        // Step 4: 儲存聊天記錄
        if (userId) {
            try {
                await db.query(
                    'INSERT INTO chat_logs (user_id, message, response, model_used, project_areas) VALUES ($1, $2, $3, $4, $5)',
                    [userId, message, aiResponse, model_preference, validProjectAreas.length > 0 ? JSON.stringify(validProjectAreas) : null]
                );
            } catch (logErr) {
                console.warn('[Chat V2] 儲存聊天記錄失敗:', logErr.message);
            }
        }

        // Step 5: 回傳結果
        res.json({
            success: true,
            response: aiResponse,
            queryMode: queryMode,
            executedSQL: executedSQL, // 方便 debug，正式版可移除
            resultCount: queryResults ? queryResults.length : null,
            modelUsed: model_preference
        });

    } catch (error) {
        console.error('[Chat V2] 未預期錯誤:', error);
        res.status(500).json({ success: false, error: '處理請求時發生未預期錯誤' });
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
