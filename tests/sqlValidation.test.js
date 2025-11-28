/**
 * SQL 安全驗證測試 - SQL Validation Test
 * 
 * 測試 validateSQL 函數是否能正確驗證 SQL 安全性
 * 
 * 執行方式: node tests/sqlValidation.test.js
 */

const { validateSQL, ALLOWED_TABLES } = require('../services/sqlQueryService');

// 測試案例
const testCases = [
    // ========== 安全的 SQL (應通過) ==========
    {
        input: "SELECT * FROM tree_survey LIMIT 10",
        shouldPass: true,
        category: '基本查詢'
    },
    {
        input: "SELECT species_name, COUNT(*) FROM tree_survey GROUP BY species_name",
        shouldPass: true,
        category: '聚合查詢（自動加 LIMIT）'
    },
    {
        input: "SELECT * FROM tree_survey WHERE species_name ILIKE '%榕樹%' LIMIT 50",
        shouldPass: true,
        category: '模糊搜尋'
    },
    {
        input: "SELECT * FROM tree_survey WHERE dbh_cm > 50 ORDER BY dbh_cm DESC LIMIT 100",
        shouldPass: true,
        category: '條件排序'
    },
    {
        input: "SELECT t.*, s.scientific_name FROM tree_survey t JOIN tree_species s ON t.species_id = s.id LIMIT 20",
        shouldPass: true,
        category: 'JOIN 查詢'
    },
    
    // ========== 危險的 SQL (應拒絕) ==========
    {
        input: "DELETE FROM tree_survey",
        shouldPass: false,
        category: 'DELETE 攻擊'
    },
    {
        input: "DROP TABLE tree_survey",
        shouldPass: false,
        category: 'DROP 攻擊'
    },
    {
        input: "SELECT * FROM tree_survey; DELETE FROM users",
        shouldPass: false,
        category: '多語句注入'
    },
    {
        input: "SELECT * FROM tree_survey WHERE id = 1 -- comment",
        shouldPass: false,
        category: 'SQL 註解注入'
    },
    {
        input: "SELECT * FROM users LIMIT 10",
        shouldPass: false,
        category: '非白名單表格'
    },
    {
        input: "UPDATE tree_survey SET status = 'hacked'",
        shouldPass: false,
        category: 'UPDATE 攻擊'
    },
    {
        input: "INSERT INTO tree_survey (species_name) VALUES ('test')",
        shouldPass: false,
        category: 'INSERT 攻擊'
    },
    
    // ========== LIMIT 處理 ==========
    {
        input: "SELECT * FROM tree_survey LIMIT 500",
        shouldPass: true,
        category: 'LIMIT 過大（應被限制為 100）',
        checkLimit: 100
    },
    
    // ========== 新增：字串安全檢查 ==========
    {
        input: "SELECT * FROM tree_survey WHERE species_name = '未閉合的字串",
        shouldPass: false,
        category: '引號不平衡（單引號）'
    },
    {
        input: 'SELECT * FROM tree_survey WHERE species_name = "未閉合的字串',
        shouldPass: false,
        category: '引號不平衡（雙引號）'
    },
    {
        input: "SELECT * FROM tree_survey WHERE species_name = '" + "a".repeat(2000) + "'",
        shouldPass: false,
        category: 'SQL 過長（超過 2000 字元）'
    },
];

// 執行測試
console.log('='.repeat(60));
console.log('SQL 安全驗證測試 (SQL Validation Test)');
console.log('='.repeat(60));
console.log(`允許的表格: ${ALLOWED_TABLES.join(', ')}`);
console.log('');

let passed = 0;
let failed = 0;

testCases.forEach((tc, index) => {
    const result = validateSQL(tc.input);
    const isPass = result.safe === tc.shouldPass;
    
    // 檢查 LIMIT 是否被正確限制
    let limitCheck = true;
    if (tc.checkLimit && result.safe) {
        limitCheck = result.sanitizedSQL.includes(`LIMIT ${tc.checkLimit}`);
    }
    
    if (isPass && limitCheck) {
        passed++;
        console.log(`✅ #${index + 1} [${tc.category}]`);
        console.log(`   SQL: ${tc.input.substring(0, 60)}${tc.input.length > 60 ? '...' : ''}`);
        console.log(`   結果: ${result.safe ? '通過' : '拒絕'} ${result.reason ? `(${result.reason})` : ''}`);
        if (result.sanitizedSQL && result.sanitizedSQL !== tc.input) {
            console.log(`   處理後: ${result.sanitizedSQL.substring(0, 60)}...`);
        }
    } else {
        failed++;
        console.log(`❌ #${index + 1} [${tc.category}]`);
        console.log(`   SQL: ${tc.input}`);
        console.log(`   預期: ${tc.shouldPass ? '通過' : '拒絕'}`);
        console.log(`   實際: ${result.safe ? '通過' : '拒絕'}`);
        if (result.reason) console.log(`   原因: ${result.reason}`);
        if (!limitCheck) console.log(`   ⚠️ LIMIT 未被正確限制`);
    }
    console.log('');
});

// 結果摘要
console.log('='.repeat(60));
console.log(`測試結果: ${passed}/${testCases.length} 通過`);
if (failed > 0) {
    console.log(`⚠️  ${failed} 個測試失敗`);
    process.exit(1);
} else {
    console.log('🎉 全部測試通過！');
    process.exit(0);
}
