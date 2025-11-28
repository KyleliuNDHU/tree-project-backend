/**
 * 極端案例測試 - Edge Cases Test
 * 
 * 測試各種實際使用中可能遇到的極端情況：
 * 1. 意圖分類邊界案例
 * 2. 可能產生錯誤 SQL 的問題
 * 3. 注入攻擊變體
 * 4. 特殊字元處理
 * 5. 多語言/格式混用
 * 
 * 執行方式: node tests/edgeCases.test.js
 */

const { shouldQueryDatabase, validateSQL, buildSQLGenerationPrompt } = require('../services/sqlQueryService');

// ============================================
// 1. 意圖分類極端案例
// ============================================
const intentEdgeCases = [
    // ----- 模糊邊界：可能誤判的案例 -----
    { input: '碳儲存量', expected: true, desc: '只有關鍵字，無動詞' },
    { input: '樹', expected: false, desc: '單字查詢' },
    { input: '?', expected: false, desc: '只有問號' },
    { input: '', expected: false, desc: '空字串' },
    { input: '   ', expected: false, desc: '只有空白' },
    { input: '123', expected: false, desc: '只有數字' },
    { input: '前10', expected: true, desc: '前N但沒說查什麼' },
    { input: '最高', expected: true, desc: '最X但沒說什麼最高' },
    
    // ----- 口語化查詢 -----
    { input: '給我看看有什麼樹', expected: true, desc: '口語化列表' },
    { input: '隨便給我幾棵', expected: true, desc: '隨機要求' },
    { input: '有沒有大樹啊', expected: true, desc: '口語問句' },
    { input: '樹多不多', expected: true, desc: '口語統計' },
    { input: '那個啥，查一下榕樹', expected: true, desc: '口語+查詢' },
    
    // ----- 跟隨上下文 -----
    { input: '那高雄港呢', expected: true, desc: '跟隨查詢-港口' },
    { input: '還有嗎', expected: false, desc: '跟隨但無具體內容' },
    { input: '繼續', expected: false, desc: '單字跟隨' },
    { input: '下一個', expected: false, desc: '分頁請求（模糊）' },
    { input: '再來是台北港', expected: true, desc: '明確跟隨查詢' },
    
    // ----- 混合意圖（知識+資料）-----
    { input: '榕樹有幾棵，順便介紹一下榕樹', expected: true, desc: '混合：資料優先' },
    { input: '什麼是碳儲存量，我們有多少', expected: true, desc: '混合：先問知識再問資料' },
    { input: '介紹一下資料庫裡的樹種', expected: true, desc: '知識詞+資料需求' },
    
    // ----- 否定句 -----
    { input: '不要給我榕樹的資料', expected: true, desc: '否定但仍是資料查詢' },
    { input: '除了榕樹還有什麼', expected: true, desc: '排除條件' },
    { input: '沒有超過50公分的嗎', expected: true, desc: '否定問句' },
    
    // ----- 複雜條件 -----
    { input: '高雄港的榕樹中，胸徑大於30但小於50的有哪些', expected: true, desc: '多重條件' },
    { input: '列出2022年種的樹，按碳儲存量排序', expected: true, desc: '時間+排序' },
    { input: '比較花蓮港和高雄港的平均樹高', expected: true, desc: '跨區比較' },
];

// ============================================
// 2. 可能產生錯誤 SQL 的問題
// ============================================
const problematicQueries = [
    // ----- 欄位名稱混淆 -----
    { query: '查詢所有樹的 DBH', issue: 'dbh vs dbh_cm' },
    { query: '列出樹木的高度', issue: '高度 vs tree_height_m' },
    { query: '碳吸收量最高的樹', issue: '碳吸收 vs carbon_sequestration_per_year' },
    { query: '查詢樹木ID是7的資料', issue: 'ID vs system_tree_id' },
    { query: '專案編號1的所有樹', issue: '專案編號 vs project_tree_id vs project_code' },
    
    // ----- 資料類型混淆 -----
    { query: '系統編號ST-0007的樹', issue: '會誤用ST-格式但實際是純數字' },
    { query: '編號大於一百的樹', issue: '中文數字 vs 阿拉伯數字' },
    { query: '胸徑超過五十公分', issue: '中文數字處理' },
    
    // ----- 不存在的欄位/表 -----
    { query: '查詢樹木的年齡', issue: '資料庫沒有年齡欄位' },
    { query: '列出所有種植者', issue: '沒有種植者欄位' },
    { query: '查詢樹木的照片', issue: '沒有照片欄位' },
    
    // ----- 複雜計算 -----
    { query: '計算所有樹木的碳儲存量總和除以數量', issue: '複雜算術' },
    { query: '樹高和胸徑的比值', issue: '欄位運算' },
    { query: '每個區位的樹木密度', issue: '需要面積資料但可能沒有' },
    
    // ----- 模糊匹配問題 -----
    { query: '查詢"榕"樹', issue: '帶引號的搜尋詞' },
    { query: '樹種包含\'樟\'的', issue: '單引號可能破壞SQL' },
    { query: '名稱有%的樹', issue: '特殊字元%' },
    
    // ----- 空值處理 -----
    { query: '列出沒有備註的樹', issue: 'NULL 處理' },
    { query: '碳儲存量為空的樹木', issue: 'NULL vs 0' },
    { query: '狀態不明的樹', issue: '模糊空值描述' },
    
    // ----- JOIN 相關 -----
    { query: '列出樹木和它們的學名', issue: '可能需要JOIN tree_species' },
    { query: '查詢有碳匯參數的樹種', issue: '可能需要JOIN tree_carbon_data' },
    
    // ----- 超出範圍 -----
    { query: '列出所有10萬棵樹', issue: '超大數量請求' },
    { query: '過去10年的所有資料', issue: '大時間範圍' },
];

// ============================================
// 3. SQL 注入攻擊變體
// ============================================
const injectionAttempts = [
    // ----- 基本注入 -----
    { input: "SELECT * FROM tree_survey; DROP TABLE users;--", shouldPass: false },
    { input: "SELECT * FROM tree_survey WHERE species_name = '' OR '1'='1'", shouldPass: false },
    { input: "SELECT * FROM tree_survey UNION SELECT * FROM users", shouldPass: false },
    
    // ----- 進階注入 -----
    { input: "SELECT * FROM tree_survey WHERE species_name = '榕樹'--", shouldPass: false },
    { input: "SELECT/**/species_name/**/FROM/**/tree_survey", shouldPass: true }, // 註解內嵌但無害
    { input: "SELECT * FROM tree_survey WHERE 1=1 AND species_name LIKE '%榕%'", shouldPass: true },
    
    // ----- 特殊字元注入 -----
    { input: "SELECT * FROM tree_survey WHERE species_name = '榕樹\\'--'", shouldPass: false },
    { input: "SELECT * FROM tree_survey WHERE species_name = CHAR(65)", shouldPass: false },
    { input: "SELECT * FROM tree_survey WHERE species_name = 0x726F6E67", shouldPass: false },
    
    // ----- 時間延遲攻擊 -----
    { input: "SELECT * FROM tree_survey; SELECT pg_sleep(10);", shouldPass: false },
    { input: "SELECT * FROM tree_survey WHERE species_name = '榕樹' AND pg_sleep(5)", shouldPass: false },
    
    // ----- 資訊洩漏 -----
    { input: "SELECT * FROM information_schema.tables", shouldPass: false },
    { input: "SELECT * FROM pg_catalog.pg_tables", shouldPass: false },
    { input: "SELECT current_user, current_database()", shouldPass: false },
    
    // ----- 檔案操作 -----
    { input: "SELECT * FROM tree_survey; COPY users TO '/tmp/data.csv'", shouldPass: false },
    { input: "SELECT lo_import('/etc/passwd')", shouldPass: false },
];

// ============================================
// 4. 特殊輸入測試
// ============================================
const specialInputs = [
    // ----- Unicode/Emoji -----
    { input: '🌳樹木查詢', type: 'emoji' },
    { input: '查詢①號樹', type: 'special number' },
    { input: '樹高＞10公尺', type: 'fullwidth char' },
    
    // ----- 超長輸入 -----
    { input: '查詢'.repeat(100) + '榕樹', type: 'very long query' },
    { input: 'A'.repeat(5000), type: 'extremely long' },
    
    // ----- 格式混亂 -----
    { input: '   查   詢   榕   樹   ', type: 'extra spaces' },
    { input: '查詢\n榕樹\n資料', type: 'newlines' },
    { input: '查詢\t榕樹', type: 'tabs' },
    
    // ----- 空值/邊界 -----
    { input: null, type: 'null input' },
    { input: undefined, type: 'undefined input' },
    { input: {}, type: 'object input' },
    { input: [], type: 'array input' },
];

// ============================================
// 執行測試
// ============================================

console.log('='.repeat(70));
console.log('極端案例測試 (Edge Cases Test)');
console.log('='.repeat(70));

// ----- 測試 1: 意圖分類 -----
console.log('\n📋 1. 意圖分類極端案例\n');
let intentPassed = 0, intentFailed = 0;

intentEdgeCases.forEach((tc, i) => {
    try {
        const result = shouldQueryDatabase(tc.input);
        const pass = result === tc.expected;
        if (pass) {
            intentPassed++;
            console.log(`  ✅ #${i+1} "${tc.input}" → ${result} (${tc.desc})`);
        } else {
            intentFailed++;
            console.log(`  ❌ #${i+1} "${tc.input}" → 期望 ${tc.expected}, 得到 ${result} (${tc.desc})`);
        }
    } catch (err) {
        intentFailed++;
        console.log(`  💥 #${i+1} "${tc.input}" → 錯誤: ${err.message}`);
    }
});

console.log(`\n  結果: ${intentPassed} 通過, ${intentFailed} 失敗`);

// ----- 測試 2: 會產生問題的查詢（僅顯示） -----
console.log('\n📋 2. 可能產生錯誤 SQL 的查詢（供手動測試）\n');
problematicQueries.forEach((q, i) => {
    console.log(`  ${i+1}. "${q.query}"`);
    console.log(`     ⚠️  潛在問題: ${q.issue}`);
});

// ----- 測試 3: SQL 注入防護 -----
console.log('\n📋 3. SQL 注入攻擊測試\n');
let injectPassed = 0, injectFailed = 0;

injectionAttempts.forEach((tc, i) => {
    const result = validateSQL(tc.input);
    const pass = result.safe === tc.shouldPass;
    if (pass) {
        injectPassed++;
        console.log(`  ✅ #${i+1} ${tc.shouldPass ? '允許' : '阻擋'}: "${tc.input.substring(0, 50)}..."`);
    } else {
        injectFailed++;
        console.log(`  ❌ #${i+1} 期望${tc.shouldPass ? '允許' : '阻擋'}, 實際${result.safe ? '允許' : '阻擋'}`);
        console.log(`     SQL: "${tc.input.substring(0, 60)}..."`);
        if (result.reason) console.log(`     原因: ${result.reason}`);
    }
});

console.log(`\n  結果: ${injectPassed} 通過, ${injectFailed} 失敗`);

// ----- 測試 4: 特殊輸入健壯性 -----
console.log('\n📋 4. 特殊輸入健壯性測試\n');
let specialPassed = 0, specialFailed = 0;

specialInputs.forEach((tc, i) => {
    try {
        // 測試 shouldQueryDatabase 是否會崩潰
        const result = shouldQueryDatabase(tc.input);
        specialPassed++;
        console.log(`  ✅ #${i+1} [${tc.type}] 不會崩潰 → ${result}`);
    } catch (err) {
        specialFailed++;
        console.log(`  ❌ #${i+1} [${tc.type}] 崩潰: ${err.message}`);
    }
});

console.log(`\n  結果: ${specialPassed} 通過, ${specialFailed} 失敗`);

// ----- 總結 -----
console.log('\n' + '='.repeat(70));
console.log('測試總結');
console.log('='.repeat(70));

const totalPassed = intentPassed + injectPassed + specialPassed;
const totalFailed = intentFailed + injectFailed + specialFailed;
const total = totalPassed + totalFailed;

console.log(`\n  總計: ${totalPassed}/${total} 通過 (${(totalPassed/total*100).toFixed(1)}%)`);
console.log(`  意圖分類: ${intentPassed}/${intentPassed+intentFailed}`);
console.log(`  注入防護: ${injectPassed}/${injectPassed+injectFailed}`);
console.log(`  特殊輸入: ${specialPassed}/${specialPassed+specialFailed}`);

if (totalFailed > 0) {
    console.log('\n  ⚠️  有失敗的測試案例需要修正');
    process.exit(1);
} else {
    console.log('\n  🎉 所有測試通過！');
}

// ============================================
// 匯出供 API 測試使用
// ============================================
module.exports = {
    intentEdgeCases,
    problematicQueries,
    injectionAttempts,
    specialInputs
};

// ============================================
// 5. 補充測試：可能漏掉的情況
// ============================================

console.log('\n📋 5. 補充極端情況檢查\n');

const additionalEdgeCases = [
    // ----- 正常使用但可能誤判 -----
    { input: '幫我查一下', fn: 'intent', expected: true, desc: '口語但應查資料' },
    { input: '看一下資料', fn: 'intent', expected: true, desc: '口語查看' },
    { input: '我想知道有多少樹', fn: 'intent', expected: true, desc: '想知道+統計' },
    
    // ----- SQL 中正常出現的關鍵字 -----
    { input: "SELECT * FROM tree_survey WHERE species_name = '水黃皮' LIMIT 10", fn: 'sql', shouldPass: true, desc: '樹名含「黃」不應觸發問題' },
    { input: "SELECT * FROM tree_survey WHERE notes LIKE '%drop%' LIMIT 10", fn: 'sql', shouldPass: true, desc: 'notes 欄位可能含 drop 字串' },
    { input: "SELECT * FROM tree_survey WHERE species_name = '小葉欖仁' LIMIT 10", fn: 'sql', shouldPass: true, desc: '正常樹名查詢' },
    
    // ----- 可能被誤擋的正常 SQL -----
    { input: "SELECT COUNT(*), species_name FROM tree_survey GROUP BY species_name LIMIT 50", fn: 'sql', shouldPass: true, desc: '正常 GROUP BY' },
    { input: "SELECT * FROM tree_survey ORDER BY carbon_storage DESC LIMIT 10", fn: 'sql', shouldPass: true, desc: '正常 ORDER BY' },
    { input: "SELECT DISTINCT species_name FROM tree_survey LIMIT 100", fn: 'sql', shouldPass: true, desc: '正常 DISTINCT' },
    { input: "SELECT * FROM tree_survey WHERE dbh_cm BETWEEN 10 AND 50 LIMIT 100", fn: 'sql', shouldPass: true, desc: '正常 BETWEEN' },
    { input: "SELECT * FROM tree_survey WHERE species_name IN ('榕樹', '樟樹') LIMIT 50", fn: 'sql', shouldPass: true, desc: '正常 IN 子句' },
    
    // ----- CONCAT 在正常查詢中 -----
    { input: "SELECT system_tree_id || '-' || species_name as label FROM tree_survey LIMIT 10", fn: 'sql', shouldPass: true, desc: '用 || 連接字串（正常）' },
    
    // ----- 子查詢（應該允許） -----
    { input: "SELECT * FROM tree_survey WHERE dbh_cm > (SELECT AVG(dbh_cm) FROM tree_survey) LIMIT 50", fn: 'sql', shouldPass: true, desc: '子查詢（正常）' },
];

let addPassed = 0, addFailed = 0;

additionalEdgeCases.forEach((tc, i) => {
    try {
        if (tc.fn === 'intent') {
            const result = shouldQueryDatabase(tc.input);
            const pass = result === tc.expected;
            if (pass) {
                addPassed++;
                console.log(`  ✅ [意圖] "${tc.input}" → ${result} (${tc.desc})`);
            } else {
                addFailed++;
                console.log(`  ❌ [意圖] "${tc.input}" → 期望 ${tc.expected}, 得到 ${result} (${tc.desc})`);
            }
        } else if (tc.fn === 'sql') {
            const result = validateSQL(tc.input);
            const pass = result.safe === tc.shouldPass;
            if (pass) {
                addPassed++;
                console.log(`  ✅ [SQL] ${tc.shouldPass ? '允許' : '阻擋'}: ${tc.desc}`);
            } else {
                addFailed++;
                console.log(`  ❌ [SQL] 期望${tc.shouldPass ? '允許' : '阻擋'}, 實際${result.safe ? '允許' : '阻擋'}: ${tc.desc}`);
                if (result.reason) console.log(`     原因: ${result.reason}`);
            }
        }
    } catch (err) {
        addFailed++;
        console.log(`  💥 錯誤: ${err.message}`);
    }
});

console.log(`\n  結果: ${addPassed}/${additionalEdgeCases.length} 通過`);

if (addFailed > 0) {
    console.log('\n  ⚠️  有正常情況被誤判！需要修正');
}
