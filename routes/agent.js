/**
 * AI Agent Route - 碳匯永續智慧代理 API
 * 
 * POST /agent/chat   - Agent 對話 (ReAct 工具調用)
 * GET  /agent/status  - Agent 服務狀態
 * GET  /agent/models  - 可用模型列表
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireRole } = require('../middleware/roleAuth');
const { runAgent, AGENT_MODELS, checkTokenBudget } = require('../services/agentService');
const db = require('../config/db');

// Agent 專用速率限制 (比一般 AI 更嚴格)
const agentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 分鐘
    max: 30,                   // 最多 30 次請求
    message: { error: '請求頻率過高，請稍後再試 (Agent 限制: 30次/10分鐘)' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
});

// ============================================
// POST /agent/chat - Agent 對話
// ============================================
router.post('/chat', requireRole('調查管理員'), agentLimiter, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { message, sessionId, model } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: '請輸入訊息' });
        }

        if (message.length > 2000) {
            return res.status(400).json({ error: '訊息長度超過限制 (最多 2000 字)' });
        }

        // 取得歷史對話 (同 session)
        let chatHistory = [];
        if (sessionId) {
            try {
                const historyResult = await db.query(
                    `SELECT message, response FROM chat_logs 
                     WHERE user_id = $1 AND session_id = $2 AND chat_mode = 'agent'
                     ORDER BY created_at DESC LIMIT 5`,
                    [userId, sessionId]
                );
                chatHistory = historyResult.rows.reverse();
            } catch {
                // chat_logs 表可能沒有 chat_mode 欄位，忽略
            }
        }

        // 執行 Agent
        const result = await runAgent(message, userId, chatHistory, {
            model: model || AGENT_MODELS.default,
        });

        // 儲存對話記錄
        const finalSessionId = sessionId || `agent_${userId}_${Date.now()}`;
        try {
            await db.query(
                `INSERT INTO chat_logs (user_id, session_id, message, response, model_used, chat_mode, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    userId,
                    finalSessionId,
                    message,
                    result.response,
                    model || AGENT_MODELS.default,
                    'agent',
                    JSON.stringify({
                        toolCalls: result.toolCalls.map(tc => ({
                            tool: tc.tool,
                            args: tc.args,
                        })),
                        tokensUsed: result.tokensUsed,
                    }),
                ]
            );
        } catch (dbErr) {
            console.warn('[Agent] 儲存對話記錄失敗:', dbErr.message);
        }

        res.json({
            response: result.response,
            sessionId: finalSessionId,
            toolCalls: result.toolCalls.map(tc => ({
                tool: tc.tool,
                args: tc.args,
                // 只回傳摘要，不回傳完整查詢結果 (太大)
                resultSummary: summarizeToolResult(tc.result),
            })),
            tokensUsed: result.tokensUsed,
            model: model || AGENT_MODELS.default,
        });
    } catch (err) {
        console.error('[Agent] 錯誤:', err);
        res.status(500).json({ error: '代理服務發生錯誤' });
    }
});

// ============================================
// GET /agent/status - Agent 狀態
// ============================================
router.get('/status', requireRole('調查管理員'), (req, res) => {
    const userId = req.user.user_id;
    const hasBudget = checkTokenBudget(userId);
    const sfConfigured = !!(
        process.env.SiliconFlow_API_KEY ||
        process.env.Alt1_SiliconFlow_API_KEY
    );

    res.json({
        available: sfConfigured,
        tokenBudget: hasBudget ? 'ok' : 'exceeded',
        models: Object.keys(AGENT_MODELS),
        defaultModel: AGENT_MODELS.default,
    });
});

// ============================================
// GET /agent/models - 可用模型列表
// ============================================
router.get('/models', requireRole('調查管理員'), (req, res) => {
    res.json({
        models: [
            { id: AGENT_MODELS.default, name: 'DeepSeek V3', description: '推薦 - 平衡速度與品質', free: true },
            { id: AGENT_MODELS.reasoning, name: 'QwQ-32B', description: '深度推理 - 適合複雜分析', free: true },
            { id: AGENT_MODELS.fast, name: 'Qwen2.5-7B', description: '快速回應 - 簡單查詢', free: true },
            { id: AGENT_MODELS.strong, name: 'Qwen3-235B', description: '最強模型 - 碳匯報告生成', free: true },
        ],
    });
});

// ============================================
// 工具結果摘要 (避免前端收到過大 payload)
// ============================================
function summarizeToolResult(result) {
    if (!result) return null;
    if (result.error) return { error: result.error };
    if (result.data && Array.isArray(result.data)) {
        return { rowCount: result.data.length, preview: result.data.slice(0, 3) };
    }
    if (result.areas && Array.isArray(result.areas)) {
        return { areaCount: result.areas.length, totals: result.totals };
    }
    // 其他工具結果直接返回 (已經是摘要格式)
    return result;
}

module.exports = router;
