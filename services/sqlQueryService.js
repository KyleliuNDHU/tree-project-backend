/**
 * SQL Query Service - 安全的 Text-to-SQL 服務 (V2 優化版)
 * 
 * 2025.11 優化重點：
 * - 更精確的意圖分類
 * - 更完整的 SQL 生成指引
 * - 以資料為主、LLM 為輔的回答策略
 * - 優化的歷史對話處理（節省記憶體）
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
    'BENCHMARK', 'SLEEP', 'PG_SLEEP', 'DBLINK',
    // 資訊洩漏相關
    'CURRENT_USER', 'CURRENT_DATABASE', 'SESSION_USER',
    'LO_IMPORT', 'LO_EXPORT', 'PG_READ_FILE', 'PG_LS_DIR',
    // 更多系統函數
    'INET_SERVER_ADDR', 'INET_SERVER_PORT', 'PG_BACKEND_PID',
    'CURRENT_SETTING', 'PG_CONF_LOAD_TIME', 'PG_POSTMASTER_START_TIME'
];

// 禁止的特殊字元序列（用於 SQL 注入攻擊）
const FORBIDDEN_PATTERNS = [
    '--',      // SQL 單行註解
    ';--',     // 語句結束 + 註解
];

// 禁止的函數/模式（正則）
const FORBIDDEN_FUNCTION_PATTERNS = [
    /CHAR\s*\(/i,           // CHAR() 函數（用於繞過字串檢查）
    /0x[0-9a-f]+/i,         // 十六進位字串（用於編碼攻擊）
    /CONCAT\s*\(/i,         // CONCAT() 可用於構造惡意字串
    /CHR\s*\(/i,            // PostgreSQL 的 CHR()
    /'\s*OR\s*'[^']*'\s*=\s*'/i,  // 經典 OR '1'='1' 注入
    // 編碼繞過攻擊
    /E'\\\\x[0-9a-f]/i,     // PostgreSQL 十六進位逃逸字串 E'\x...'
    /E'\s*\\\\x/i,          // E' \x 變體
    /U&'\\\\[0-9a-f]/i,     // PostgreSQL Unicode 逃逸字串
    /E'\\\\[xuU]/i,         // 任何 PostgreSQL 逃逸字串
    /U&'/i,                 // Unicode 逃逸開始
    // 永真條件注入（攻擊常用）
    /\bOR\s+\d+\s*=\s*\d+/i,        // OR 1=1, OR 2=2 等
    /\bOR\s+'[^']*'\s*=\s*'[^']*'/i, // OR 'a'='a'
    /\bOR\s+''\s*=\s*''/i,           // OR ''=''
    /\bWHERE\s+'[^']*'\s*=\s*'[^']*'/i, // WHERE 'a'='a'
    /\bWHERE\s+''\s*=\s*''/i,           // WHERE ''=''
    /\b\d+\s+LIKE\s+\d+/i,              // 1 LIKE 1
    // 字串串接注入
    /''\s*\|\|\s*'[^']*UNION/i,         // '' || 'UNION...
    /''\s*\|\|\s*'[^']*SELECT/i,        // '' || 'SELECT...
    // 字串內包含 SQL 關鍵字（在 || 串接中）
    /\|\|\s*'[^']*\bUNION\b/i,          // || '...UNION...
    /\|\|\s*'[^']*\bSELECT\b[^']*\bFROM\b/i, // || '...SELECT...FROM...
];

// 回傳筆數限制（針對 512MB RAM 優化）
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// 歷史對話限制（平衡記憶體和使用體驗）
const MAX_HISTORY_COUNT = 10;     // 最多載入 10 筆歷史
const MAX_HISTORY_LENGTH = 100;   // 每筆歷史最多 100 字元
const HISTORY_WINDOW_MINUTES = 15; // 只載入 15 分鐘內的對話

// ============================================
// Schema 資訊（給 LLM 參考）- 詳細版本
// ============================================

const SCHEMA_INFO = `
## 資料庫結構

### 1. tree_survey (樹木調查主表)
| 欄位 | 類型 | 說明 | 範例值 |
|------|------|------|--------|
| id | INTEGER | 主鍵 (自增) | 1, 2, 3 |
| system_tree_id | TEXT | 系統樹木編號 (純數字字串) | '7', '8', '100' |
| project_tree_id | TEXT | 專案樹木編號 (純數字字串) | '1', '2', '31' |
| species_name | TEXT | 樹種名稱 | 欖仁、榕樹、樟樹 |
| tree_height_m | NUMERIC | 樹高(公尺) | 5.5, 12.3 |
| dbh_cm | NUMERIC | 胸徑(公分) | 25.0, 68.5 |
| status | TEXT | 健康狀況 | 正常、良好、需關注 |
| carbon_storage | NUMERIC | 碳儲存量(公斤) | 150.5 |
| carbon_sequestration_per_year | NUMERIC | 年碳吸存量 | 12.3 |
| project_location | TEXT | 專案區位 | 高雄港、花蓮港、台北市 |
| project_name | TEXT | 專案名稱 | 港區植栽4區 |
| project_code | TEXT | 專案代碼 | 6, 7 |
| x_coord | NUMERIC | X 坐標 (經度) | 120.28626 |
| y_coord | NUMERIC | Y 坐標 (緯度) | 22.617992 |
| notes | TEXT | 備註 | 無、需修剪 |
| survey_time | TIMESTAMP | 調查時間 | 2022-11-21 |

⚠️ 重要：system_tree_id 和 project_tree_id 都是【純數字字串】，不是 'ST-0001' 這種格式！
例如：WHERE system_tree_id = '7' 或 WHERE project_tree_id IN ('1','2','3')

### 2. tree_species (樹種資料表)
- id, name, scientific_name

### 3. tree_carbon_data (樹種碳匯參數)
- common_name_zh, carbon_absorption_min/max, growth_rate, carbon_efficiency

## 常用查詢模板
1. 查單筆: SELECT system_tree_id, species_name, tree_height_m, dbh_cm, status, carbon_storage, project_location FROM tree_survey WHERE system_tree_id = '7'
2. 查詢編號範圍: SELECT * FROM tree_survey WHERE CAST(project_tree_id AS INTEGER) BETWEEN 1 AND 31 AND project_location ILIKE '%花蓮港%'
3. 統計總數: SELECT COUNT(*) as total FROM tree_survey
4. 按樹種統計: SELECT species_name, COUNT(*) as count, ROUND(AVG(dbh_cm)::numeric,1) as avg_dbh FROM tree_survey GROUP BY species_name ORDER BY count DESC
5. 條件篩選: SELECT system_tree_id, species_name, dbh_cm, tree_height_m, carbon_storage FROM tree_survey WHERE dbh_cm > 50 ORDER BY dbh_cm DESC
6. 查特定樹種: SELECT system_tree_id, tree_height_m, dbh_cm, carbon_storage, status FROM tree_survey WHERE species_name ILIKE '%榕樹%'
7. 查特定區位: SELECT * FROM tree_survey WHERE project_location ILIKE '%花蓮港%'

重要提醒：
- 只能使用 SELECT 語句
- 必須加 LIMIT (最多 ${MAX_LIMIT})
- 文字比對用 ILIKE
- system_tree_id 和 project_tree_id 是純數字字串！
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

    // 0. 檢查 SQL 長度（防止超長 SQL 導致問題）
    if (trimmedSQL.length > 2000) {
        return { safe: false, reason: 'SQL 語句過長' };
    }

    // 0a. 檢查重複字元（防止 DoS）
    if (/\*{10,}/.test(trimmedSQL)) {
        return { safe: false, reason: 'SQL 語句包含異常重複字元' };
    }
    
    // 0aa. 檢查過多的 JOIN 或 AND（防止複雜度攻擊）
    const joinCount = (upperSQL.match(/\bJOIN\b/g) || []).length;
    const andCount = (upperSQL.match(/\bAND\b/g) || []).length;
    const onCount = (upperSQL.match(/\bON\s+/g) || []).length;
    if (joinCount > 10) {
        return { safe: false, reason: 'SQL 語句包含過多 JOIN' };
    }
    if (andCount > 20) {
        return { safe: false, reason: 'SQL 語句包含過多 AND 條件' };
    }
    // 檢查重複 ON（異常 JOIN 攻擊）
    if (onCount > joinCount + 2) {
        return { safe: false, reason: 'SQL 語句包含異常 ON 子句' };
    }

    // 0b. 檢查引號是否平衡（防止 unterminated string 錯誤）
    const singleQuotes = (trimmedSQL.match(/'/g) || []).length;
    const doubleQuotes = (trimmedSQL.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
        return { safe: false, reason: 'SQL 語句引號不平衡（單引號）' };
    }
    if (doubleQuotes % 2 !== 0) {
        return { safe: false, reason: 'SQL 語句引號不平衡（雙引號）' };
    }

    // 1. 必須以 SELECT 或 WITH (CTE) 開頭
    if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
        return { safe: false, reason: '只允許 SELECT 查詢語句' };
    }

    // 1b. 如果是 WITH，確保最終是 SELECT（不是 INSERT/UPDATE/DELETE）
    if (upperSQL.startsWith('WITH')) {
        // CTE 後面必須有 SELECT
        if (!/\)\s*SELECT\b/i.test(upperSQL)) {
            return { safe: false, reason: 'WITH 子句必須搭配 SELECT 使用' };
        }
    }

    // 2a-pre. 特殊編碼攻擊檢查（在原始 SQL 上執行，因為需要檢查字串內容）
    // 這些是編碼繞過攻擊，即使在字串內也是可疑的
    const encodingPatterns = [
        /E'\\x[0-9a-f]/i,       // PostgreSQL 十六進位逃逸
        /U&'/i,                  // PostgreSQL Unicode 逃逸
        /\|\|\s*'[^']*\bUNION\b/i,  // 字串串接含 UNION
        /\|\|\s*'[^']*\bSELECT\b[^']*\bFROM\b/i, // 字串串接含 SELECT FROM
    ];
    for (const pattern of encodingPatterns) {
        if (pattern.test(trimmedSQL)) {
            return { safe: false, reason: '禁止使用可疑的編碼或字串串接模式' };
        }
    }

    // 移除字串常量後再檢查關鍵字（避免誤判字串內容）
    // 例如 LIKE '%drop%' 不應該觸發 DROP 關鍵字檢查
    const sqlWithoutStrings = trimmedSQL.replace(/'[^']*'/g, '\'\'').replace(/"[^"]*"/g, '""');

    // 2a. 檢查黑名單關鍵字（使用 word boundary，在移除字串後的 SQL 中檢查）
    for (const keyword of FORBIDDEN_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(sqlWithoutStrings)) {
            return { safe: false, reason: `禁止使用 ${keyword} 關鍵字` };
        }
    }

    // 2b. 檢查危險的特殊字元序列（SQL 注入常用）- 在移除字串後檢查
    for (const pattern of FORBIDDEN_PATTERNS) {
        if (sqlWithoutStrings.includes(pattern)) {
            return { safe: false, reason: `禁止使用 SQL 註解或注入字元: ${pattern}` };
        }
    }

    // 2c. 檢查危險的函數/模式（正則檢查）- 在移除字串後檢查
    for (const pattern of FORBIDDEN_FUNCTION_PATTERNS) {
        if (pattern.test(sqlWithoutStrings)) {
            return { safe: false, reason: `禁止使用可疑的 SQL 函數或模式` };
        }
    }

    // 3. 檢查是否包含多個語句（分號分隔）
    // 使用已經移除字串的版本
    if (sqlWithoutStrings.includes(';') && !sqlWithoutStrings.trim().endsWith(';')) {
        return { safe: false, reason: '禁止執行多個 SQL 語句' };
    }

    // 4. 檢查表格白名單
    
    // 4a. 完全禁止 UNION（常用於注入攻擊）
    if (/\bUNION\b/i.test(sqlWithoutStrings)) {
        return { safe: false, reason: '禁止使用 UNION 查詢' };
    }
    
    // 4aa. 提取 CTE 名稱（WITH name AS）
    const cteNames = new Set();
    const ctePattern = /\bWITH\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
    let cteMatch;
    while ((cteMatch = ctePattern.exec(sqlWithoutStrings)) !== null) {
        cteNames.add(cteMatch[1].toLowerCase());
    }
    
    // 4b. 提取所有可能的表名
    const usedTables = new Set();
    
    // 匹配 FROM/JOIN 後的表名（支援 schema.table 格式）
    // 例如: FROM tree_survey, FROM information_schema.tables, JOIN tree_species
    const tablePattern = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/gi;
    let match;
    while ((match = tablePattern.exec(sqlWithoutStrings)) !== null) {
        usedTables.add(match[1].toLowerCase());
    }
    
    // 匹配逗號分隔的表（FROM table1, table2）
    // 先找到 FROM 子句
    const fromClauseMatch = sqlWithoutStrings.match(/\bFROM\s+([^;]+?)(?:\s+WHERE|\s+ORDER|\s+GROUP|\s+LIMIT|\s+HAVING|\s*$)/i);
    if (fromClauseMatch) {
        const fromClause = fromClauseMatch[1];
        // 分割逗號，但要排除 JOIN 部分
        const parts = fromClause.split(/\s+JOIN\s+/i)[0].split(',');
        parts.forEach(part => {
            // 取第一個單詞作為表名
            const tableMatch = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/);
            if (tableMatch) {
                usedTables.add(tableMatch[1].toLowerCase());
            }
        });
    }

    // 4c. 檢查所有表是否在白名單中（CTE 名稱除外）
    for (const table of usedTables) {
        // 跳過 CTE 名稱
        if (cteNames.has(table)) {
            continue;
        }
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
 * 生成讓 LLM 產生 SQL 的 prompt（優化版）
 * @param {string} userQuestion - 使用者問題
 * @param {Array} chatHistory - 歷史對話
 * @returns {string}
 */
function buildSQLGenerationPrompt(userQuestion, chatHistory = []) {
    // 精簡的歷史對話上下文
    let historyContext = '';
    if (chatHistory && chatHistory.length > 0) {
        historyContext = '\n\n## 最近對話\n';
        chatHistory.slice(-3).forEach((h) => {
            const shortResponse = h.response.substring(0, MAX_HISTORY_LENGTH);
            historyContext += `Q: ${h.message.substring(0, 50)}\nA: ${shortResponse}...\n`;
        });
    }

    return `你是專業的 PostgreSQL 資料庫助手。根據使用者問題生成精確的 SQL 查詢。

${SCHEMA_INFO}
${historyContext}

## 使用者問題
${userQuestion}

## 嚴格規則
1. 只回傳純 SQL 語句，不要任何解釋或 markdown
2. 若問題與資料庫無關，只回傳：NOT_A_DATA_QUERY
3. 一次只生成一個查詢，不用 UNION
4. 查詢單筆時，回傳完整欄位（system_tree_id, species_name, tree_height_m, dbh_cm, status, carbon_storage, project_location）
5. 統計查詢要用 COUNT, SUM, AVG 並用 ROUND 取小數點一位
6. 若使用者說「完整」「全部」，參考歷史對話條件，用 LIMIT 100
7. 文字比對用 ILIKE

直接回傳 SQL：`;
}

/**
 * 生成讓 LLM 解釋查詢結果的 prompt（以資料為主）
 * @param {string} userQuestion - 使用者原始問題
 * @param {string} sql - 執行的 SQL
 * @param {Array} results - 查詢結果
 * @param {number} totalCount - 結果總數
 * @param {Array} chatHistory - 歷史對話
 * @returns {string}
 */
function buildResultExplanationPrompt(userQuestion, sql, results, totalCount, chatHistory = []) {
    // 限制結果大小，避免 token 過多
    const displayResults = results.slice(0, 30);
    const hasMore = results.length > 30;

    // 精簡歷史
    let historyContext = '';
    if (chatHistory && chatHistory.length > 0) {
        historyContext = '\n\n【對話脈絡】\n';
        chatHistory.slice(-2).forEach((h) => {
            historyContext += `用戶問: ${h.message.substring(0, 40)}...\n`;
        });
    }

    // 根據結果數量調整指示
    let formatInstruction = '';
    if (totalCount === 0) {
        formatInstruction = `【無資料】明確告知「資料庫中沒有找到符合條件的資料」，建議其他查詢條件，不要編造資料。`;
    } else if (totalCount === 1) {
        formatInstruction = `【單筆資料】詳細列出所有重要欄位，用自然語言描述如「編號 ST-0001 是一棵榕樹，樹高 X 公尺...」`;
    } else if (totalCount <= 10) {
        formatInstruction = `【少量資料】逐筆列出重要資訊，用清單格式，最後做簡短總結。`;
    } else {
        formatInstruction = `【大量資料】先說「共查詢到 ${totalCount} 筆」，做統計摘要（最高/最低/平均），列出前 5-10 筆代表性資料。`;
    }

    return `你是樹木碳匯資料庫專業助理。根據【實際查詢結果】回答問題。

## 問題
${userQuestion}${historyContext}

## 查詢結果（共 ${totalCount} 筆${hasMore ? '，顯示前30筆' : ''}）
${JSON.stringify(displayResults, null, 2)}

## ${formatInstruction}

## 核心原則
1. 【資料優先】數字必須來自查詢結果，絕對不可編造
2. 【誠實回答】資料不足就說明
3. 【專業補充】可簡短補充樹種知識，但標明是「一般知識」
4. 【格式清晰】善用列表、數字
5. 【繁體中文】全程繁體中文`;
}

// ============================================
// 主要服務函數
// ============================================

/**
 * 執行安全的 SQL 查詢（支援自動重試）
 * @param {string} sql - 已驗證的 SQL 語句
 * @param {object} options - 選項
 * @param {function} options.retryWithLLM - 重試時用 LLM 修正 SQL 的回呼函數
 * @param {string} options.originalQuestion - 原始問題（用於重試）
 * @param {number} options.maxRetries - 最大重試次數（預設 1）
 * @returns {Promise<{ success: boolean, rows?: Array, rowCount?: number, error?: string, retried?: boolean }>}
 */
async function executeSecureQuery(sql, options = {}) {
    const { retryWithLLM, originalQuestion, maxRetries = 1 } = options;
    let lastError = null;
    let currentSQL = sql;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const validation = validateSQL(currentSQL);
            if (!validation.safe) {
                return { success: false, error: validation.reason };
            }

            console.log(`[SQLQueryService] 執行查詢${attempt > 0 ? ` (重試 #${attempt})` : ''}: ${validation.sanitizedSQL}`);
            
            const result = await db.query(validation.sanitizedSQL);
            
            console.log(`[SQLQueryService] 查詢成功，回傳 ${result.rowCount} 筆資料`);
            
            return {
                success: true,
                rows: result.rows,
                rowCount: result.rowCount,
                executedSQL: validation.sanitizedSQL,
                retried: attempt > 0
            };
        } catch (error) {
            lastError = error;
            console.error(`[SQLQueryService] 查詢執行錯誤${attempt > 0 ? ` (重試 #${attempt})` : ''}:`, error.message);
            
            // 如果還有重試機會，且有提供 LLM 修正函數
            if (attempt < maxRetries && retryWithLLM && originalQuestion) {
                console.log(`[SQLQueryService] 嘗試用 LLM 修正 SQL...`);
                try {
                    const fixedSQL = await retryWithLLM(originalQuestion, currentSQL, error.message);
                    if (fixedSQL && fixedSQL !== currentSQL) {
                        console.log(`[SQLQueryService] LLM 修正後的 SQL: ${fixedSQL}`);
                        currentSQL = fixedSQL;
                        continue; // 重試
                    }
                } catch (retryError) {
                    console.error('[SQLQueryService] LLM 修正失敗:', retryError.message);
                }
            }
        }
    }
    
    return { 
        success: false, 
        error: `資料庫查詢錯誤: ${lastError?.message || '未知錯誤'}` 
    };
}

/**
 * 判斷使用者問題是否需要查詢資料庫（優化版）
 * @param {string} question - 使用者問題
 * @param {Array} chatHistory - 歷史對話（可選）
 * @returns {boolean}
 */
function shouldQueryDatabase(question, chatHistory = []) {
    // 健壯性檢查：處理非字串輸入
    if (!question || typeof question !== 'string') {
        return false;
    }
    
    // 去除前後空白
    const cleanQuestion = question.trim();
    if (cleanQuestion.length === 0) {
        return false;
    }
    
    // 強資料查詢信號（幾乎一定要查資料庫）
    const strongDataSignals = [
        /ST-\d+/i,              // 樹木編號 ST-0001
        /PT-\d+/i,              // 專案編號
        /總共.*[幾多]/,          // 總共有幾/多少
        /有幾[棵顆株]/,          // 有幾棵
        /多少[棵顆株]/,          // 多少棵
        /列出/,                  // 列出（任何內容）
        /查詢.*資料/,            // 查詢資料
        /哪些.*樹/,              // 哪些樹
        /超過.*公分/,            // 超過 X 公分
        /大於.*公分/,
        /低於.*公分/,
        /小於.*公分/,
        /胸徑.*\d+/,             // 胸徑 + 數字
        /樹高.*\d+/,             // 樹高 + 數字
        /碳[儲存吸存]/,          // 碳儲存/碳吸存（查詢相關）
        /統計/,
        /平均/,
        /最[高大低小]/,          // 最高/最大/最低/最小
        /前\s*\d+/,              // 前10/前 10（TOP N 查詢）
        /排[名序]/,
        /完整.*筆/,              // 完整 68 筆
        /全部.*資料/,            // 全部資料
        /[港區位].*資料/,        // X港/區位 + 資料
        /資料.*[港區位]/,        // 資料 + X港/區位
        /給我.*樹/,              // 給我...樹
        /找.*樹/,                // 找...樹
        // 新增：口語化查詢
        /有沒有.*樹/,            // 有沒有大樹
        /樹[多少]不[多少]/,      // 樹多不多
        /除了.*還有/,            // 除了X還有什麼
        /資料庫.*[有裡的]/,      // 資料庫裡的
    ];

    // 【新增】跟隨上下文的資料查詢信號
    // 例如：「還有台北港的」「再來是興達港的」「高雄港呢」
    const contextFollowupPatterns = [
        /^還有/,                // 還有...
        /^再來/,                // 再來...
        /^接下來/,              // 接下來...
        /^那/,                  // 那...
        /的呢[？?]?$/,          // ...的呢？
        /呢[？?]?$/,            // ...呢？
    ];
    
    // 港口/區位名稱列表
    const locationKeywords = ['港', '區位', '專案', '計畫'];

    // 強知識問答信號
    const strongKnowledgeSignals = [
        /什麼是/,
        /為什麼/,
        /如何.*種植/,
        /怎麼.*照顧/,
        /適合.*環境/,
        /生長.*條件/,
        /特[性徵]是/,
        /好處.*壞處/,
        /優點.*缺點/,
        /介紹一下/,
        /說明.*原理/,
    ];

    // 檢查強資料信號
    for (const pattern of strongDataSignals) {
        if (pattern.test(question)) {
            return true;
        }
    }
    
    // 【新增】檢查跟隨上下文的查詢
    // 如果問題包含「還有/再來/那」+ 地點名稱，且上一輪是資料查詢，則繼續查資料
    const hasFollowupPattern = contextFollowupPatterns.some(p => p.test(question));
    const hasLocationKeyword = locationKeywords.some(k => question.includes(k));
    
    if (hasFollowupPattern && hasLocationKeyword) {
        // 這很可能是跟隨上下文的資料查詢
        console.log('[shouldQueryDatabase] 偵測到跟隨上下文的區位查詢');
        return true;
    }
    
    // 【新增】如果問題很短（< 15 字）且包含地點關鍵字，很可能是跟隨查詢
    if (question.length < 15 && hasLocationKeyword) {
        console.log('[shouldQueryDatabase] 偵測到簡短區位查詢');
        return true;
    }

    // 檢查強知識信號
    for (const pattern of strongKnowledgeSignals) {
        if (pattern.test(question)) {
            return false;
        }
    }

    // 弱資料關鍵字
    const weakDataKeywords = ['幾', '多少', '哪', '找', '查', '搜', '專案', '區域', '區位', '資料'];
    
    // 弱知識關鍵字  
    const weakKnowledgeKeywords = ['嗎', '呢', '適合', '建議', '應該', '可以'];

    let dataScore = 0;
    let knowledgeScore = 0;

    for (const kw of weakDataKeywords) {
        if (question.includes(kw)) dataScore++;
    }
    
    for (const kw of weakKnowledgeKeywords) {
        if (question.includes(kw)) knowledgeScore++;
    }

    // 資料分數較高則查資料庫
    if (dataScore > knowledgeScore) return true;
    if (knowledgeScore > dataScore) return false;

    // 預設：不查資料庫（讓 LLM 回答一般知識）
    return false;
}

/**
 * 取得歷史對話查詢 SQL（統一管理參數）
 * @param {string} userId - 使用者 ID
 * @returns {{ text: string, values: Array }}
 */
function getHistoryQuerySQL(userId) {
    return {
        text: `
            SELECT message, response 
            FROM chat_logs 
            WHERE user_id = $1 
            AND created_at > NOW() - INTERVAL '${HISTORY_WINDOW_MINUTES} minutes'
            ORDER BY created_at DESC 
            LIMIT $2
        `,
        values: [userId, MAX_HISTORY_COUNT]
    };
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
    getHistoryQuerySQL,
    SCHEMA_INFO,
    ALLOWED_TABLES,
    MAX_LIMIT,
    DEFAULT_LIMIT,
    MAX_HISTORY_COUNT,
    HISTORY_WINDOW_MINUTES
};
