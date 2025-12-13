# 測試資料夾 (Tests)

此資料夾包含 TreeAI 後端 API 的完整測試套件。

## 🚀 快速開始

```bash
# 完整回歸測試 (推薦 - 可取代手機測試)
npm run test:regression

# 本地測試 (需要先啟動本地 server)
npm run test:regression:local

# 只測試特定模組
node tests/regression.test.js --section=auth      # 認證
node tests/regression.test.js --section=tree      # 樹木 CRUD
node tests/regression.test.js --section=batch     # 批量匯入
node tests/regression.test.js --section=user      # 使用者管理
node tests/regression.test.js --section=security  # 安全性
node tests/regression.test.js --section=extra     # 附加功能

# 顯示詳細回應
node tests/regression.test.js --verbose
```

## 📋 測試項目

### 完整回歸測試 (`regression.test.js`) ⭐ 重要

| 模組 | 測試內容 | 測試數量 |
|------|---------|----------|
| `auth` | 登入、JWT 驗證、401 處理、錯誤密碼拒絕 | 7 項 |
| `tree` | 新增/編輯/刪除樹木 (V2 + Legacy) | 8 項 |
| `batch` | BLE 批量匯入、ID 連續性驗證 | 2 項 |
| `user` | 使用者 CRUD、停用、刪除 | 5 項 |
| `project` | 專案管理、專案邊界 | 2 項 |
| `security` | SQL 注入、XSS、Rate Limit | 3 項 |
| `audit` | 審計日誌驗證 | 1 項 |
| `extra` | 樹種辨識、ML 數據、碳計算 | 4 項 |

**總計: 32+ 項測試，完整模擬 APP 操作流程**

### 其他測試

| 檔案 | 測試內容 |
|------|--------|
| `intentClassification.test.js` | AI Chat 意圖分類 |
| `sqlValidation.test.js` | SQL 安全驗證 |
| `apiIntegration.test.js` | Chat API 邊界情況 |
| `securityAudit.test.js` | 安全性審計 |

## 🔧 環境設定

### 遠端測試 (預設)
直接執行即可，會連接到 Render 生產環境。

### 本地測試
```bash
# 1. 啟動本地 server
npm run dev

# 2. 執行本地測試
npm run test:regression:local

# 或手動指定 URL
TEST_BASE_URL=http://localhost:3001/api node tests/regression.test.js
```

### 自訂測試帳號
```bash
TEST_ADMIN_USER=admin TEST_ADMIN_PASS=yourpass node tests/regression.test.js
```

## ✅ 測試通過標準

- **所有測試通過**: 可以放心部署/燒錄 APK
- **有測試失敗**: 檢查失敗項目，修復後重新測試

## 📝 測試報告範例

```
═══════════════════════════════════════════════════════════════════════════════
  📊 測試結果摘要
═══════════════════════════════════════════════════════════════════════════════
  ✅ 通過: 30
  ❌ 失敗: 2
  ⏭️  跳過: 0
  ⏱️  耗時: 45.3s
═══════════════════════════════════════════════════════════════════════════════
```

## 🔄 持續整合 (CI)

建議在以下時機執行完整回歸測試：
1. 每次 Pull Request
2. 部署到 Render 前
3. 燒錄 APK 前

## ⚠️ 注意事項

- 測試會在資料庫中建立測試資料（以 `test_` 開頭），測試後會自動清理
- 遠端測試可能較慢（Render 免費版有冷啟動）
- 如果 Rate Limit 測試失敗，可能需要等待幾分鐘後重試
