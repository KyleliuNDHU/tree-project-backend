/**
 * 安全審計測試 - Security Audit Test
 * 
 * 深度測試 SQL 注入攻擊向量
 * 確保防護機制的可靠性
 * 
 * 執行方式: node tests/securityAudit.test.js
 */

const { validateSQL } = require('../services/sqlQueryService');

console.log('='.repeat(70));
console.log('SQL 注入安全審計測試');
console.log('='.repeat(70));

// ============================================
// 攻擊向量分類測試
// ============================================

const attackVectors = {
    // ----- 1. 字串內藏匿攻擊 -----
    '字串內藏匿': [
        { sql: "SELECT * FROM tree_survey WHERE notes = 'DROP TABLE users'", shouldBlock: false, desc: '字串內的 DROP（純資料，無害）' },
        { sql: "SELECT * FROM tree_survey WHERE notes LIKE '%delete%'", shouldBlock: false, desc: 'LIKE 搜尋含 delete（無害）' },
        { sql: "SELECT * FROM tree_survey WHERE notes LIKE '%drop%'", shouldBlock: false, desc: 'LIKE 搜尋含 drop（無害）' },
    ],
    
    // ----- 2. 引號逃逸攻擊 -----
    '引號逃逸': [
        { sql: "SELECT * FROM tree_survey WHERE notes = ''; DROP TABLE users;", shouldBlock: true, desc: '結束字串後注入' },
        { sql: "SELECT * FROM tree_survey WHERE notes = 'test' OR '1'='1'", shouldBlock: true, desc: '經典 OR 注入' },
        { sql: "SELECT * FROM tree_survey WHERE notes = 'a]'; DROP TABLE x;--", shouldBlock: true, desc: '分號+註解攻擊' },
    ],
    
    // ----- 3. UNION 注入攻擊 -----
    'UNION 注入': [
        { sql: "SELECT * FROM tree_survey UNION SELECT * FROM users", shouldBlock: true, desc: '基本 UNION 攻擊' },
        { sql: "SELECT * FROM tree_survey UNION ALL SELECT username, password FROM users", shouldBlock: true, desc: 'UNION ALL 攻擊' },
        { sql: "SELECT * FROM tree_survey WHERE id=1 UNION SELECT null,null,null FROM pg_tables", shouldBlock: true, desc: 'UNION 查系統表' },
    ],
    
    // ----- 4. 堆疊查詢攻擊 -----
    '堆疊查詢': [
        { sql: "SELECT * FROM tree_survey; DROP TABLE users", shouldBlock: true, desc: '分號堆疊 DROP' },
        { sql: "SELECT * FROM tree_survey; DELETE FROM tree_survey", shouldBlock: true, desc: '分號堆疊 DELETE' },
        { sql: "SELECT * FROM tree_survey; UPDATE tree_survey SET notes='hacked'", shouldBlock: true, desc: '分號堆疊 UPDATE' },
    ],
    
    // ----- 5. 註解攻擊 -----
    '註解攻擊': [
        { sql: "SELECT * FROM tree_survey--DROP TABLE users", shouldBlock: true, desc: '單行註解隱藏' },
        { sql: "SELECT * FROM tree_survey WHERE id=1--' AND notes='test'", shouldBlock: true, desc: '註解繞過條件' },
    ],
    
    // ----- 6. 函數注入攻擊 -----
    '函數注入': [
        { sql: "SELECT * FROM tree_survey WHERE CHAR(68)||CHAR(82)||CHAR(79)||CHAR(80)='DROP'", shouldBlock: true, desc: 'CHAR() 編碼繞過' },
        { sql: "SELECT * FROM tree_survey WHERE CHR(68)||CHR(82)||CHR(79)||CHR(80)='DROP'", shouldBlock: true, desc: 'CHR() 編碼繞過' },
        { sql: "SELECT * FROM tree_survey WHERE notes = 0x44524F50", shouldBlock: true, desc: '十六進位繞過' },
    ],
    
    // ----- 7. 時間延遲攻擊 -----
    '時間延遲': [
        { sql: "SELECT * FROM tree_survey WHERE pg_sleep(10)", shouldBlock: true, desc: 'pg_sleep 延遲攻擊' },
        { sql: "SELECT * FROM tree_survey; SELECT pg_sleep(10)", shouldBlock: true, desc: '堆疊 pg_sleep' },
    ],
    
    // ----- 8. 資訊洩漏攻擊 -----
    '資訊洩漏': [
        { sql: "SELECT * FROM information_schema.tables", shouldBlock: true, desc: '查詢系統表' },
        { sql: "SELECT * FROM pg_catalog.pg_tables", shouldBlock: true, desc: '查詢 pg 目錄' },
        { sql: "SELECT current_user", shouldBlock: true, desc: '查詢當前用戶' },
        { sql: "SELECT current_database()", shouldBlock: true, desc: '查詢當前資料庫' },
        { sql: "SELECT version()", shouldBlock: false, desc: 'version() 通常無害但需注意' },
    ],
    
    // ----- 9. 檔案操作攻擊 -----
    '檔案操作': [
        { sql: "SELECT lo_import('/etc/passwd')", shouldBlock: true, desc: '讀取系統檔案' },
        { sql: "SELECT pg_read_file('/etc/passwd')", shouldBlock: true, desc: 'pg_read_file 攻擊' },
        { sql: "COPY tree_survey TO '/tmp/data.csv'", shouldBlock: true, desc: 'COPY 匯出攻擊' },
    ],
    
    // ----- 10. 非 SELECT 攻擊 -----
    '非 SELECT': [
        { sql: "INSERT INTO tree_survey VALUES (1, 'test')", shouldBlock: true, desc: 'INSERT 攻擊' },
        { sql: "UPDATE tree_survey SET notes='hacked'", shouldBlock: true, desc: 'UPDATE 攻擊' },
        { sql: "DELETE FROM tree_survey", shouldBlock: true, desc: 'DELETE 攻擊' },
        { sql: "DROP TABLE tree_survey", shouldBlock: true, desc: 'DROP 攻擊' },
        { sql: "TRUNCATE tree_survey", shouldBlock: true, desc: 'TRUNCATE 攻擊' },
        { sql: "ALTER TABLE tree_survey ADD COLUMN x TEXT", shouldBlock: true, desc: 'ALTER 攻擊' },
    ],
    
    // ----- 11. 表格白名單繞過 -----
    '表格繞過': [
        { sql: "SELECT * FROM users LIMIT 10", shouldBlock: true, desc: '非白名單表格 users' },
        { sql: "SELECT * FROM admin_logs LIMIT 10", shouldBlock: true, desc: '非白名單表格 admin_logs' },
        { sql: "SELECT * FROM tree_survey, users", shouldBlock: true, desc: '交叉查詢非白名單表' },
    ],
    
    // ----- 12. 正常查詢（應該允許） -----
    '正常查詢': [
        { sql: "SELECT * FROM tree_survey LIMIT 10", shouldBlock: false, desc: '基本查詢' },
        { sql: "SELECT * FROM tree_survey WHERE species_name = '榕樹' LIMIT 10", shouldBlock: false, desc: '條件查詢' },
        { sql: "SELECT * FROM tree_survey WHERE dbh_cm > 50 ORDER BY dbh_cm DESC LIMIT 10", shouldBlock: false, desc: '排序查詢' },
        { sql: "SELECT species_name, COUNT(*) FROM tree_survey GROUP BY species_name LIMIT 50", shouldBlock: false, desc: '統計查詢' },
        { sql: "SELECT * FROM tree_survey WHERE species_name IN ('榕樹', '樟樹') LIMIT 50", shouldBlock: false, desc: 'IN 子句' },
        { sql: "SELECT * FROM tree_survey WHERE dbh_cm BETWEEN 10 AND 50 LIMIT 50", shouldBlock: false, desc: 'BETWEEN 子句' },
        { sql: "SELECT DISTINCT species_name FROM tree_survey LIMIT 100", shouldBlock: false, desc: 'DISTINCT 查詢' },
        { sql: "SELECT * FROM tree_survey WHERE notes LIKE '%修剪%' LIMIT 10", shouldBlock: false, desc: 'LIKE 查詢' },
        { sql: "SELECT t.*, s.scientific_name FROM tree_survey t JOIN tree_species s ON t.species_id = s.id LIMIT 20", shouldBlock: false, desc: 'JOIN 查詢' },
    ],
};

// ============================================
// 執行測試
// ============================================

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

Object.entries(attackVectors).forEach(([category, tests]) => {
    console.log(`\n📋 ${category}\n`);
    
    tests.forEach((test, i) => {
        const result = validateSQL(test.sql);
        const expectedResult = test.shouldBlock ? false : true; // shouldBlock=true 表示 safe 應該是 false
        const passed = result.safe === !test.shouldBlock;
        
        if (passed) {
            totalPassed++;
            const action = test.shouldBlock ? '阻擋' : '允許';
            console.log(`  ✅ ${action}: ${test.desc}`);
        } else {
            totalFailed++;
            const expected = test.shouldBlock ? '阻擋' : '允許';
            const actual = result.safe ? '允許' : '阻擋';
            console.log(`  ❌ 期望${expected}, 實際${actual}: ${test.desc}`);
            console.log(`     SQL: ${test.sql.substring(0, 60)}...`);
            if (result.reason) console.log(`     原因: ${result.reason}`);
            failures.push({ category, test, result });
        }
    });
});

// ============================================
// 總結
// ============================================

console.log('\n' + '='.repeat(70));
console.log('安全審計總結');
console.log('='.repeat(70));

const total = totalPassed + totalFailed;
const passRate = (totalPassed / total * 100).toFixed(1);

console.log(`\n  總計: ${totalPassed}/${total} 通過 (${passRate}%)`);

if (totalFailed > 0) {
    console.log('\n  🚨 發現安全漏洞！需要修正：\n');
    failures.forEach((f, i) => {
        console.log(`  ${i+1}. [${f.category}] ${f.test.desc}`);
        console.log(`     SQL: ${f.test.sql}`);
    });
    process.exit(1);
} else {
    console.log('\n  🔒 所有安全測試通過！系統防護有效。');
}

// ============================================
// 匯出測試向量
// ============================================

module.exports = { attackVectors };
