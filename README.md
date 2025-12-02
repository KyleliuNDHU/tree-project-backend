# 🌳 TreeAI Backend - 智慧樹木管理系統後端

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-15.0.0-green.svg)](https://github.com/KyleliuNDHU/tree-project-backend)

> 基於大語言模型的永續發展分析平台 - 後端 API 服務

---

## 📦 版本紀錄

### v15.0.0 (2025-12-02) - 重大更新 🎉

#### 🌿 新增功能
- **樹種辨識 API** - 整合 Pl@ntNet + GBIF + iNaturalist 三合一
  - `POST /api/species/identify` - 圖片辨識樹種
  - `GET /api/species/search` - 學名搜尋
  - `GET /api/species/:id/info` - 取得物種詳情
  - 自動標記臺灣原生種
- **Text-to-SQL 優化** - 改進查詢準確度

#### 📋 新增檔案
| 類型 | 檔案 | 說明 |
|------|------|------|
| service | `services/speciesIdentificationService.js` | 樹種辨識服務 |
| route | `routes/speciesIdentification.js` | 樹種辨識 API 路由 |

#### ⚠️ 環境變數
需在 Render 添加：
```
PLANTNET_API_KEY=your_plantnet_api_key
```

---

## 📋 目錄

- [專案簡介](#-專案簡介)
- [功能特色](#-功能特色)
- [功能狀態總覽](#-功能狀態總覽)
- [系統架構](#-系統架構)
- [快速開始](#-快速開始)
- [環境變數設定](#-環境變數設定)
- [API 文件](#-api-文件)
- [資料庫結構](#-資料庫結構)
- [測試](#-測試)
- [部署](#-部署)
- [開發指南](#-開發指南)
- [常見問題](#-常見問題)
- [貢獻指南](#-貢獻指南)

---

## 📖 專案簡介

TreeAI 是一個智慧樹木管理系統，專為臺灣港務公司 (TIPC) 設計，用於：

- 🌲 **樹木調查管理** - 記錄、追蹤樹木資料
- 🤖 **AI 智慧助手** - 自然語言查詢資料庫 (Text-to-SQL)
- 📊 **碳匯計算** - 計算樹木碳儲存量
- 📈 **統計分析** - 生成報表與視覺化圖表
- 📱 **QR Code 掃描** - 快速查詢樹木資訊

---

## ✨ 功能特色

### 核心功能

| 功能 | 說明 |
|------|------|
| **Text-to-SQL** | 使用自然語言查詢資料庫，AI 自動生成 SQL |
| **樹種辨識** | Pl@ntNet + GBIF + iNaturalist 三合一 API ⭐ NEW |
| **多 AI 模型支援** | 支援 Gemini、OpenAI、DeepSeek、Qwen 等多種模型 |
| **安全 SQL 驗證** | 185 個測試確保 SQL 注入防護 |
| **Excel 匯出** | 查詢結果超過 5 筆自動匯出為 Excel 下載連結 |
| **碳匯計算** | 根據樹種、胸徑計算碳儲存量 |

### 技術亮點

- 🔒 **安全性** - Helmet、CORS、Rate Limiting、SQL 注入防護
- ⚡ **效能優化** - 連接池、精簡 API（地圖 API 減少 70% 傳輸量）、OOM 防護
- 🧪 **測試完善** - 單元測試、整合測試、安全審計測試
- 📝 **自動遷移** - 生產環境啟動時自動執行資料庫遷移

---

## 📊 功能狀態總覽

> ⚠️ **重要：此表格顯示各功能模組的實際開發狀態**

### 🟢 已上線且穩定運作

| 功能模組 | 路由檔案 | 說明 |
|----------|----------|------|
| **使用者認證** | `routes/users.js` | 登入、註冊、使用者管理 |
| **樹木調查 CRUD** | `routes/treeSurvey.js` | 完整 CRUD、Excel 匯入、批次操作 |
| **地圖精簡 API** | `routes/treeSurvey.js` | `/tree_survey/map` 精簡版（效能優化） |
| **Chat V2 (Text-to-SQL)** | `routes/ai.js` | 主要聊天 API `/chat`，自然語言查資料庫 |
| **統計分析** | `routes/statistics.js` | 樹種、專案、區域統計 |
| **報表匯出** | `routes/reports.js` | Excel、PDF 匯出 |
| **專案區域管理** | `routes/project_areas.js` | 區域 CRUD |
| **樹種資料** | `routes/treeSpecies.js` | 樹種查詢 |
| **樹種辨識** | `routes/speciesIdentification.js` | Pl@ntNet API 圖片辨識 ⭐ NEW |
| **管理後台** | `routes/admin.js` | API Key 管理、腳本執行 |

### 🟡 已開發但使用較少

| 功能模組 | 路由檔案 | 說明 |
|----------|----------|------|
| **舊版 RAG 聊天** | `routes/ai.js` | `/chat_old_rag_version` - 已被 Text-to-SQL 取代，保留供參考 |
| **碳足跡計算器** | `routes/carbon.js` | 碳排放計算、樹木抵消建議 |
| **樹木管理建議** | `routes/management.js` | AI 生成管理建議 |
| **知識庫 API** | `routes/knowledge.js` | 知識 CRUD（RAG 架構停用後較少使用） |
| **位置服務** | `routes/location.js` | 地理編碼服務 |
| **碳匯數據** | `routes/carbon_data.js` | 樹種碳吸收數據 |

### 🔴 測試用/已停用

| 功能模組 | 路由檔案 | 說明 |
|----------|----------|------|
| **測試路由** | `routes/test.js` | 開發測試用，生產環境已註解 |

### 📜 腳本狀態

| 腳本 | 狀態 | 說明 |
|------|------|------|
| `migrate.js` | 🟢 使用中 | 資料庫遷移（生產環境自動執行） |
| `populateSpeciesRegionScore.js` | 🟡 可用 | 填充樹種區域分數（Admin 面板可觸發） |
| `generate_species_knowledge.js` | 🟡 可用 | AI 生成樹種知識（Admin 面板可觸發，耗時長） |
| `enrich_species_synonyms.js` | 🟡 可用 | AI 擴充樹種同義詞（Admin 面板可觸發） |
| `populate_knowledge_from_survey.js` | ⚠️ 較少用 | RAG 知識填充（Text-to-SQL 取代後較少需要） |
| `generateEmbeddings.js` | ⚠️ 較少用 | 生成向量嵌入（RAG 架構） |
| `populate_knowledge.js` | ⚠️ 較少用 | 填充知識庫 |

---

## 🏗 系統架構

```
backend/
├── app.js                      # 🚀 主程式入口
├── package.json                # 📦 依賴管理
│
├── config/                     # ⚙️ 設定檔
│   ├── db.js                   # PostgreSQL 連接池
│   ├── database.js             # 資料庫設定
│   └── apiKeys.js              # API 金鑰管理
│
├── routes/                     # 🛣️ API 路由
│   ├── ai.js                   # AI 聊天 API ⭐
│   ├── treeSurvey.js           # 樹木調查 CRUD
│   ├── users.js                # 使用者認證
│   ├── statistics.js           # 統計資料
│   ├── reports.js              # 報表匯出
│   ├── carbon.js               # 碳匯計算
│   ├── admin.js                # 管理功能
│   └── ...                     # 其他路由
│
├── services/                   # 🔧 業務邏輯服務
│   ├── sqlQueryService.js      # Text-to-SQL 核心 ⭐
│   ├── geminiService.js        # Gemini API 封裝
│   └── openaiService.js        # OpenAI API 封裝
│
├── middleware/                 # 🛡️ 中介軟體
│   ├── adminAuth.js            # 管理員驗證
│   └── rateLimiter.js          # 請求限流
│
├── scripts/                    # 📜 工具腳本
│   └── migrate.js              # 資料庫遷移
│
├── tests/                      # 🧪 測試檔案
│   ├── intentClassification.test.js
│   ├── sqlValidation.test.js
│   ├── securityAudit.test.js
│   └── ...
│
├── data/                       # 📂 靜態資料
│   ├── tree_species.json       # 樹種資料
│   └── twCounty2010.fixed.geo.json # 台灣縣市 GeoJSON
│
└── utils/                      # 🔨 工具函數
    └── cleanup.js              # 清理函數
```

---

## 🚀 快速開始

### 前置需求

- **Node.js** 18.0.0 以上
- **PostgreSQL** 14 以上
- **npm** 或 **yarn**

### 安裝步驟

```bash
# 1. 複製專案
git clone https://github.com/KyleliuNDHU/tree-project-backend.git
cd tree-project-backend

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env 檔案，填入必要的設定值

# 4. 啟動開發伺服器
npm run dev

# 伺服器會在 http://localhost:3000 啟動
```

### 常用指令

```bash
npm run dev          # 開發模式（自動重啟）
npm start            # 生產模式
npm test             # 執行測試
npm run test:intent  # 只測試意圖分類
npm run test:sql     # 只測試 SQL 驗證
```

---

## 🔐 環境變數設定

在專案根目錄建立 `.env` 檔案：

```env
# === 資料庫設定 ===
DATABASE_URL=postgresql://username:password@host:5432/database_name

# === AI API 金鑰（至少需要一個）===
OPENAI_API_KEY=your_openai_api_key        # 必要：用於 SQL 生成
GEMINI_API_KEY=your_gemini_api_key        # 可選：用於聊天回應
SiliconFlow_API_KEY=your_siliconflow_key  # 可選：DeepSeek/Qwen 模型

# === JWT 設定 ===
JWT_SECRET=your_jwt_secret_key

# === 伺服器設定 ===
PORT=3000
NODE_ENV=development

# === 可選：其他服務 ===
Claude_API_KEY=your_anthropic_key         # 可選：Claude 模型
RENDER_EXTERNAL_URL=https://xxx.onrender.com  # 部署時自動設定
```

### 如何取得 API 金鑰

| 服務 | 取得方式 | 用途 |
|------|----------|------|
| **OpenAI** | [OpenAI Platform](https://platform.openai.com/api-keys) | SQL 生成（必要）|
| **Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | 聊天回應 |
| **SiliconFlow** | [SiliconFlow](https://siliconflow.cn/) | DeepSeek/Qwen 模型 |

---

## 📚 API 文件

### 基礎資訊

- **生產環境 Base URL**: `https://tree-app-backend-prod.onrender.com/api`
- **本地開發 Base URL**: `http://localhost:3000/api`
- **認證方式**: 部分 API 需要登入後取得的 user_id
- **Content-Type**: `application/json`

### 主要 API 端點

#### 🔐 使用者認證

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| POST | `/api/login` | 使用者登入（支援一般/管理員） | 🟢 |
| GET | `/api/users` | 取得使用者列表 | 🟢 |
| POST | `/api/users` | 新增使用者 | 🟢 |
| PUT | `/api/users/:id` | 更新使用者 | 🟢 |
| DELETE | `/api/users/:id` | 刪除使用者 | 🟢 |

#### 🌲 樹木調查（主要功能）

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| GET | `/api/tree_survey` | 取得所有樹木調查（支援分頁） | 🟢 |
| GET | `/api/tree_survey/map` | 🚀 地圖專用精簡 API（減少 70% 傳輸量） | 🟢 |
| GET | `/api/tree_survey/by_id/:id` | 取得單筆樹木調查 | 🟢 |
| GET | `/api/tree_survey/by_project/:name` | 依專案名稱查詢 | 🟢 |
| GET | `/api/tree_survey/by_area/:area` | 依區位查詢 | 🟢 |
| POST | `/api/tree_survey` | 新增樹木調查 | 🟢 |
| POST | `/api/tree_survey/v2` | V2 新增（自動編號） | 🟢 |
| PUT | `/api/tree_survey/:id` | 更新樹木調查 | 🟢 |
| DELETE | `/api/tree_survey/:id` | 刪除樹木調查 | 🟢 |
| POST | `/api/tree_survey/batch` | 批次匯入（Excel/CSV） | 🟢 |

#### 🤖 AI 聊天（核心功能）

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| POST | `/api/chat` | ⭐ AI 聊天（Text-to-SQL V2） | 🟢 |
| GET | `/api/download/:filename` | 下載 Excel 匯出檔案 | 🟢 |
| POST | `/api/chat_old_rag_version` | 舊版 RAG 聊天（保留） | 🟡 |

**Chat API 請求範例：**

```json
POST /api/chat
{
  "message": "列出所有胸徑大於 50 公分的樹木",
  "userId": "user123",
  "projectAreas": ["高雄港"],
  "model_preference": "deepseek-ai/DeepSeek-V3"
}
```

**回應範例（資料查詢）：**

```json
{
  "success": true,
  "response": "根據查詢結果，共找到 15 棵胸徑大於 50 公分的樹木...",
  "queryMode": "data",
  "executedSQL": "SELECT * FROM tree_survey WHERE dbh_cm > 50 LIMIT 100",
  "resultCount": 15,
  "excelDownloadUrl": "https://xxx.onrender.com/api/download/query_xxx.xlsx"
}
```

**支援的 AI 模型：**
- `deepseek-ai/DeepSeek-V3` (預設，透過 SiliconFlow)
- `Qwen/Qwen3-VL-32B-Instruct` (透過 SiliconFlow)
- `gpt-4.1-nano`, `gpt-4.1-mini` (OpenAI)
- `gemini-2.5-flash` (Google)

#### 📊 統計

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| GET | `/api/tree_statistics` | 取得統計資料（樹種、專案、區域） | 🟢 |

#### 📄 報表匯出

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| GET | `/api/export/excel?project_codes=xxx` | 匯出 Excel | 🟢 |
| GET | `/api/export/pdf?project_codes=xxx` | 匯出 PDF | 🟢 |
| GET | `/api/sustainability_report` | 永續報告 | 🟢 |

#### 🌱 碳匯相關

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| POST | `/api/carbon/footprint/calculator` | 碳足跡計算器 | 🟡 |
| POST | `/api/carbon/footprint/offset` | 碳抵消建議 | 🟡 |
| GET | `/api/tree-carbon-data` | 樹種碳吸收數據 | 🟢 |

#### � 管理後台

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| POST | `/api/admin/run-script` | 執行後台腳本 | 🟢 |
| GET | `/api/admin/api-keys` | 取得 API Key 列表 | 🟢 |
| POST | `/api/admin/api-keys` | 新增 API Key | 🟢 |

#### 📍 其他

| 方法 | 端點 | 說明 | 狀態 |
|------|------|------|------|
| GET | `/api/project_areas` | 取得專案區域列表 | 🟢 |
| GET | `/api/tree_species` | 取得樹種列表 | 🟢 |
| GET | `/health` | 健康檢查端點 | 🟢 |

---

## 🗃️ 資料庫結構

### 主要資料表

#### `tree_survey` - 樹木調查主表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | SERIAL | 主鍵 |
| system_tree_id | VARCHAR | 系統樹木編號 |
| project_tree_id | VARCHAR | 專案樹木編號 |
| species_id | INTEGER | 樹種 ID (FK) |
| dbh | DECIMAL | 胸徑 (cm) |
| tree_height | DECIMAL | 樹高 (m) |
| latitude | DECIMAL | 緯度 |
| longitude | DECIMAL | 經度 |
| health_status | VARCHAR | 健康狀態 |
| created_at | TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | 更新時間 |

#### `tree_species` - 樹種資料表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | SERIAL | 主鍵 |
| name | VARCHAR | 中文名 |
| scientific_name | VARCHAR | 學名 |
| family | VARCHAR | 科名 |
| carbon_coefficient | DECIMAL | 碳係數 |

#### `project_areas` - 專案區域

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | SERIAL | 主鍵 |
| name | VARCHAR | 區域名稱 |
| description | TEXT | 描述 |

### ER 圖

```
┌─────────────────┐       ┌─────────────────┐
│   tree_survey   │       │  tree_species   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ species_id (FK) │──────>│ name            │
│ project_area_id │       │ scientific_name │
│ dbh             │       │ carbon_coef     │
│ tree_height     │       └─────────────────┘
│ latitude        │
│ longitude       │       ┌─────────────────┐
│ health_status   │       │  project_areas  │
│ ...             │       ├─────────────────┤
└────────┬────────┘       │ id (PK)         │
         │                │ name            │
         └───────────────>│ description     │
                          └─────────────────┘
```

---

## 🧪 測試

### 執行所有測試

```bash
npm test
```

### 測試類別

| 測試檔案 | 說明 | 指令 |
|----------|------|------|
| `intentClassification.test.js` | 意圖分類測試 | `npm run test:intent` |
| `sqlValidation.test.js` | SQL 安全驗證 | `npm run test:sql` |
| `chatIntegration.test.js` | Chat API 整合測試 | `npm run test:integration` |
| `apiIntegration.test.js` | API 整合測試 | `npm run test:api` |
| `securityAudit.test.js` | 安全審計測試 | - |
| `edgeCases.test.js` | 邊界案例測試 | - |

### 測試覆蓋率

```
✅ 185 個測試全部通過

測試類別:
├── 意圖分類測試 ✅
├── SQL 驗證測試 ✅
├── 安全審計測試 ✅
├── 進階安全審計 ✅
├── 極端案例測試 ✅
├── API 整合測試 ✅
└── Chat 整合測試 ✅
```

---

## 🚢 部署

### Render.com 部署（目前使用）

1. 連結 GitHub Repository
2. 設定環境變數
3. Build Command: `npm install`
4. Start Command: `npm start`

### 部署注意事項

- 免費方案會在閒置時休眠
- 第一次請求可能較慢（冷啟動）
- 建議設定健康檢查端點: `/health`

### Docker 部署（可選）

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 👨‍💻 開發指南

### 新增 API 端點

1. 在 `routes/` 建立或修改路由檔案
2. 在 `app.js` 註冊路由
3. 撰寫測試

**範例：新增一個端點**

```javascript
// routes/example.js
const express = require('express');
const router = express.Router();

router.get('/hello', (req, res) => {
    res.json({ message: 'Hello World!' });
});

module.exports = router;
```

```javascript
// app.js 中註冊
const exampleRoutes = require('./routes/example');
apiRouter.use('/example', exampleRoutes);
```

### 修改 Text-to-SQL 邏輯

核心檔案：`services/sqlQueryService.js`

主要函數：
- `classifyIntent()` - 意圖分類
- `generateSQL()` - 生成 SQL
- `validateSQL()` - SQL 安全驗證
- `executeQuery()` - 執行查詢

### 程式碼風格

- 使用 ES6+ 語法
- 使用 async/await 處理非同步
- 錯誤處理使用 try-catch
- 註解使用中文

---

## ❓ 常見問題

### Q: 啟動時出現資料庫連線錯誤？

確認：
1. `.env` 中的 `DATABASE_URL` 正確
2. PostgreSQL 服務已啟動
3. 資料庫已建立

### Q: AI 聊天沒有回應？

確認：
1. API 金鑰已設定且有效
2. 檢查 console 是否有錯誤訊息
3. 確認網路連線正常

### Q: SQL 查詢被拒絕？

可能原因：
1. 查詢包含危險關鍵字（安全機制）
2. 查詢的表格不在白名單中
3. SQL 語法錯誤

### Q: 如何新增支援的 AI 模型？

1. 在 `services/` 建立新的服務檔案
2. 在 `routes/ai.js` 新增模型選項
3. 更新前端的模型選擇列表

---

## 🤝 貢獻指南

1. Fork 專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

---

## 📄 授權

本專案使用 ISC 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

---

## 📞 聯絡資訊

- **GitHub**: [@KyleliuNDHU](https://github.com/KyleliuNDHU)
- **專案連結**: [tree-project-backend](https://github.com/KyleliuNDHU/tree-project-backend)

---

## 🙏 致謝

- Google Gemini API
- OpenAI API
- 國立東華大學
- 臺灣港務公司

---

<p align="center">
  Made with ❤️ for sustainable forestry management
</p>
