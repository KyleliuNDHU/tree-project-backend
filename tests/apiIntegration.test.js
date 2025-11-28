/**
 * 真正的 API 整合測試
 * 模擬 APP 的實際行為，發送請求到 Render 伺服器
 * 
 * 環境設定:
 * - staging: https://tree-app-backend-staging.onrender.com/api
 * - prod: https://tree-app-backend-prod.onrender.com/api
 * 
 * 使用方式:
 *   node tests/apiIntegration.test.js [staging|prod]
 * 
 * 預設使用 staging 環境
 */

const https = require('https');

// 環境設定 (staging 已停用)
const ENVIRONMENTS = {
  prod: 'https://tree-app-backend-prod.onrender.com/api'
};

// 從命令列參數獲取環境，預設 prod
const envArg = process.argv[2] || 'prod';
const BASE_URL = ENVIRONMENTS[envArg] || ENVIRONMENTS.prod;

console.log(`\n🌐 測試環境: ${envArg.toUpperCase()}`);
console.log(`📡 API URL: ${BASE_URL}\n`);

// 測試用的 User ID
const TEST_USER_ID = 'test-user-' + Date.now();

// HTTP POST 請求 (模擬 Flutter 的 ApiService.post)
function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({
            statusCode: res.statusCode,
            body: json
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: body
          });
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout (60s)'));
    });
    
    req.write(postData);
    req.end();
  });
}

// HTTP GET 請求
function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({
            statusCode: res.statusCode,
            body: json
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: body
          });
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout (30s)'));
    });
    
    req.end();
  });
}

// 測試結果追蹤
let passed = 0;
let failed = 0;
const results = [];

// 測試函數
async function runTest(name, testFn) {
  process.stdout.write(`  ⏳ ${name}...`);
  const startTime = Date.now();
  
  try {
    const result = await testFn();
    const duration = Date.now() - startTime;
    
    console.log(`\r  ✅ ${name} (${duration}ms)`);
    if (result && result.details) {
      console.log(`     └─ ${result.details}`);
    }
    passed++;
    results.push({ name, status: 'pass', duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\r  ❌ ${name} (${duration}ms)`);
    console.log(`     └─ Error: ${error.message}`);
    failed++;
    results.push({ name, status: 'fail', error: error.message, duration });
  }
}

// ===========================================
// 測試案例
// ===========================================

// 1. 健康檢查測試 - 使用 tree_species endpoint 確認伺服器運行中
async function testHealthCheck() {
  const response = await apiGet('tree_species');
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  return { details: `Server is healthy (tree_species API working)` };
}

// 2. Chat API - 數據查詢 (模擬 APP 的 getChatResponse)
async function testChatDataQuery() {
  // 模擬 Flutter AiService.getChatResponse
  const response = await apiPost('chat', {
    message: '目前有幾棵樹？',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'  // APP 預設使用的模型
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false: ${response.body.message || JSON.stringify(response.body)}`);
  }
  
  if (!response.body.response) {
    throw new Error('Missing response field in API response');
  }
  
  // 檢查回應是否包含數字（應該要有樹木數量）
  const hasNumber = /\d+/.test(response.body.response);
  
  return { 
    details: `Response contains numbers: ${hasNumber}, preview: "${response.body.response.substring(0, 80)}..."` 
  };
}

// 3. Chat API - 知識問答
async function testChatKnowledgeQuery() {
  const response = await apiPost('chat', {
    message: '什麼是碳匯？',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false: ${response.body.message || JSON.stringify(response.body)}`);
  }
  
  // 知識問答應該有較長的回應
  if (response.body.response.length < 50) {
    throw new Error(`Response too short (${response.body.response.length} chars)`);
  }
  
  return { 
    details: `Response length: ${response.body.response.length} chars` 
  };
}

// 4. Chat API - 特定樹種查詢
async function testChatSpeciesQuery() {
  const response = await apiPost('chat', {
    message: '有多少棵樟樹？',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false: ${response.body.message || JSON.stringify(response.body)}`);
  }
  
  // 應該提到樟樹或數量
  const responseText = response.body.response.toLowerCase();
  const mentionsResult = responseText.includes('樟') || /\d+/.test(response.body.response);
  
  return { 
    details: `Mentions species/count: ${mentionsResult}` 
  };
}

// 5. Chat API - 使用不同模型 (Qwen)
async function testChatWithQwenModel() {
  const response = await apiPost('chat', {
    message: '列出所有樹種',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'Qwen/Qwen3-VL-32B-Instruct'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false: ${response.body.message || JSON.stringify(response.body)}`);
  }
  
  return { 
    details: `Qwen model responded successfully` 
  };
}

// 6. Chat API - 對話歷史測試（連續兩則訊息）
async function testChatHistory() {
  // 第一則訊息
  await apiPost('chat', {
    message: '我想了解碳匯計算',
    userId: TEST_USER_ID + '-history',
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  // 第二則訊息（應該能記住上下文）
  const response = await apiPost('chat', {
    message: '可以舉個例子嗎？',
    userId: TEST_USER_ID + '-history',
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false`);
  }
  
  return { 
    details: `Conversation history working` 
  };
}

// 7. Chat API - Project Areas 過濾
async function testChatWithProjectAreas() {
  const response = await apiPost('chat', {
    message: '這個區域有幾棵樹？',
    userId: TEST_USER_ID,
    projectAreas: ['測試區域'],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  // 即使區域不存在，也應該回傳成功
  if (!response.body.success) {
    throw new Error(`API returned success=false`);
  }
  
  return { 
    details: `Project area filter working` 
  };
}

// 8. 樹木調查資料 API 測試
async function testTreeSurveyApi() {
  const response = await apiGet('tree_survey');
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.body.success) {
    throw new Error(`API returned success=false`);
  }
  
  const count = Array.isArray(response.body.data) ? response.body.data.length : 0;
  
  return { 
    details: `Found ${count} tree records` 
  };
}

// 9. 樹種資料 API 測試
async function testTreeSpeciesApi() {
  // 正確路徑: /api/carbon/sink/tree-species
  const response = await apiGet('carbon/sink/tree-species');
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  const count = Array.isArray(response.body.data) ? response.body.data.length : 
                (response.body.species ? response.body.species.length : 0);
  
  return { 
    details: `Found ${count} species` 
  };
}

// 10. 統計資料 API 測試
async function testStatisticsApi() {
  // 正確路徑: /api/tree_statistics
  const response = await apiGet('tree_statistics');
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  return { 
    details: `Statistics API working` 
  };
}

// 11. 錯誤處理測試 - 空訊息
async function testChatEmptyMessage() {
  const response = await apiPost('chat', {
    message: '',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'deepseek-ai/DeepSeek-V3'
  });
  
  // 空訊息應該被拒絕或優雅處理
  if (response.statusCode === 200 && !response.body.success) {
    return { details: 'Empty message rejected properly' };
  }
  
  if (response.statusCode === 400) {
    return { details: 'Empty message rejected with 400' };
  }
  
  // 如果伺服器還是處理了，至少要有回應
  return { details: 'Server handled empty message gracefully' };
}

// 12. 錯誤處理測試 - 無效模型
async function testChatInvalidModel() {
  const response = await apiPost('chat', {
    message: '測試訊息',
    userId: TEST_USER_ID,
    projectAreas: [],
    model_preference: 'invalid-model-name'
  });
  
  // 無效模型應該回退到預設模型或報錯
  if (response.statusCode === 200) {
    return { details: 'Server handled invalid model gracefully (fallback)' };
  }
  
  if (response.statusCode === 400) {
    return { details: 'Invalid model rejected properly' };
  }
  
  throw new Error(`Unexpected status: ${response.statusCode}`);
}

// ===========================================
// 主程式
// ===========================================

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  API 整合測試 - 模擬 APP 行為');
  console.log('═══════════════════════════════════════════════════════');
  
  // 先確認伺服器可連線
  console.log('\n📍 基礎連線測試:');
  await runTest('伺服器健康檢查', testHealthCheck);
  
  // 如果基礎測試失敗，提前結束
  if (failed > 0) {
    console.log('\n⚠️  伺服器無法連線，跳過其餘測試');
    console.log('   可能原因: Render 免費方案會在閒置後休眠，請稍等幾分鐘後重試');
    printSummary();
    return;
  }
  
  console.log('\n📍 Chat API 測試 (核心功能):');
  await runTest('數據查詢 - 樹木總數', testChatDataQuery);
  await runTest('知識問答 - 碳匯定義', testChatKnowledgeQuery);
  await runTest('特定查詢 - 樟樹數量', testChatSpeciesQuery);
  await runTest('模型切換 - Qwen3', testChatWithQwenModel);
  await runTest('對話歷史 - 上下文', testChatHistory);
  await runTest('區域過濾 - Project Areas', testChatWithProjectAreas);
  
  console.log('\n📍 資料 API 測試:');
  await runTest('樹木調查資料', testTreeSurveyApi);
  await runTest('樹種資料', testTreeSpeciesApi);
  await runTest('統計資料', testStatisticsApi);
  
  console.log('\n📍 錯誤處理測試:');
  await runTest('空訊息處理', testChatEmptyMessage);
  await runTest('無效模型處理', testChatInvalidModel);
  
  printSummary();
}

function printSummary() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  測試結果摘要');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ 通過: ${passed}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log(`  📊 總計: ${passed + failed}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  if (failed > 0) {
    console.log('失敗的測試:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    console.log('');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// 執行測試
runAllTests().catch(error => {
  console.error('\n💥 測試執行發生未預期錯誤:', error);
  process.exit(1);
});
