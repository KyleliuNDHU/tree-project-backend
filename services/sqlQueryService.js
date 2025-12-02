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
const MAX_LIMIT = 100;          // 一般 API 回應限制
const DEFAULT_LIMIT = 50;
const EXPORT_MAX_LIMIT = 10000; // Excel 匯出最大限制（防止記憶體爆掉）

// 歷史對話限制（平衡記憶體和使用體驗）
const MAX_HISTORY_COUNT = 10;     // 最多載入 10 筆歷史
const MAX_HISTORY_LENGTH = 100;   // 每筆歷史最多 100 字元
const HISTORY_WINDOW_MINUTES = 15; // 只載入 15 分鐘內的對話

// ============================================
// Schema 資訊（給 LLM 參考）- 詳細版本
// ============================================

const SCHEMA_INFO = `
## 資料庫結構

### 1. tree_survey (樹木調查主表) - 主要查詢目標
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
| project_location | TEXT | 專案區位 | 高雄港、花蓮港、台北港、興達港、布袋港 |
| project_name | TEXT | 專案名稱 | 港區植栽4區 |
| project_code | TEXT | 專案代碼 | 6, 7 |
| x_coord | NUMERIC | X 坐標 (經度) | 120.28626 |
| y_coord | NUMERIC | Y 坐標 (緯度) | 22.617992 |
| notes | TEXT | 備註 | 無、需修剪 |
| survey_time | TIMESTAMP | 調查時間 | 2022-11-21 |

⚠️ 【關鍵】system_tree_id 和 project_tree_id 都是【純數字字串】！
- 正確用法: WHERE system_tree_id = '7'
- 錯誤用法: WHERE system_tree_id = 'ST-0001' ← 這是錯的！

### 2. tree_species (樹種資料表)
- id, name (中文名), scientific_name (學名)

### 3. tree_carbon_data (樹種碳匯參數)
- common_name_zh (中文名), carbon_absorption_min/max (碳吸收範圍), growth_rate (生長速率), carbon_efficiency (碳效率)

## Few-Shot 範例 (Q→SQL)

Q: 高雄港有幾棵樹？
SQL: SELECT COUNT(*) as total FROM tree_survey WHERE project_location ILIKE '%高雄港%' LIMIT 50

Q: 列出所有榕樹
SQL: SELECT system_tree_id, species_name, tree_height_m, dbh_cm, carbon_storage, project_location FROM tree_survey WHERE species_name ILIKE '%榕樹%' LIMIT 50

Q: 胸徑最大的前10棵樹
SQL: SELECT system_tree_id, species_name, dbh_cm, tree_height_m, carbon_storage, project_location FROM tree_survey ORDER BY dbh_cm DESC NULLS LAST LIMIT 10

Q: 花蓮港有哪些樹種？
SQL: SELECT species_name, COUNT(*) as count FROM tree_survey WHERE project_location ILIKE '%花蓮港%' GROUP BY species_name ORDER BY count DESC LIMIT 50

Q: 編號7的樹
SQL: SELECT system_tree_id, species_name, tree_height_m, dbh_cm, status, carbon_storage, carbon_sequestration_per_year, project_location, notes FROM tree_survey WHERE system_tree_id = '7' LIMIT 1

Q: 碳儲存量最高的5棵樹是什麼？
SQL: SELECT system_tree_id, species_name, carbon_storage, carbon_sequestration_per_year, dbh_cm, tree_height_m, project_location FROM tree_survey WHERE carbon_storage IS NOT NULL ORDER BY carbon_storage DESC LIMIT 5

Q: 統計各區位的樹木數量
SQL: SELECT project_location, COUNT(*) as tree_count, ROUND(AVG(dbh_cm)::numeric, 1) as avg_dbh, ROUND(SUM(carbon_storage)::numeric, 1) as total_carbon FROM tree_survey GROUP BY project_location ORDER BY tree_count DESC LIMIT 50

Q: 找出胸徑超過50公分的大樹
SQL: SELECT system_tree_id, species_name, dbh_cm, tree_height_m, carbon_storage, project_location FROM tree_survey WHERE dbh_cm > 50 ORDER BY dbh_cm DESC LIMIT 50

Q: 2022年調查的樹木
SQL: SELECT system_tree_id, species_name, survey_time, project_location FROM tree_survey WHERE EXTRACT(YEAR FROM survey_time) = 2022 LIMIT 50
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
        historyContext = '\n\n## 對話歷史（參考上下文）\n';
        chatHistory.slice(-3).forEach((h) => {
            const shortResponse = h.response.substring(0, MAX_HISTORY_LENGTH);
            historyContext += `用戶: ${h.message.substring(0, 50)}\nAI: ${shortResponse}...\n`;
        });
    }

    // 智能預處理：識別用戶提到的編號
    let treeIdHint = '';
    const treeIdPatterns = [
        { regex: /(?:編號|樹木|第)\s*(\d+)\s*(?:號|棵)?/g, field: 'system_tree_id' },
        { regex: /ST[.-]?(\d+)/gi, field: 'system_tree_id' },
        { regex: /PT[.-]?(\d+)/gi, field: 'project_tree_id' },
        { regex: /^(\d+)號?$/g, field: 'system_tree_id' },
    ];
    
    for (const pattern of treeIdPatterns) {
        const match = pattern.regex.exec(userQuestion);
        if (match) {
            treeIdHint = `\n【偵測到樹木編號】用戶可能在查詢 ${pattern.field} = '${match[1]}'，請用此編號進行查詢。`;
            break;
        }
    }

    return `你是專業的 PostgreSQL 資料庫助手。分析用戶問題，生成精確的 SQL 查詢。

${SCHEMA_INFO}
${historyContext}${treeIdHint}

## 當前問題
${userQuestion}

## 輸出規則
1. 只輸出純 SQL 語句，不要任何解釋、Markdown 或程式碼區塊
2. 若問題與樹木資料庫無關，只輸出：NOT_A_DATA_QUERY
3. 查詢樹木詳情時，包含重要欄位：system_tree_id, species_name, tree_height_m, dbh_cm, status, carbon_storage, project_location
4. 統計類查詢用 COUNT, SUM, AVG, ROUND(..., 1)
5. 文字比對用 ILIKE '%關鍵字%'
6. 排序時用 NULLS LAST 避免 NULL 值干擾
7. 結尾一定要有 LIMIT（預設 50，用戶要求「全部」則用 100）

直接輸出 SQL（不要任何前綴）：`;
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

    // 根據結果數量和類型調整指示
    let formatInstruction = '';
    
    // 偵測查詢類型
    const isCountQuery = results.length === 1 && ('count' in results[0] || 'total' in results[0]);
    const isGroupQuery = results.length > 1 && results[0] && ('count' in results[0] || 'tree_count' in results[0]);
    const isSingleTree = totalCount === 1 && results[0] && 'system_tree_id' in results[0];
    
    if (totalCount === 0) {
        formatInstruction = `【無資料】
- 明確告知「資料庫中沒有找到符合條件的資料」
- 分析可能原因（如：區位名稱拼錯、條件太嚴格）
- 建議替代查詢方式
- 絕對不要編造資料`;
    } else if (isCountQuery) {
        formatInstruction = `【統計結果】
- 直接回答數量，例如「高雄港共有 XX 棵樹」
- 可簡短補充相關資訊`;
    } else if (isGroupQuery) {
        formatInstruction = `【分組統計】
- 用表格或清單呈現各分組的統計數據
- 標出最多/最少的項目
- 最後做簡短總結`;
    } else if (isSingleTree) {
        formatInstruction = `【單筆樹木資料】
- 用自然語言描述：「編號 ${results[0].system_tree_id} 是一棵${results[0].species_name || '樹木'}」
- 列出所有重要指標：樹高、胸徑、碳儲存量、健康狀況
- 可補充該樹種的一般知識`;
    } else if (totalCount <= 10) {
        formatInstruction = `【少量資料 ${totalCount} 筆】
- 用清單格式逐筆列出（編號、樹種、關鍵數值）
- 最後做簡短總結`;
    } else {
        formatInstruction = `【大量資料 ${totalCount} 筆】
- 先說明「共查詢到 ${totalCount} 筆資料」
- 做統計摘要：最大值/最小值/平均值
- 列出前 5~10 筆代表性資料
- 提醒用戶可下載 Excel 查看完整資料`;
    }

    return `你是樹木碳匯資料庫專業助理。嚴格根據【查詢結果】回答。

## 用戶問題
${userQuestion}${historyContext}

## 資料庫查詢結果（共 ${totalCount} 筆${hasMore ? '，以下顯示前30筆' : ''}）
\`\`\`json
${JSON.stringify(displayResults, null, 2)}
\`\`\`

## 回答指引
${formatInstruction}

## 核心原則
1. 📊【資料為本】所有數字必須來自上方查詢結果，絕對禁止編造
2. 💡【誠實透明】資料不足就如實說明
3. 🌳【專業補充】可補充樹種相關知識，但要標明「一般知識」
4. 📝【格式清晰】善用 Markdown 格式（清單、粗體、表格）
5. 🇹🇼【繁體中文】全程使用繁體中文

請回答：`;
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
 * 驗證 SQL 查詢（匯出版 - 使用較高的 LIMIT 上限）
 * @param {string} sql - 要驗證的 SQL 語句
 * @returns {{ safe: boolean, sanitizedSQL?: string, reason?: string }}
 */
function validateSQLForExport(sql) {
    // 重用基本驗證邏輯，但修改 LIMIT 處理
    const trimmedSQL = sql.trim();
    const upperSQL = trimmedSQL.toUpperCase();

    // 基本安全檢查（與 validateSQL 相同）
    if (!upperSQL.startsWith('SELECT')) {
        return { safe: false, reason: '只允許 SELECT 查詢' };
    }

    for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(trimmedSQL)) {
            return { safe: false, reason: `SQL 包含不允許的操作: ${pattern}` };
        }
    }

    // 去除字串常數後檢查表格
    const sqlWithoutStrings = trimmedSQL.replace(/'[^']*'/g, "''");
    
    // 識別 CTE 名稱
    const cteNames = new Set();
    const cteRegex = /\bWITH\s+(\w+)\s+AS\s*\(/gi;
    let match;
    while ((match = cteRegex.exec(sqlWithoutStrings)) !== null) {
        cteNames.add(match[1].toLowerCase());
    }
    
    // 提取表名
    const usedTables = new Set();
    const fromRegex = /\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((match = fromRegex.exec(sqlWithoutStrings)) !== null) {
        usedTables.add(match[1].toLowerCase());
    }
    const joinRegex = /\bJOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((match = joinRegex.exec(sqlWithoutStrings)) !== null) {
        usedTables.add(match[1].toLowerCase());
    }

    // 檢查表格白名單
    for (const table of usedTables) {
        if (cteNames.has(table)) continue;
        if (!ALLOWED_TABLES.includes(table)) {
            return { safe: false, reason: `不允許查詢表格: ${table}` };
        }
    }

    // 匯出版：使用 EXPORT_MAX_LIMIT（不是 MAX_LIMIT）
    let sanitizedSQL = trimmedSQL;
    if (!upperSQL.includes('LIMIT')) {
        sanitizedSQL = sanitizedSQL.replace(/;*$/, '');
        sanitizedSQL += ` LIMIT ${EXPORT_MAX_LIMIT}`;
    } else {
        const limitMatch = upperSQL.match(/LIMIT\s+(\d+)/);
        if (limitMatch) {
            const limitValue = parseInt(limitMatch[1], 10);
            if (limitValue > EXPORT_MAX_LIMIT) {
                sanitizedSQL = trimmedSQL.replace(/LIMIT\s+\d+/i, `LIMIT ${EXPORT_MAX_LIMIT}`);
            }
        }
    }

    sanitizedSQL = sanitizedSQL.replace(/;*$/, '');
    return { safe: true, sanitizedSQL };
}

/**
 * 執行安全的 SQL 查詢（匯出專用 - 無一般限制）
 * @param {string} sql - SQL 語句（會套用匯出專用的 LIMIT）
 * @returns {Promise<{ success: boolean, rows?: Array, rowCount?: number, error?: string }>}
 */
async function executeSecureQueryForExport(sql) {
    try {
        const validation = validateSQLForExport(sql);
        if (!validation.safe) {
            return { success: false, error: validation.reason };
        }

        console.log(`[SQLQueryService-Export] 執行匯出查詢: ${validation.sanitizedSQL}`);
        
        const result = await db.query(validation.sanitizedSQL);
        
        console.log(`[SQLQueryService-Export] 匯出查詢成功，回傳 ${result.rowCount} 筆資料`);
        
        return {
            success: true,
            rows: result.rows,
            rowCount: result.rowCount,
            executedSQL: validation.sanitizedSQL
        };
    } catch (error) {
        console.error('[SQLQueryService-Export] 查詢執行錯誤:', error.message);
        return { 
            success: false, 
            error: `資料庫查詢錯誤: ${error.message}` 
        };
    }
}

/**
 * 判斷使用者問題是否需要查詢資料庫（V2 增強版）
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
    
    // ========================================
    // 1. 絕對資料查詢信號（直接返回 true）
    // ========================================
    const absoluteDataSignals = [
        // 樹木編號相關
        /編號\s*\d+/i,           // 編號 7, 編號123
        /第\s*\d+\s*[號棵株]/,   // 第7號, 第7棵
        /^\d+號?$/,              // 純數字 "7" 或 "7號"
        /ST[.-]?\d+/i,           // ST-0001, ST0001
        /PT[.-]?\d+/i,           // PT-001
        
        // 數量查詢
        /[有總共].*[幾多少][棵顆株筆]/,  // 有幾棵, 總共多少筆
        /[幾多少][棵顆株筆].*樹/,        // 幾棵樹
        /數量[是有]/,                     // 數量是, 數量有
        
        // 列表/搜尋
        /^列出/,                  // 列出（開頭）
        /找[出到].*樹/,           // 找出/找到...樹
        /搜尋/,
        /查詢.*資料/,
        /查[看一]下/,             // 查看, 查一下
        
        // 條件篩選（含數值）
        /胸徑.{0,5}\d+/,         // 胸徑 > 50, 胸徑50
        /樹高.{0,5}\d+/,         // 樹高 > 10, 樹高10
        /[超大低小於過].*\d+\s*(公分|cm|公尺|m)/i,  // 超過50公分
        /\d+\s*(公分|cm|公尺|m)[以之]?[上下內]/i,  // 50公分以上
        
        // 統計類
        /^統計/,                 // 統計（開頭）
        /平均[值是有]/,          // 平均值, 平均是
        /總[和量計]/,            // 總和, 總量, 總計
        /最[高大低小矮].{0,3}[的是]/,  // 最高的, 最大是
        /前\s*\d+\s*[名筆棵]/,   // 前10名, 前5筆
        /排[名行序]/,            // 排名, 排行
        
        // 區位資料查詢
        /(高雄|花蓮|台北|台中|基隆|興達|布袋|安平|蘇澳)[港].*[有幾多少資料樹]/,
        /[有幾多少資料樹].*(高雄|花蓮|台北|台中|基隆|興達|布袋|安平|蘇澳)[港]/,
        
        // 比較查詢
        /比較.*和.*的/,          // 比較A和B的
        /[跟與和].*比/,          // 跟X比
    ];

    for (const pattern of absoluteDataSignals) {
        if (pattern.test(cleanQuestion)) {
            console.log(`[shouldQueryDatabase] 絕對資料信號匹配: ${pattern}`);
            return true;
        }
    }

    // ========================================
    // 2. 絕對知識問答信號（直接返回 false）
    // ========================================
    const absoluteKnowledgeSignals = [
        /^什麼是/,               // 什麼是碳匯
        /^為什麼/,               // 為什麼要種樹
        /^如何.*種植/,           // 如何種植
        /^怎麼.*[種照養護]/,     // 怎麼種/照顧/養護
        /適合.*[什哪]麼.*環境/,  // 適合什麼環境
        /生長.*條件/,
        /特[性徵點]是什麼/,      // 特性是什麼
        /有什麼.*[好優]處/,      // 有什麼好處/優處
        /^介紹/,                 // 介紹一下
        /^說明/,                 // 說明一下
        /^解釋/,                 // 解釋一下
        /原理是/,
        /定義是/,
        /怎樣才能/,
        /如何計算/,
        /公式是/,
    ];

    for (const pattern of absoluteKnowledgeSignals) {
        if (pattern.test(cleanQuestion)) {
            console.log(`[shouldQueryDatabase] 絕對知識信號匹配: ${pattern}`);
            return false;
        }
    }

    // ========================================
    // 3. 上下文跟隨查詢（短問題 + 地點）
    // ========================================
    const contextFollowupPatterns = [
        /^還有/,                // 還有...
        /^再來/,                // 再來...
        /^接下來/,              // 接下來...
        /^那/,                  // 那...
        /^換/,                  // 換...
        /的呢[？?]?$/,          // ...的呢？
        /呢[？?]?$/,            // ...呢？
    ];
    
    const locationPatterns = [
        /[港區位專案計畫]/,
        /(高雄|花蓮|台北|台中|基隆|興達|布袋|安平|蘇澳)/
    ];

    const hasFollowup = contextFollowupPatterns.some(p => p.test(cleanQuestion));
    const hasLocation = locationPatterns.some(p => p.test(cleanQuestion));
    
    if (hasFollowup && hasLocation) {
        console.log('[shouldQueryDatabase] 上下文跟隨查詢');
        return true;
    }
    
    // 短問題（< 12 字）且包含地點，很可能是跟隨查詢
    if (cleanQuestion.length < 12 && hasLocation) {
        console.log('[shouldQueryDatabase] 簡短地點查詢');
        return true;
    }

    // ========================================
    // 4. 計分制（弱信號綜合判斷）
    // ========================================
    const weakDataKeywords = [
        { word: '幾', score: 2 },
        { word: '多少', score: 2 },
        { word: '哪', score: 1.5 },
        { word: '找', score: 1.5 },
        { word: '查', score: 1.5 },
        { word: '搜', score: 1.5 },
        { word: '專案', score: 1 },
        { word: '區域', score: 1 },
        { word: '區位', score: 1 },
        { word: '資料', score: 1 },
        { word: '筆', score: 1.5 },
        { word: '棵', score: 1.5 },
        { word: '株', score: 1.5 },
        { word: '樹', score: 0.5 },
    ];
    
    const weakKnowledgeKeywords = [
        { word: '嗎', score: 1 },
        { word: '適合', score: 2 },
        { word: '建議', score: 2 },
        { word: '應該', score: 1.5 },
        { word: '可以', score: 1 },
        { word: '好不好', score: 1.5 },
        { word: '會不會', score: 1.5 },
        { word: '能不能', score: 1 },
    ];

    let dataScore = 0;
    let knowledgeScore = 0;

    for (const { word, score } of weakDataKeywords) {
        if (cleanQuestion.includes(word)) dataScore += score;
    }
    
    for (const { word, score } of weakKnowledgeKeywords) {
        if (cleanQuestion.includes(word)) knowledgeScore += score;
    }

    console.log(`[shouldQueryDatabase] 計分結果: data=${dataScore.toFixed(1)}, knowledge=${knowledgeScore.toFixed(1)}`);

    // 資料分數較高則查資料庫（需明顯高出）
    if (dataScore >= knowledgeScore + 1) return true;
    if (knowledgeScore >= dataScore + 1) return false;

    // 預設：不查資料庫（讓 LLM 回答一般知識）
    return false;
}

/**
 * 取得歷史對話查詢 SQL（統一管理參數）
 * @param {string} userId - 使用者 ID
 * @param {string} sessionId - (可選) 對話會話 ID，用於取得特定會話的歷史
 * @returns {{ text: string, values: Array }}
 */
function getHistoryQuerySQL(userId, sessionId = null) {
    // 如果提供了 sessionId，只取該會話的歷史
    if (sessionId) {
        return {
            text: `
                SELECT message, response 
                FROM chat_logs 
                WHERE user_id = $1 
                AND session_id = $2
                AND created_at > NOW() - INTERVAL '${HISTORY_WINDOW_MINUTES} minutes'
                ORDER BY created_at DESC 
                LIMIT $3
            `,
            values: [userId, sessionId, MAX_HISTORY_COUNT]
        };
    }
    
    // 否則取該用戶最近的所有對話
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
    validateSQLForExport,
    executeSecureQuery,
    executeSecureQueryForExport,
    buildSQLGenerationPrompt,
    buildResultExplanationPrompt,
    shouldQueryDatabase,
    getHistoryQuerySQL,
    SCHEMA_INFO,
    ALLOWED_TABLES,
    MAX_LIMIT,
    DEFAULT_LIMIT,
    EXPORT_MAX_LIMIT,
    MAX_HISTORY_COUNT,
    HISTORY_WINDOW_MINUTES
};
