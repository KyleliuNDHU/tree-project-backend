/**
 * 意圖分類測試 - Intent Classification Test
 * 
 * 測試 shouldQueryDatabase 函數是否能正確分類使用者意圖
 * 
 * 執行方式: node tests/intentClassification.test.js
 */

const { shouldQueryDatabase } = require('../services/sqlQueryService');

// 測試案例
const testCases = [
    // ========== 應該查資料庫 (true) ==========
    { input: 'ST-0001的狀況如何？', expected: true, category: '樹木編號查詢' },
    { input: '總共有幾棵樹？', expected: true, category: '統計查詢' },
    { input: '胸徑超過50公分的樹有哪些？', expected: true, category: '條件篩選' },
    { input: '哪些樹的碳儲存量最高？', expected: true, category: '排名查詢' },
    { input: '列出所有榕樹', expected: true, category: '列表查詢' },
    { input: '給我完整的68筆資料', expected: true, category: '完整資料' },
    { input: '平均胸徑是多少？', expected: true, category: '統計計算' },
    { input: '查詢大安區的樹木資料', expected: true, category: '區域查詢' },
    
    // ========== 應該問知識 (false) ==========
    { input: '榕樹適合什麼環境？', expected: false, category: '樹種知識' },
    { input: '為什麼要計算碳儲存量？', expected: false, category: '原理說明' },
    { input: '如何種植樟樹？', expected: false, category: '種植指南' },
    { input: '什麼是碳匯？', expected: false, category: '名詞解釋' },
    { input: '樹木的生長條件有哪些？', expected: false, category: '一般知識' },
    { input: '介紹一下台灣欒樹', expected: false, category: '樹種介紹' },
    
    // ========== 邊界案例 ==========
    { input: '樟樹呢？', expected: false, category: '後續問題（知識）' },
    { input: '榕樹有幾棵？', expected: true, category: '樹種統計' },
];

// 執行測試
console.log('='.repeat(60));
console.log('意圖分類測試 (Intent Classification Test)');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach((tc, index) => {
    const result = shouldQueryDatabase(tc.input);
    const isPass = result === tc.expected;
    
    if (isPass) {
        passed++;
        console.log(`✅ #${index + 1} [${tc.category}]`);
        console.log(`   輸入: "${tc.input}"`);
        console.log(`   結果: ${result ? '查資料' : '問知識'} (正確)`);
    } else {
        failed++;
        console.log(`❌ #${index + 1} [${tc.category}]`);
        console.log(`   輸入: "${tc.input}"`);
        console.log(`   預期: ${tc.expected ? '查資料' : '問知識'}`);
        console.log(`   實際: ${result ? '查資料' : '問知識'}`);
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
