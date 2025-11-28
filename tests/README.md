# 測試資料夾 (Tests)

此資料夾包含 Chat V2 功能的關鍵測試。

## 執行測試

```bash
# 執行所有測試
npm test

# 只執行意圖分類測試
node tests/intentClassification.test.js

# 執行 SQL 驗證測試
node tests/sqlValidation.test.js
```

## 測試項目

| 檔案 | 測試內容 |
|------|---------|
| `intentClassification.test.js` | 意圖分類（查資料 vs 問知識） |
| `sqlValidation.test.js` | SQL 安全驗證 |
| `chatIntegration.test.js` | Chat API 整合測試（需要 .env） |

## 注意事項

- 整合測試需要設定 `.env` 環境變數
- 測試不會影響生產環境部署
