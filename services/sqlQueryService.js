/**
 * SQL Query Service - 安全的 Text-to-SQL 服務
 * 
 * 功能：讓 LLM 根據使用者問題生成 SQL，並安全地執行查詢
 * 
 * 安全機制：
 * 1. 只允許 SELECT 語句
 * 2. 白名單限制可查詢的表格
 * 3. 黑名單禁止危險關鍵字
 * 4. 強制 LIMIT 防止大量資料
 * 5. 完整的錯誤處理
 * 
 * @module services/sqlQueryService
 */

const db = require('../config/db');

// ============================================
// 配置區
// ============================================

// 允許查詢的表格白名單
const ALLOWED_TABLES = [
    'tree_survey',
    'tree_species', 
    'tree_carbon_data',
    'project_areas',
    'tree_survey_with_areas'  // View
];

// 禁止的 SQL 關鍵字黑名單（使用 word boundary 檢查）
const FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 
    'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'EXECUTE',
    'EXEC', 'MERGE', 'CALL', 'LOCK', 'UNLOCK',
    'RENAME', 'REPLACE', 'DESCRIBE',
    'HANDLER', 'LOAD', 'PREPARE', 'DEALLOCATE',
    'XP_CMDSHELL', 'SP_EXECUTESQL', 'WAITFOR',
    'BENCHMARK', 'SLEEP', 'PG_SLEEP', 'DBLINK'
];

// 禁止的特殊字元序列（用於 SQL 注入攻擊）
const FORBIDDEN_PATTERNS = [
    '--',      // SQL 單行註解
    ';--',     // 語句結束 + 註解
    '/*',      // 多行註解開始
    '*/',      // 多行註解結束
];

// 最大回傳筆數
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// ============================================
// Schema 資訊（給 LLM 參考）
// ============================================

const SCHEMA_INFO = `
你可以查詢以下資料表：

1. tree_survey (樹木調查資料表) - 主要資料表
   - id: 整數，主鍵
   - system_tree_id: 文字，系統樹木編號 (如 ST-0001)
   - project_tree_id: 文字，專案樹木編號
   - project_location: 文字，專案區位名稱
   - project_code: 文字，專案代碼
   - project_name: 文字，專案名稱
   - species_id: 文字，樹種編號
   - species_name: 文字，樹種名稱 (如 榕樹、樟樹)
   - x_coord: 數字，X座標
   - y_coord: 數字，Y座標
   - tree_height_m: 數字，樹高（公尺）
   - dbh_cm: 數字，胸高直徑（公分）
   - status: 文字，狀況
   - notes: 文字，備註
   - carbon_storage: 數字，碳儲存量（公斤）
   - carbon_sequestration_per_year: 數字，年碳吸存量（公斤/年）
   - survey_time: 時間戳，調查時間

2. tree_species (樹種資料表)
   - id: 文字，樹種編號
   - name: 文字，樹種名稱
   - scientific_name: 文字，學名

3. tree_carbon_data (樹種碳匯資料表)
   - id: 整數，主鍵
   - common_name_zh: 文字，中文名
   - scientific_name: 文字，學名
   - carbon_absorption_min/max: 數字，年碳吸收範圍
   - growth_rate: 文字，生長速率
   - carbon_efficiency: 文字，碳效率評級

4. project_areas (專案區域表)
   - id: 整數，主鍵
   - area_name: 文字，區域名稱

重要提醒：
- 只能使用 SELECT 語句
- 必須在查詢結尾加上 LIMIT (最多 ${MAX_LIMIT})
- 文字比對建議使用 ILIKE 進行模糊搜尋
- 樹種名稱欄位是 species_name
- 系統編號欄位是 system_tree_id
`;

// ============================================
// SQL 安全驗證函數
// ============================================

/**
 * 驗證 SQL 是否安全
 * @param {string} sql - 要驗證的 SQL 語句
 * @returns {{ safe: boolean, reason?: string, sanitizedSQL?: string }}
 */
function validateSQL(sql) {
    if (!sql || typeof sql !== 'string') {
        return { safe: false, reason: '無效的 SQL 語句' };
    }

    // 移除首尾空白並轉大寫用於檢查
    const trimmedSQL = sql.trim();
    const upperSQL = trimmedSQL.toUpperCase();

    // 1. 必須以 SELECT 開頭
    if (!upperSQL.startsWith('SELECT')) {
        return { safe: false, reason: '只允許 SELECT 查詢語句' };
    }

    // 2a. 檢查黑名單關鍵字（使用 word boundary）
    for (const keyword of FORBIDDEN_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(trimmedSQL)) {
            return { safe: false, reason: `禁止使用 ${keyword} 關鍵字` };
        }
    }

    // 2b. 檢查危險的特殊字元序列（SQL 注入常用）
    for (const pattern of FORBIDDEN_PATTERNS) {
        if (trimmedSQL.includes(pattern)) {
            return { safe: false, reason: `禁止使用 SQL 註解或注入字元: ${pattern}` };
        }
    }

    // 3. 檢查是否包含多個語句（分號分隔）
    // 移除字串內的分號後檢查
    const sqlWithoutStrings = trimmedSQL.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    if (sqlWithoutStrings.includes(';') && !sqlWithoutStrings.trim().endsWith(';')) {
        return { safe: false, reason: '禁止執行多個 SQL 語句' };
    }

    // 4. 檢查表格白名單
    // 提取 FROM 和 JOIN 後面的表名
    const tablePattern = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let match;
    const usedTables = [];
    while ((match = tablePattern.exec(trimmedSQL)) !== null) {
        usedTables.push(match[1].toLowerCase());
    }

    for (const table of usedTables) {
        if (!ALLOWED_TABLES.includes(table)) {
            return { safe: false, reason: `不允許查詢表格: ${table}` };
        }
    }

    // 5. 確保有 LIMIT（如果沒有則自動加上）
    let sanitizedSQL = trimmedSQL;
    if (!upperSQL.includes('LIMIT')) {
        // 移除結尾分號（如果有）
        sanitizedSQL = sanitizedSQL.replace(/;*$/, '');
        sanitizedSQL += ` LIMIT ${DEFAULT_LIMIT}`;
    } else {
        // 檢查 LIMIT 值是否過大
        const limitMatch = upperSQL.match(/LIMIT\s+(\d+)/);
        if (limitMatch) {
            const limitValue = parseInt(limitMatch[1], 10);
            if (limitValue > MAX_LIMIT) {
                // 替換為最大允許值
                sanitizedSQL = trimmedSQL.replace(/LIMIT\s+\d+/i, `LIMIT ${MAX_LIMIT}`);
            }
        }
    }

    // 移除結尾分號
    sanitizedSQL = sanitizedSQL.replace(/;*$/, '');

    return { safe: true, sanitizedSQL };
}

// ============================================
// 生成 SQL 的 Prompt
// ============================================

/**
 * 生成讓 LLM 產生 SQL 的 prompt
 * @param {string} userQuestion - 使用者問題
 * @returns {string}
 */
function buildSQLGenerationPrompt(userQuestion) {
    return `你是一個專業的 PostgreSQL 資料庫助手。請根據使用者的問題，生成一個安全且正確的 SQL 查詢語句。

${SCHEMA_INFO}

使用者問題：${userQuestion}

請直接回傳 SQL 語句，不要加任何解釋或 markdown 格式。
如果問題與資料庫查詢無關，請回傳 "NOT_A_DATA_QUERY"。

範例輸出格式：
SELECT species_name, COUNT(*) as count FROM tree_survey GROUP BY species_name ORDER BY count DESC LIMIT 10
`;
}

/**
 * 生成讓 LLM 解釋查詢結果的 prompt
 * @param {string} userQuestion - 使用者原始問題
 * @param {string} sql - 執行的 SQL
 * @param {Array} results - 查詢結果
 * @param {number} totalCount - 結果總數
 * @returns {string}
 */
function buildResultExplanationPrompt(userQuestion, sql, results, totalCount) {
    // 限制結果大小，避免 token 過多
    const displayResults = results.slice(0, 20);
    const hasMore = results.length > 20;

    return `使用者問題：${userQuestion}

我從資料庫查詢到以下結果（共 ${totalCount} 筆${hasMore ? '，以下顯示前 20 筆' : ''}）：

${JSON.stringify(displayResults, null, 2)}

請用繁體中文，以友善、專業的方式回答使用者的問題。
如果結果為空，請告知使用者沒有找到相關資料。
如果有多筆資料，請做適當的摘要或列表呈現。
請在回答中自然地融入數據，不要只是列出原始 JSON。`;
}

// ============================================
// 主要服務函數
// ============================================

/**
 * 執行安全的 SQL 查詢
 * @param {string} sql - 已驗證的 SQL 語句
 * @returns {Promise<{ success: boolean, rows?: Array, rowCount?: number, error?: string }>}
 */
async function executeSecureQuery(sql) {
    try {
        const validation = validateSQL(sql);
        if (!validation.safe) {
            return { success: false, error: validation.reason };
        }

        console.log(`[SQLQueryService] 執行查詢: ${validation.sanitizedSQL}`);
        
        const result = await db.query(validation.sanitizedSQL);
        
        console.log(`[SQLQueryService] 查詢成功，回傳 ${result.rowCount} 筆資料`);
        
        return {
            success: true,
            rows: result.rows,
            rowCount: result.rowCount,
            executedSQL: validation.sanitizedSQL
        };
    } catch (error) {
        console.error('[SQLQueryService] 查詢執行錯誤:', error.message);
        return { 
            success: false, 
            error: `資料庫查詢錯誤: ${error.message}` 
        };
    }
}

/**
 * 判斷使用者問題是否需要查詢資料庫
 * @param {string} question - 使用者問題
 * @returns {boolean}
 */
function shouldQueryDatabase(question) {
    // 關鍵字判斷（快速路徑，不需要 LLM）
    const dataKeywords = [
        '幾棵', '多少', '哪些', '哪一', '列出', '查詢', '搜尋', '找',
        '統計', '總數', '平均', '最高', '最大', '最小', '超過', '低於',
        'ST-', 'PT-',  // 樹木編號
        '胸徑', '樹高', '碳儲存', '碳吸存',
        '專案', '區域', '區位'
    ];

    const knowledgeKeywords = [
        '什麼是', '為什麼', '如何', '怎麼', '介紹', '說明', '解釋',
        '適合', '建議', '好處', '壞處', '特性', '特徵'
    ];

    const lowerQ = question.toLowerCase();
    
    // 如果包含資料關鍵字，傾向查資料庫
    for (const kw of dataKeywords) {
        if (question.includes(kw)) {
            return true;
        }
    }

    // 如果包含知識關鍵字，傾向不查資料庫
    for (const kw of knowledgeKeywords) {
        if (question.includes(kw)) {
            return false;
        }
    }

    // 預設不查資料庫（讓 LLM 自然回答）
    return false;
}

// ============================================
// 匯出
// ============================================

module.exports = {
    validateSQL,
    executeSecureQuery,
    buildSQLGenerationPrompt,
    buildResultExplanationPrompt,
    shouldQueryDatabase,
    SCHEMA_INFO,
    ALLOWED_TABLES,
    MAX_LIMIT,
    DEFAULT_LIMIT
};
