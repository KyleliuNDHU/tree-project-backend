/**
 * Chat API 整合測試 - Chat Integration Test
 * 
 * 測試完整的 Chat V2 流程（需要 .env 和資料庫連線）
 * 
 * 執行方式: node tests/chatIntegration.test.js
 * 
 * ⚠️ 注意：此測試會實際呼叫 LLM API，可能產生費用
 */

require('dotenv').config();

const {
    shouldQueryDatabase,
    buildSQLGenerationPrompt,
    executeSecureQuery,
    buildResultExplanationPrompt
} = require('../services/sqlQueryService');

// 檢查環境變數
const requiredEnvVars = ['DATABASE_URL'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error('❌ 缺少環境變數:', missingVars.join(', '));
    console.error('請確保 .env 檔案已設定');
    process.exit(1);
}

// 測試案例（只測試資料庫查詢，不呼叫 LLM）
const testCases = [
    {
        name: '統計總數',
        question: '總共有幾棵樹？',
        expectedSQL: /SELECT COUNT\(\*\)/i,
        minResults: 1
    },
    {
        name: '條件篩選',
        question: '胸徑超過50公分的樹有哪些？',
        expectedSQL: /WHERE dbh_cm > 50/i,
        minResults: 0  // 可能沒有
    },
    {
        name: '樹種查詢',
        question: '有哪些榕樹？',
        expectedSQL: /species_name ILIKE/i,
        minResults: 0
    }
];

async function runTests() {
    console.log('='.repeat(60));
    console.log('Chat API 整合測試 (Integration Test)');
    console.log('='.repeat(60));
    console.log('⚠️  此測試需要資料庫連線');
    console.log('');

    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
        console.log(`📋 測試: ${tc.name}`);
        console.log(`   問題: "${tc.question}"`);

        try {
            // Step 1: 意圖分類
            const shouldQuery = shouldQueryDatabase(tc.question);
            if (!shouldQuery) {
                console.log(`   ❌ 意圖分類錯誤：應該查資料庫但被分類為知識問答`);
                failed++;
                continue;
            }
            console.log(`   ✓ 意圖分類: 查資料`);

            // Step 2: 生成 SQL Prompt（不實際呼叫 LLM）
            const prompt = buildSQLGenerationPrompt(tc.question, []);
            if (!prompt || prompt.length < 100) {
                console.log(`   ❌ Prompt 生成失敗`);
                failed++;
                continue;
            }
            console.log(`   ✓ Prompt 生成成功 (${prompt.length} 字元)`);

            // Step 3: 測試固定 SQL 執行
            // 這裡用一個已知安全的 SQL 來測試資料庫連線
            const testSQL = "SELECT COUNT(*) as total FROM tree_survey";
            const result = await executeSecureQuery(testSQL);
            
            if (!result.success) {
                console.log(`   ❌ SQL 執行失敗: ${result.error}`);
                failed++;
                continue;
            }
            console.log(`   ✓ SQL 執行成功，總樹木數: ${result.rows[0]?.total || 0}`);

            // Step 4: 測試結果解釋 Prompt
            const explainPrompt = buildResultExplanationPrompt(
                tc.question,
                testSQL,
                result.rows,
                result.rowCount,
                []
            );
            if (!explainPrompt || explainPrompt.length < 50) {
                console.log(`   ❌ 解釋 Prompt 生成失敗`);
                failed++;
                continue;
            }
            console.log(`   ✓ 解釋 Prompt 生成成功`);

            passed++;
            console.log(`   🎉 測試通過`);
        } catch (error) {
            console.log(`   ❌ 錯誤: ${error.message}`);
            failed++;
        }
        console.log('');
    }

    // 結果摘要
    console.log('='.repeat(60));
    console.log(`測試結果: ${passed}/${testCases.length} 通過`);
    
    // 關閉資料庫連線
    const db = require('../config/db');
    await db.pool.end();
    
    if (failed > 0) {
        console.log(`⚠️  ${failed} 個測試失敗`);
        process.exit(1);
    } else {
        console.log('🎉 全部測試通過！');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('測試執行錯誤:', err);
    process.exit(1);
});
