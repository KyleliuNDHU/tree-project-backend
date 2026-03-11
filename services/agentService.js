/**
 * AI Agent Service - 碳匯永續智慧代理
 * 
 * 使用 SiliconFlow API (OpenAI-compatible) 實現 ReAct 風格的 Agent，
 * 具備工具調用能力，專注於碳匯與永續發展領域。
 * 
 * 支援的工具:
 * 1. query_tree_data    - 查詢樹木資料庫
 * 2. calculate_carbon   - 計算碳匯指標
 * 3. species_carbon_info - 查詢樹種碳匯參數
 * 4. project_summary    - 取得專案統計摘要
 * 5. carbon_report      - 生成碳匯報告
 * 
 * @module services/agentService
 */

const db = require('../config/db');
const OpenAI = require('openai');
const sqlQueryService = require('./sqlQueryService');

// ============================================
// SiliconFlow / DeepSeek 客戶端初始化
// ============================================

// 主要: SiliconFlow (免費額度)
let siliconFlowClient = null;
const SF_KEYS = [
    process.env.SiliconFlow_API_KEY,
    process.env.Alt1_SiliconFlow_API_KEY,
    process.env.Alt2_SiliconFlow_API_KEY,
    process.env.Alt3_SiliconFlow_API_KEY,
].filter(Boolean);

if (SF_KEYS.length > 0) {
    siliconFlowClient = new OpenAI({
        apiKey: SF_KEYS[0],
        baseURL: 'https://api.siliconflow.cn/v1',
    });
}

// 輪替 key 索引 (當一個 key 額度用完時切換下一個)
let currentKeyIndex = 0;

function getNextClient() {
    if (SF_KEYS.length === 0) return null;
    currentKeyIndex = (currentKeyIndex + 1) % SF_KEYS.length;
    return new OpenAI({
        apiKey: SF_KEYS[currentKeyIndex],
        baseURL: 'https://api.siliconflow.cn/v1',
    });
}

// ============================================
// Agent 可選模型 (只用 SiliconFlow 免費)
// ============================================

const AGENT_MODELS = {
    // Qwen2.5-72B: 已驗證支援 SiliconFlow function calling
    default: 'Qwen/Qwen2.5-72B-Instruct',
    reasoning: 'Qwen/QwQ-32B',
    fast: 'Qwen/Qwen2.5-7B-Instruct',
    deepseek: 'deepseek-ai/DeepSeek-V3',
    strong: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
};

// ============================================
// 速率限制: 每使用者每小時 token 預算
// ============================================

const TOKEN_BUDGET_PER_HOUR = 50000; // 每使用者每小時 50k tokens
const MAX_AGENT_STEPS = 8;           // 最多 8 步工具調用
const tokenUsage = new Map();        // userId -> { tokens, resetAt }

function checkTokenBudget(userId) {
    const now = Date.now();
    const record = tokenUsage.get(userId);
    if (!record || now > record.resetAt) {
        tokenUsage.set(userId, { tokens: 0, resetAt: now + 3600000 });
        return true;
    }
    return record.tokens < TOKEN_BUDGET_PER_HOUR;
}

function addTokenUsage(userId, tokens) {
    const record = tokenUsage.get(userId) || { tokens: 0, resetAt: Date.now() + 3600000 };
    record.tokens += tokens;
    tokenUsage.set(userId, record);
}

// ============================================
// Agent 工具定義 (OpenAI function calling format)
// ============================================

const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'query_tree_data',
            description: '查詢樹木資料庫。可以查詢樹木調查數據、碳儲存、樹種分布等。輸入自然語言描述即可，系統會自動轉為 SQL 查詢。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '使用者的查詢需求，例如：「高雄港有多少棵樹」、「碳儲存量最高的樹種」',
                    },
                    project_area: {
                        type: 'string',
                        description: '可選，限定查詢的專案區域，如「高雄港」、「花蓮港」',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'calculate_carbon',
            description: '根據樹木的胸徑(DBH)和樹高計算碳匯指標，包括碳儲存量、年碳吸存量、CO2 當量等。支援單棵或批量計算。',
            parameters: {
                type: 'object',
                properties: {
                    dbh_cm: {
                        type: 'number',
                        description: '胸高直徑(公分)',
                    },
                    height_m: {
                        type: 'number',
                        description: '樹高(公尺)',
                    },
                    species: {
                        type: 'string',
                        description: '樹種名稱（可選，用於查找樹種特定的碳係數）',
                    },
                },
                required: ['dbh_cm'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'species_carbon_info',
            description: '查詢特定樹種的碳匯參數，包括碳吸收範圍、生長速率、碳效率等資訊。適合比較不同樹種的碳匯能力。',
            parameters: {
                type: 'object',
                properties: {
                    species_name: {
                        type: 'string',
                        description: '樹種名稱（中文），例如「榕樹」、「欖仁」',
                    },
                },
                required: ['species_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'project_summary',
            description: '取得指定專案區域或全部區域的統計摘要，包括樹木總數、平均碳儲存、樹種多樣性等。',
            parameters: {
                type: 'object',
                properties: {
                    project_area: {
                        type: 'string',
                        description: '專案區域名稱，留空表示全部區域',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'carbon_credit_estimate',
            description: '估算碳信用額度。根據樹木資料估算碳權價值(VCS/Gold Standard)，包含方法學說明。適用於碳交易和學術研究。',
            parameters: {
                type: 'object',
                properties: {
                    project_area: {
                        type: 'string',
                        description: '專案區域名稱',
                    },
                    methodology: {
                        type: 'string',
                        enum: ['vcs_ar', 'gold_standard', 'taiwan_offset'],
                        description: '碳信用方法學: vcs_ar (VCS 造林再造林), gold_standard (黃金標準), taiwan_offset (台灣碳權抵換)',
                    },
                    period_years: {
                        type: 'number',
                        description: '計算期間(年)，預設 10 年',
                    },
                },
                required: [],
            },
        },
    },
];

// ============================================
// 工具執行函數
// ============================================

async function executeToolCall(toolName, args) {
    switch (toolName) {
        case 'query_tree_data':
            return await toolQueryTreeData(args);
        case 'calculate_carbon':
            return await toolCalculateCarbon(args);
        case 'species_carbon_info':
            return await toolSpeciesCarbonInfo(args);
        case 'project_summary':
            return await toolProjectSummary(args);
        case 'carbon_credit_estimate':
            return await toolCarbonCreditEstimate(args);
        default:
            return { error: `未知的工具: ${toolName}` };
    }
}

// --- Tool: query_tree_data ---
async function toolQueryTreeData({ query, project_area }) {
    try {
        // 使用 sqlQueryService 的能力生成並執行 SQL
        const sqlPrompt = sqlQueryService.buildSQLGenerationPrompt(query, []);
        
        // 用 SiliconFlow 生成 SQL (最便宜的模型)
        const client = siliconFlowClient || getNextClient();
        if (!client) return { error: 'SiliconFlow 未配置' };

        const sqlCompletion = await client.chat.completions.create({
            model: 'Qwen/Qwen2.5-7B-Instruct',
            messages: [{ role: 'user', content: sqlPrompt }],
            temperature: 0.1,
            max_tokens: 500,
        });
        
        let generatedSQL = sqlCompletion.choices[0].message.content.trim();
        
        if (generatedSQL === 'NOT_A_DATA_QUERY') {
            return { result: '此問題不需要查詢資料庫', query };
        }

        // 如果指定了區域，加入過濾 (透過 executeSecureQuery 的安全機制處理)
        if (project_area) {
            const safeArea = project_area.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s]/g, '');
            if (safeArea) {
                if (generatedSQL.toUpperCase().includes('WHERE')) {
                    generatedSQL = generatedSQL.replace(/WHERE/i, `WHERE project_location ILIKE '%${safeArea}%' AND`);
                } else {
                    generatedSQL = generatedSQL.replace(/FROM\s+(\w+)/i, `FROM $1 WHERE project_location ILIKE '%${safeArea}%'`);
                }
            }
        }

        const queryResult = await sqlQueryService.executeSecureQuery(generatedSQL, {
            maxRetries: 0,
        });

        if (queryResult.success) {
            return {
                data: queryResult.rows,
                rowCount: queryResult.rowCount,
                sql: queryResult.executedSQL,
            };
        } else {
            return { error: queryResult.error };
        }
    } catch (err) {
        return { error: err.message };
    }
}

// --- Tool: calculate_carbon ---
async function toolCalculateCarbon({ dbh_cm, height_m, species }) {
    // 碳匯計算公式 — 與前端 tree_input_page.dart 完全一致
    // 參考: Chave et al. (2014) pan-tropical allometric equation (簡化版)
    // AGB = e^(−2.48 + 2.4835 × ln(DBH))
    // TB  = 1.24 × AGB (root-to-shoot ratio)
    // C   = 0.50 × TB  (IPCC default carbon fraction)
    // CO₂ = C × 3.67   (molecular weight ratio 44/12)

    const dbh = dbh_cm || 0;
    if (dbh <= 0) {
        return { error: '胸徑 (DBH) 必須大於 0' };
    }

    // 步驟一：地上部生物量 (Above-Ground Biomass)
    const agb_kg = Math.exp(-2.48 + 2.4835 * Math.log(dbh));

    // 步驟二：總生物量 (含根系)
    const totalBiomass_kg = 1.24 * agb_kg;

    // 步驟三：碳儲存量
    const carbonStorage_kg = 0.50 * totalBiomass_kg;
    const carbonStorage_ton = carbonStorage_kg / 1000;

    // 步驟四：CO₂ 當量
    const co2Equivalent_kg = carbonStorage_kg * 3.67;
    const co2Equivalent_ton = co2Equivalent_kg / 1000;

    // 步驟五：年碳吸存量 (預設年生長率 3%)
    const growthRate = 0.03;
    const annualSequestration_kg = co2Equivalent_kg * growthRate;

    return {
        input: { dbh_cm: dbh, height_m: height_m || null, species: species || '通用' },
        biomass: {
            above_ground_kg: Math.round(agb_kg * 100) / 100,
            total_kg: Math.round(totalBiomass_kg * 100) / 100,
        },
        carbon: {
            storage_kg: Math.round(carbonStorage_kg * 100) / 100,
            storage_ton: Math.round(carbonStorage_ton * 1000) / 1000,
            co2_equivalent_kg: Math.round(co2Equivalent_kg * 100) / 100,
            co2_equivalent_ton: Math.round(co2Equivalent_ton * 1000) / 1000,
        },
        annual: {
            sequestration_kg_co2: Math.round(annualSequestration_kg * 100) / 100,
            growth_rate: `${(growthRate * 100).toFixed(1)}%`,
        },
        methodology: 'Chave et al. (2014) 簡化泛熱帶方程，與前端計算一致',
        note: '此為估算值，實際碳信用需經第三方驗證機構 (VVB) 查驗。',
    };
}

// --- Tool: species_carbon_info ---
async function toolSpeciesCarbonInfo({ species_name }) {
    try {
        const result = await db.query(
            `SELECT * FROM tree_carbon_data WHERE common_name_zh ILIKE $1 LIMIT 5`,
            [`%${species_name}%`]
        );

        if (result.rows.length > 0) {
            return { species: result.rows };
        }

        // 也查詢 tree_survey 中的統計資料
        const stats = await db.query(
            `SELECT 
                species_name,
                COUNT(*) as tree_count,
                ROUND(AVG(dbh_cm)::numeric, 1) as avg_dbh,
                ROUND(AVG(tree_height_m)::numeric, 1) as avg_height,
                ROUND(AVG(carbon_storage)::numeric, 1) as avg_carbon_storage,
                ROUND(SUM(carbon_storage)::numeric, 1) as total_carbon,
                ROUND(AVG(carbon_sequestration_per_year)::numeric, 2) as avg_annual_seq
            FROM tree_survey 
            WHERE species_name ILIKE $1
            GROUP BY species_name
            LIMIT 5`,
            [`%${species_name}%`]
        );

        if (stats.rows.length > 0) {
            return { species_stats: stats.rows };
        }

        return { message: `未找到樹種「${species_name}」的資料` };
    } catch (err) {
        return { error: err.message };
    }
}

// --- Tool: project_summary ---
async function toolProjectSummary({ project_area }) {
    try {
        let whereClause = '';
        const params = [];
        if (project_area) {
            whereClause = `WHERE project_location ILIKE $1`;
            params.push(`%${project_area}%`);
        }

        const summary = await db.query(
            `SELECT 
                project_location,
                COUNT(*) as tree_count,
                COUNT(DISTINCT species_name) as species_count,
                ROUND(AVG(dbh_cm)::numeric, 1) as avg_dbh_cm,
                ROUND(AVG(tree_height_m)::numeric, 1) as avg_height_m,
                ROUND(SUM(carbon_storage)::numeric, 1) as total_carbon_kg,
                ROUND(AVG(carbon_storage)::numeric, 1) as avg_carbon_kg,
                ROUND(SUM(carbon_sequestration_per_year)::numeric, 1) as total_annual_seq_kg
            FROM tree_survey 
            ${whereClause}
            GROUP BY project_location 
            ORDER BY tree_count DESC`,
            params
        );

        // 計算全局統計
        const totals = await db.query(
            `SELECT 
                COUNT(*) as total_trees,
                COUNT(DISTINCT species_name) as total_species,
                COUNT(DISTINCT project_location) as total_areas,
                ROUND(SUM(carbon_storage)::numeric, 1) as total_carbon_kg,
                ROUND(SUM(carbon_sequestration_per_year)::numeric, 1) as total_annual_seq_kg
            FROM tree_survey ${whereClause}`,
            params
        );

        return {
            areas: summary.rows,
            totals: totals.rows[0],
            co2_equivalent_tons: totals.rows[0]
                ? Math.round((totals.rows[0].total_carbon_kg * 3.667) / 1000 * 100) / 100
                : 0,
        };
    } catch (err) {
        return { error: err.message };
    }
}

// --- Tool: carbon_credit_estimate ---
async function toolCarbonCreditEstimate({ project_area, methodology = 'vcs_ar', period_years = 10 }) {
    try {
        let whereClause = '';
        const params = [];
        if (project_area) {
            whereClause = `WHERE project_location ILIKE $1`;
            params.push(`%${project_area}%`);
        }

        const data = await db.query(
            `SELECT 
                COUNT(*) as tree_count,
                ROUND(SUM(carbon_storage)::numeric, 1) as total_carbon_kg,
                ROUND(SUM(carbon_sequestration_per_year)::numeric, 1) as annual_seq_kg,
                ROUND(AVG(dbh_cm)::numeric, 1) as avg_dbh
            FROM tree_survey ${whereClause}`,
            params
        );

        const stats = data.rows[0];
        if (!stats || stats.tree_count === 0) {
            return { message: '未找到符合條件的樹木資料' };
        }

        const totalCarbonKg = parseFloat(stats.total_carbon_kg) || 0;
        const annualSeqKg = parseFloat(stats.annual_seq_kg) || 0;

        // CO2 當量
        const currentCO2_ton = (totalCarbonKg * 3.667) / 1000;
        const annualCO2_ton = (annualSeqKg * 3.667) / 1000;
        const periodCO2_ton = annualCO2_ton * period_years;

        // 方法學差異
        const methodologies = {
            vcs_ar: {
                name: 'VCS 造林/再造林 (AR-ACM0003)',
                discount: 0.80, // 20% buffer pool
                price_usd: { min: 5, max: 15 },
                description: '國際自願碳市場最廣泛使用的方法學',
            },
            gold_standard: {
                name: 'Gold Standard 碳信用',
                discount: 0.75,
                price_usd: { min: 10, max: 30 },
                description: '環境和社會效益的最高標準',
            },
            taiwan_offset: {
                name: '台灣碳權抵換 (國內碳費)',
                discount: 0.90,
                price_usd: { min: 3, max: 10 },
                description: '依據台灣環境部碳費徵收配套',
            },
        };

        const method = methodologies[methodology] || methodologies.vcs_ar;
        const creditableCO2 = periodCO2_ton * method.discount;
        const usdToTwd = 32;

        return {
            project: project_area || '全部區域',
            tree_count: parseInt(stats.tree_count),
            period_years,
            methodology: method.name,
            methodology_description: method.description,
            current_stock: {
                carbon_ton: Math.round(totalCarbonKg / 1000 * 100) / 100,
                co2_equivalent_ton: Math.round(currentCO2_ton * 100) / 100,
            },
            projected: {
                annual_co2_ton: Math.round(annualCO2_ton * 100) / 100,
                period_co2_ton: Math.round(periodCO2_ton * 100) / 100,
                creditable_co2_ton: Math.round(creditableCO2 * 100) / 100,
                buffer_deduction: `${((1 - method.discount) * 100).toFixed(0)}%`,
            },
            value_estimate: {
                min_usd: Math.round(creditableCO2 * method.price_usd.min),
                max_usd: Math.round(creditableCO2 * method.price_usd.max),
                min_twd: Math.round(creditableCO2 * method.price_usd.min * usdToTwd),
                max_twd: Math.round(creditableCO2 * method.price_usd.max * usdToTwd),
                carbon_price_range: `USD ${method.price_usd.min}-${method.price_usd.max}/tCO₂e`,
            },
            disclaimer: '此為估算值，實際碳信用額度需經授權驗證機構 (VVB) 查驗及核證。碳價參考國際市場行情，可能隨時變動。',
        };
    } catch (err) {
        return { error: err.message };
    }
}

// ============================================
// Agent 主函數: ReAct Loop
// ============================================

const AGENT_SYSTEM_PROMPT = `你是「碳匯永續智慧助理」，一個專門服務於台灣港務公司(TIPC)永續碳匯管理系統的 AI Agent。

## 核心規則 (必須遵守)
1. **你必須使用工具查詢數據，絕對不可以編造或猜測任何數字。**
2. 即使是簡單的問題（例如「有多少棵樹」），也必須先調用工具取得真實數據再回答。
3. 當使用者的問題涉及多個面向時，你應該調用多個工具分別取得數據，再綜合回答。
4. 如果工具傳回錯誤，嘗試換一種方式查詢，或誠實告知使用者查詢失敗。

## 可用工具
1. **query_tree_data** — 查詢樹木資料庫 (胸徑、樹高、碳儲存、樹種分布等)
2. **calculate_carbon** — 計算碳匯指標 (碳儲存量、CO₂ 當量、年碳吸存)
3. **species_carbon_info** — 查詢特定樹種的碳匯參數
4. **project_summary** — 取得專案區域統計摘要
5. **carbon_credit_estimate** — 估算碳信用額度 (VCS/Gold Standard/台灣碳權)

## 回答準則
- 回答時必須引用工具返回的實際數據
- 碳匯計算要說明使用的方法學和公式
- 涉及碳交易時要聲明「此為估算，需經第三方驗證」
- 用繁體中文回答，語氣專業但友善
- 可以結合多個工具回答複雜問題

## 服務對象
- 環境學院教授和研究生 (學術研究)
- TIPC 永續發展部門 (碳盤查和碳交易)
- 林業調查員 (現場數據管理)`;

/**
 * 執行 Agent ReAct Loop
 * 
 * @param {string} message - 使用者訊息
 * @param {string} userId - 使用者 ID
 * @param {Array} chatHistory - 歷史對話
 * @param {Object} options - 選項 { model, maxSteps }
 * @returns {Object} { response, toolCalls, tokensUsed }
 */
async function runAgent(message, userId, chatHistory = [], options = {}) {
    const model = options.model || AGENT_MODELS.default;
    const maxSteps = Math.min(options.maxSteps || MAX_AGENT_STEPS, MAX_AGENT_STEPS);

    // 檢查 token 預算
    if (!checkTokenBudget(userId)) {
        return {
            response: '⚠️ 您的 AI Agent 使用額度已達到每小時上限 (50,000 tokens)，請稍後再試。',
            toolCalls: [],
            tokensUsed: 0,
        };
    }

    const client = siliconFlowClient;
    if (!client) {
        return {
            response: '❌ AI Agent 服務未配置 (SiliconFlow API Key 未設定)',
            toolCalls: [],
            tokensUsed: 0,
        };
    }

    // 構建 messages
    const messages = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ];

    // 加入歷史對話 (最近 5 筆)
    const recentHistory = chatHistory.slice(-5);
    for (const h of recentHistory) {
        messages.push({ role: 'user', content: h.message });
        messages.push({ role: 'assistant', content: h.response });
    }

    messages.push({ role: 'user', content: message });

    const allToolCalls = [];
    let totalTokens = 0;

    // ReAct Loop
    for (let step = 0; step < maxSteps; step++) {
        try {
            const completion = await client.chat.completions.create({
                model,
                messages,
                tools: AGENT_TOOLS,
                tool_choice: step === 0 ? 'required' : 'auto',
                temperature: 0.1,
                max_tokens: 2000,
            });

            const assistantMsg = completion.choices[0].message;
            const usage = completion.usage || {};
            totalTokens += (usage.total_tokens || 0);

            // 如果沒有工具調用，表示 Agent 已完成
            if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
                addTokenUsage(userId, totalTokens);
                return {
                    response: assistantMsg.content || '我無法處理這個請求。',
                    toolCalls: allToolCalls,
                    tokensUsed: totalTokens,
                };
            }

            // 執行工具調用
            messages.push(assistantMsg);

            for (const toolCall of assistantMsg.tool_calls) {
                const fnName = toolCall.function.name;
                let fnArgs;
                try {
                    fnArgs = JSON.parse(toolCall.function.arguments);
                } catch {
                    fnArgs = {};
                }

                console.log(`[Agent] Step ${step + 1}: ${fnName}(${JSON.stringify(fnArgs).substring(0, 100)})`);

                const result = await executeToolCall(fnName, fnArgs);
                // 限制結果大小: 先截斷資料陣列，再 stringify，避免產生無效 JSON
                let resultForMsg = result;
                if (result && result.data && Array.isArray(result.data) && result.data.length > 50) {
                    resultForMsg = { ...result, data: result.data.slice(0, 50), truncated: true, totalRows: result.data.length };
                }
                const resultStr = JSON.stringify(resultForMsg).substring(0, 4000);

                allToolCalls.push({
                    tool: fnName,
                    args: fnArgs,
                    result: result,
                });

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: resultStr,
                });
            }
        } catch (err) {
            console.error(`[Agent] Step ${step + 1} error:`, err.message);
            
            // 如果是 API key 錯誤，嘗試切換 key
            if (err.status === 401 || err.status === 429) {
                const nextClient = getNextClient();
                if (nextClient) {
                    // 使用局部 client 變數避免模組級變數的競態問題
                    Object.assign(client, { apiKey: SF_KEYS[currentKeyIndex] });
                    console.log(`[Agent] 切換到備用 SiliconFlow API Key (index ${currentKeyIndex})`);
                    continue; // 重試這一步
                }
            }
            
            addTokenUsage(userId, totalTokens);
            return {
                response: `處理過程中發生錯誤: ${err.message}`,
                toolCalls: allToolCalls,
                tokensUsed: totalTokens,
            };
        }
    }

    // 超過最大步數，返回目前的結果
    addTokenUsage(userId, totalTokens);
    
    // 嘗試獲取最終回應
    try {
        const finalCompletion = await client.chat.completions.create({
            model,
            messages: [
                ...messages,
                { role: 'user', content: '請根據以上工具結果，給出最終的完整回答。' },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        });
        return {
            response: finalCompletion.choices[0].message.content,
            toolCalls: allToolCalls,
            tokensUsed: totalTokens + (finalCompletion.usage?.total_tokens || 0),
        };
    } catch {
        return {
            response: '已收集資料但無法生成最終回答，請重新嘗試。',
            toolCalls: allToolCalls,
            tokensUsed: totalTokens,
        };
    }
}

module.exports = {
    runAgent,
    AGENT_MODELS,
    AGENT_TOOLS,
    checkTokenBudget,
};
