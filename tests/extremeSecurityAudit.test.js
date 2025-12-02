/**
 * 極端安全審計測試 - Extreme Security Audit Test
 * 
 * 2025.12 更新：最新的 SQL 注入攻擊向量
 * 包含 2024-2025 年 CTF 競賽中出現的新型攻擊
 * 
 * 執行方式: node tests/extremeSecurityAudit.test.js
 */

const { validateSQL, shouldQueryDatabase } = require('../services/sqlQueryService');

console.log('='.repeat(70));
console.log('極端 SQL 注入安全審計測試 (2025 最新攻擊向量)');
console.log('='.repeat(70));

// ============================================
// 2025 最新攻擊向量
// ============================================

const extremeAttackVectors = {
    // ----- 1. 二次編碼攻擊 -----
    '二次編碼攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE x = '%27%20OR%20%271%27%3D%271'", shouldBlock: true, desc: 'URL 編碼 OR 1=1' },
        { sql: "SELECT * FROM tree_survey WHERE x = '\\x27\\x20OR\\x20\\x271\\x27=\\x271'", shouldBlock: true, desc: '十六進位編碼' },
        { sql: "SELECT * FROM tree_survey WHERE x = CONVERT_FROM(DECODE('VU5JT04=', 'base64'), 'UTF8')", shouldBlock: true, desc: 'Base64 解碼攻擊' },
    ],

    // ----- 2. JSON/JSONB 注入 -----
    'JSON 注入攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE data::jsonb->>'key' = 'value'; DROP TABLE users--'", shouldBlock: true, desc: 'JSONB 注入 DROP' },
        { sql: "SELECT * FROM tree_survey WHERE data::jsonb @> '{\"admin\": true}'", shouldBlock: false, desc: 'JSONB 正常查詢' },
        { sql: "SELECT jsonb_each(data) FROM tree_survey WHERE id = 1; DELETE FROM users", shouldBlock: true, desc: 'JSONB 函數 + 堆疊' },
    ],

    // ----- 3. CTE (WITH) 濫用攻擊 -----
    'CTE 濫用攻擊': [
        { sql: "WITH RECURSIVE x AS (SELECT 1 UNION ALL SELECT x+1 FROM x) SELECT * FROM x", shouldBlock: true, desc: '無限遞迴 CTE (DoS)' },
        { sql: "WITH evil AS (SELECT * FROM users) SELECT * FROM evil", shouldBlock: true, desc: 'CTE 讀取 users' },
        { sql: "WITH data AS (SELECT * FROM tree_survey LIMIT 10) SELECT * FROM data", shouldBlock: false, desc: 'CTE 白名單表' },
        { sql: "WITH del AS (DELETE FROM users RETURNING *) SELECT * FROM del", shouldBlock: true, desc: 'CTE DELETE RETURNING' },
    ],

    // ----- 4. RETURNING 濫用 -----
    'RETURNING 濫用': [
        { sql: "INSERT INTO tree_survey (notes) VALUES ('test') RETURNING *", shouldBlock: true, desc: 'INSERT RETURNING' },
        { sql: "UPDATE tree_survey SET notes = 'x' WHERE id=1 RETURNING *", shouldBlock: true, desc: 'UPDATE RETURNING' },
        { sql: "DELETE FROM tree_survey WHERE id=1 RETURNING *", shouldBlock: true, desc: 'DELETE RETURNING' },
    ],

    // ----- 5. 視窗函數濫用 -----
    '視窗函數攻擊': [
        { sql: "SELECT *, ROW_NUMBER() OVER() FROM tree_survey, users", shouldBlock: true, desc: '視窗函數 + 交叉 JOIN' },
        { sql: "SELECT *, LAG(password) OVER() FROM users", shouldBlock: true, desc: 'LAG 讀密碼' },
        { sql: "SELECT species_name, ROW_NUMBER() OVER(ORDER BY dbh_cm) FROM tree_survey LIMIT 10", shouldBlock: false, desc: '正常視窗函數' },
    ],

    // ----- 6. 陣列操作攻擊 -----
    '陣列操作攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE id = ANY(ARRAY(SELECT id FROM users))", shouldBlock: true, desc: 'ARRAY 子查詢 users' },
        { sql: "SELECT ARRAY_AGG(password) FROM users", shouldBlock: true, desc: 'ARRAY_AGG 密碼' },
        { sql: "SELECT * FROM tree_survey WHERE id = ANY(ARRAY[1,2,3])", shouldBlock: false, desc: '正常 ARRAY 查詢' },
    ],

    // ----- 7. 位置參數繞過 -----
    '位置參數攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE $1 = 'admin'", shouldBlock: false, desc: '位置參數 (無害)' },
        { sql: "PREPARE stmt AS SELECT * FROM users; EXECUTE stmt", shouldBlock: true, desc: 'PREPARE + EXECUTE' },
        { sql: "EXECUTE 'SELECT * FROM ' || 'us' || 'ers'", shouldBlock: true, desc: '動態 EXECUTE' },
    ],

    // ----- 8. 時間盲注進階 -----
    '時間盲注進階': [
        { sql: "SELECT * FROM tree_survey WHERE CASE WHEN (SELECT 1 FROM users LIMIT 1)='1' THEN pg_sleep(5) ELSE 1 END", shouldBlock: true, desc: '條件時間盲注' },
        { sql: "SELECT * FROM tree_survey WHERE (SELECT pg_sleep(5) FROM users)::text = ''", shouldBlock: true, desc: '子查詢時間盲注' },
        { sql: "SELECT * FROM tree_survey; SELECT pg_sleep(5)", shouldBlock: true, desc: '堆疊時間盲注' },
        { sql: "SELECT * FROM tree_survey WHERE id = 1 AND pg_sleep(0)::text = ''", shouldBlock: true, desc: 'pg_sleep 在 AND' },
    ],

    // ----- 9. 權限提升攻擊 -----
    '權限提升': [
        { sql: "SET ROLE postgres", shouldBlock: true, desc: 'SET ROLE 提權' },
        { sql: "ALTER USER current_user WITH SUPERUSER", shouldBlock: true, desc: 'ALTER USER 提權' },
        { sql: "GRANT ALL ON ALL TABLES TO current_user", shouldBlock: true, desc: 'GRANT 提權' },
        { sql: "SELECT * FROM pg_authid", shouldBlock: true, desc: '讀取 pg_authid' },
    ],

    // ----- 10. 檔案系統攻擊 -----
    '檔案系統攻擊': [
        { sql: "COPY (SELECT * FROM users) TO '/tmp/users.txt'", shouldBlock: true, desc: 'COPY TO 檔案' },
        { sql: "COPY users FROM '/etc/passwd'", shouldBlock: true, desc: 'COPY FROM 檔案' },
        { sql: "SELECT pg_read_file('/etc/passwd')", shouldBlock: true, desc: 'pg_read_file' },
        { sql: "SELECT lo_import('/etc/passwd')", shouldBlock: true, desc: 'lo_import' },
        { sql: "SELECT lo_export(16389, '/tmp/data')", shouldBlock: true, desc: 'lo_export' },
    ],

    // ----- 11. 外部連線攻擊 -----
    '外部連線攻擊': [
        { sql: "SELECT * FROM dblink('host=evil.com', 'SELECT 1')", shouldBlock: true, desc: 'dblink 外連' },
        { sql: "SELECT * FROM dblink_connect('evil', 'host=evil.com')", shouldBlock: true, desc: 'dblink_connect' },
        { sql: "CREATE EXTENSION IF NOT EXISTS dblink", shouldBlock: true, desc: 'CREATE EXTENSION' },
        { sql: "SELECT inet_client_addr()", shouldBlock: false, desc: 'inet_client_addr (低風險)' },
    ],

    // ----- 12. 觸發器/規則攻擊 -----
    '觸發器規則攻擊': [
        { sql: "CREATE TRIGGER evil BEFORE INSERT ON tree_survey EXECUTE FUNCTION evil()", shouldBlock: true, desc: 'CREATE TRIGGER' },
        { sql: "CREATE RULE evil AS ON INSERT TO tree_survey DO ALSO DELETE FROM users", shouldBlock: true, desc: 'CREATE RULE' },
        { sql: "DROP TRIGGER IF EXISTS x ON tree_survey", shouldBlock: true, desc: 'DROP TRIGGER' },
    ],

    // ----- 13. PL/pgSQL 注入 -----
    'PL/pgSQL 注入': [
        { sql: "DO $$ BEGIN PERFORM pg_sleep(10); END $$", shouldBlock: true, desc: 'DO 區塊' },
        { sql: "DO $$ DECLARE r RECORD; BEGIN FOR r IN SELECT * FROM users LOOP RAISE NOTICE '%', r; END LOOP; END $$", shouldBlock: true, desc: 'DO 讀取資料' },
        { sql: "CREATE FUNCTION evil() RETURNS void AS $$ DELETE FROM users; $$ LANGUAGE SQL", shouldBlock: true, desc: 'CREATE FUNCTION' },
    ],

    // ----- 14. 錯誤訊息洩漏 -----
    '錯誤訊息攻擊': [
        { sql: "SELECT 1/0", shouldBlock: false, desc: '除零錯誤 (無害)' },
        { sql: "SELECT CAST('abc' AS INTEGER)", shouldBlock: false, desc: '型別轉換錯誤 (無害)' },
        { sql: "SELECT * FROM nonexistent_table", shouldBlock: true, desc: '非白名單表' },
        { sql: "SELECT * FROM tree_survey WHERE id = 'abc'::integer", shouldBlock: false, desc: '強制轉換 (會失敗但無害)' },
    ],

    // ----- 15. Unicode/編碼攻擊 -----
    'Unicode 攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE notes = U&'\\0027 OR 1=1--'", shouldBlock: true, desc: 'Unicode 單引號' },
        { sql: "SELECT * FROM tree_survey WHERE notes = E'\\047 OR 1=1--'", shouldBlock: true, desc: '八進位單引號' },
        { sql: "SELECT * FROM tree_survey WHERE notes LIKE '%' || CHR(0) || '%'", shouldBlock: true, desc: 'NULL 字元注入' },
        { sql: "SELECT * FROM tree_survey WHERE notes = '正常中文'", shouldBlock: false, desc: '正常中文 (無害)' },
    ],

    // ----- 16. 批次/多語句攻擊 -----
    '批次攻擊': [
        { sql: "SELECT 1; SELECT 2; SELECT 3", shouldBlock: true, desc: '多 SELECT 堆疊' },
        { sql: "SELECT * FROM tree_survey;\nSELECT * FROM users", shouldBlock: true, desc: '換行堆疊' },
        { sql: "SELECT * FROM tree_survey;/**/SELECT * FROM users", shouldBlock: true, desc: '註解堆疊' },
        { sql: "BEGIN; DELETE FROM users; COMMIT", shouldBlock: true, desc: '事務攻擊' },
        { sql: "SAVEPOINT x; DELETE FROM users; ROLLBACK TO x", shouldBlock: true, desc: 'SAVEPOINT 攻擊' },
    ],

    // ----- 17. 特殊空白字元 -----
    '特殊空白字元': [
        { sql: "SELECT\u00A0*\u00A0FROM\u00A0tree_survey", shouldBlock: false, desc: 'NBSP 空格 (應允許)' },
        { sql: "SELECT\u2003*\u2003FROM\u2003tree_survey", shouldBlock: false, desc: 'Em 空格 (應允許)' },
        { sql: "SELECT\t\n\r*\t\n\rFROM\t\n\rtree_survey", shouldBlock: false, desc: '混合空白 (應允許)' },
        { sql: "SELECT\u0000*\u0000FROM\u0000tree_survey", shouldBlock: true, desc: 'NULL 字元 (應阻擋)' },
    ],

    // ----- 18. 長度限制繞過 -----
    '長度限制攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE notes = '" + "A".repeat(5000) + "'", shouldBlock: true, desc: '超長字串值' },
        { sql: "SELECT " + "species_name, ".repeat(200) + "id FROM tree_survey", shouldBlock: true, desc: '過多欄位' },
        { sql: "SELECT * FROM tree_survey WHERE " + "(id > 0) AND ".repeat(50) + "(id > 0)", shouldBlock: true, desc: '過多條件' },
    ],

    // ----- 19. 正常複雜查詢 (不應阻擋) -----
    '正常複雜查詢': [
        { 
            sql: `SELECT 
                    project_location,
                    species_name,
                    COUNT(*) as count,
                    ROUND(AVG(dbh_cm)::numeric, 2) as avg_dbh,
                    ROUND(AVG(tree_height_m)::numeric, 2) as avg_height,
                    ROUND(SUM(carbon_storage)::numeric, 2) as total_carbon
                  FROM tree_survey 
                  WHERE project_location IS NOT NULL
                  GROUP BY project_location, species_name
                  HAVING COUNT(*) > 3
                  ORDER BY total_carbon DESC NULLS LAST
                  LIMIT 50`, 
            shouldBlock: false, 
            desc: '多層統計查詢' 
        },
        {
            sql: `SELECT t.*, 
                    CASE 
                        WHEN dbh_cm < 20 THEN '小型'
                        WHEN dbh_cm < 50 THEN '中型'
                        ELSE '大型'
                    END as size_category
                  FROM tree_survey t
                  WHERE t.species_name ILIKE '%榕%'
                  ORDER BY t.carbon_storage DESC
                  LIMIT 20`,
            shouldBlock: false,
            desc: 'CASE WHEN 分類'
        },
        {
            sql: `WITH ranked AS (
                    SELECT *,
                           RANK() OVER (PARTITION BY project_location ORDER BY carbon_storage DESC) as rank
                    FROM tree_survey
                    WHERE carbon_storage IS NOT NULL
                  )
                  SELECT * FROM ranked WHERE rank <= 5`,
            shouldBlock: false,
            desc: 'CTE + 視窗函數排名'
        },
    ],
};

// ============================================
// 執行測試
// ============================================

let totalPassed = 0;
let totalFailed = 0;
const failures = [];
const criticalFailures = [];

const criticalCategories = [
    '權限提升', '檔案系統攻擊', '外部連線攻擊', 
    '觸發器規則攻擊', 'PL/pgSQL 注入', 'RETURNING 濫用',
    'CTE 濫用攻擊'
];

Object.entries(extremeAttackVectors).forEach(([category, tests]) => {
    console.log(`\n📋 ${category}\n`);
    let categoryPassed = 0;
    let categoryFailed = 0;
    
    tests.forEach((test, i) => {
        const result = validateSQL(test.sql);
        const passed = result.safe === !test.shouldBlock;
        
        if (passed) {
            totalPassed++;
            categoryPassed++;
            const action = test.shouldBlock ? '阻擋' : '允許';
            console.log(`  ✅ ${action}: ${test.desc}`);
        } else {
            totalFailed++;
            categoryFailed++;
            const expected = test.shouldBlock ? '阻擋' : '允許';
            const actual = result.safe ? '允許' : '阻擋';
            console.log(`  ❌ 期望${expected}, 實際${actual}: ${test.desc}`);
            console.log(`     SQL: ${test.sql.substring(0, 100)}${test.sql.length > 100 ? '...' : ''}`);
            if (result.reason) console.log(`     原因: ${result.reason}`);
            
            const failureInfo = { category, test, result };
            failures.push(failureInfo);
            
            if (criticalCategories.includes(category) && test.shouldBlock) {
                criticalFailures.push(failureInfo);
            }
        }
    });
    
    console.log(`\n  結果: ${categoryPassed}/${categoryPassed + categoryFailed} 通過`);
});

// ============================================
// 總結
// ============================================

console.log('\n' + '='.repeat(70));
console.log('極端安全審計總結 (2025 攻擊向量)');
console.log('='.repeat(70));

const total = totalPassed + totalFailed;
const passRate = (totalPassed / total * 100).toFixed(1);

console.log(`\n  總計: ${totalPassed}/${total} 通過 (${passRate}%)`);

if (criticalFailures.length > 0) {
    console.log('\n  🚨 發現關鍵安全漏洞！需要立即修復：\n');
    criticalFailures.forEach((f, i) => {
        console.log(`    ${i+1}. [${f.category}] ${f.test.desc}`);
        console.log(`       SQL: ${f.test.sql.substring(0, 80)}...`);
    });
    console.log('\n  ⚠️  請修復上述關鍵漏洞後再部署！');
    process.exit(1);
}

if (totalFailed > 0) {
    console.log('\n  ⚠️  發現非關鍵問題：\n');
    failures.forEach((f, i) => {
        console.log(`    ${i+1}. [${f.category}] ${f.test.desc}`);
    });
    console.log('\n  ℹ️  這些問題風險較低，可評估是否需要修正。');
} else {
    console.log('\n  🔒 所有極端安全測試通過！系統防護極其強健。');
}

console.log('\n' + '='.repeat(70));

module.exports = { extremeAttackVectors };
