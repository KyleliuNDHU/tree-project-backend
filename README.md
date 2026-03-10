# TreeAI Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

智慧樹木管理系統後端  為臺灣港務公司 (TIPC) 設計的 AI 驅動樹木調查平台。

---

## 目錄

- [功能](#功能)
- [架構](#架構)
- [快速開始](#快速開始)
- [環境變數](#環境變數)
- [API 文件](#api-文件)
- [部署](#部署)
- [維運指令](#維運指令)
- [資料庫](#資料庫)
- [測試](#測試)
- [版本紀錄](#版本紀錄)

---

## 功能

| 功能 | 說明 |
|------|------|
| **樹木調查 CRUD** | 完整的樹木資料管理，支援 Excel/CSV 批次匯入 |
| **Text-to-SQL AI** | 自然語言查詢資料庫，AI 自動生成 SQL |
| **樹種辨識** | Pl@ntNet + GBIF + iNaturalist 三合一 API |
| **碳匯計算** | 根據樹種、胸徑計算碳儲存量 |
| **報表匯出** | Excel、PDF 報表生成與下載 |
| **AR/ML 測量** | DBH 測量數據收集、ML 訓練數據管理 |
| **專案邊界** | PostGIS 多邊形邊界管理 |
| **安全性** | JWT 認證、RBAC 權限、SQL 注入防護、審計日誌 |
| **自動部署** | GitHub Webhook  自動部署 + 失敗自動回滾 |

### 支援的 AI 模型

- `deepseek-ai/DeepSeek-V3`（預設，透過 SiliconFlow）
- `Qwen/Qwen3-VL-32B-Instruct`（透過 SiliconFlow）
- `gpt-4.1-nano`、`gpt-4.1-mini`（OpenAI）
- `gemini-2.5-flash`（Google）

---

## 架構

```
雙機架構（透過 Tailscale VPN 連接）

Windows (Core Ultra 5 125H)     ML Service (Depth Pro + SAM 2.1 Small)
      Tailscale VPN
Ubuntu  (i3-8130U + MX130)      Node.js Backend + PostgreSQL + Nginx
```

### 目錄結構

```
backend/
 app.js                    # Express 入口
 ecosystem.config.js       # PM2 cluster 設定
 config/
    db.js                 # PostgreSQL 連接池
    database.js           # 資料庫設定
 routes/                   # API 路由
    ai.js                 # AI 聊天 (Text-to-SQL)
    treeSurvey.js         # 樹木調查 CRUD
    users.js              # 使用者認證
    statistics.js         # 統計
    reports.js            # 報表匯出
    speciesIdentification.js # 樹種辨識
    webhook.js            # GitHub 自動部署
    ...
 services/                 # 業務邏輯
    sqlQueryService.js    # Text-to-SQL 核心
    geminiService.js      # Gemini API
    openaiService.js      # OpenAI API
 middleware/               # 中介軟體
    adminAuth.js          # 管理員驗證
    projectAuth.js        # 專案權限
    rateLimiter.js        # 請求限流
 scripts/                  # 維運腳本
    deploy.sh             # 自動部署
    rollback.sh           # 回滾
    backup_db.sh          # 資料庫備份
    health_check.sh       # 健康檢查
    migrate.js            # 資料庫遷移
 tests/                    # 測試（185+ 測試案例）
 ml_service/               # ML 推論服務 (FastAPI)
```

---

## 快速開始

### 前置需求

- Node.js 20+
- PostgreSQL 16+
- npm

### 安裝

```bash
git clone https://github.com/KyleliuNDHU/tree-project-backend.git
cd tree-project-backend
npm install
cp .env.example .env   # 編輯 .env 填入設定值
npm run dev             # 開發模式 http://localhost:3000
```

### 常用指令

```bash
npm run dev           # 開發模式（nodemon 自動重啟）
npm start             # 生產模式
npm test              # 執行所有測試
npm run test:intent   # 意圖分類測試
npm run test:sql      # SQL 驗證測試
```

---

## 環境變數

在專案根目錄建立 `.env`：

```env
# 資料庫
DATABASE_URL=postgresql://tree_app:<password>@127.0.0.1:5432/tree_survey

# AI API（至少需要一個）
OPENAI_API_KEY=           # 用於 SQL 生成（必要）
GEMINI_API_KEY=           # 聊天回應
SiliconFlow_API_KEY=      # DeepSeek/Qwen 模型
Claude_API_KEY=           # Claude 模型

# 認證
JWT_SECRET=<32+ 字元隨機字串>

# ML Service
ML_SERVICE_URL=http://<Windows_Tailscale_IP>:8100
ML_API_KEY=

# 圖片服務
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# 自動部署
DEPLOY_WEBHOOK_SECRET=    # GitHub Webhook HMAC-SHA256 密鑰

# 樹種辨識
PLANTNET_API_KEY=

# 伺服器
PORT=3000
NODE_ENV=production
```

---

## API 文件

**Base URL**: `https://100.118.203.75/api`（自架）| `http://localhost:3000/api`（本地開發）

### 使用者認證

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/login` | 登入 |
| GET | `/api/users` | 取得使用者列表 |
| POST | `/api/users` | 新增使用者 |
| PUT | `/api/users/:id` | 更新使用者 |
| DELETE | `/api/users/:id` | 刪除使用者 |

### 樹木調查

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/tree_survey` | 取得所有樹木（支援分頁） |
| GET | `/api/tree_survey/map` | 地圖精簡版（減少 70% 傳輸量） |
| GET | `/api/tree_survey/by_id/:id` | 單筆查詢 |
| GET | `/api/tree_survey/by_project/:name` | 依專案查詢 |
| POST | `/api/tree_survey` | 新增樹木 |
| POST | `/api/tree_survey/v2` | V2 新增（自動編號） |
| PUT | `/api/tree_survey/:id` | 更新 |
| DELETE | `/api/tree_survey/:id` | 刪除 |
| POST | `/api/tree_survey/batch` | 批次匯入 |

### AI 聊天

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/chat` | Text-to-SQL AI 聊天 |
| GET | `/api/download/:filename` | 下載查詢結果 Excel |

```json
// POST /api/chat 請求範例
{
  "message": "列出所有胸徑大於 50 公分的樹木",
  "userId": "user123",
  "projectAreas": ["高雄港"],
  "model_preference": "deepseek-ai/DeepSeek-V3"
}
```

### 樹種辨識

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/species/identify` | 圖片辨識樹種 |
| GET | `/api/species/search` | 學名搜尋 |
| GET | `/api/species/:id/info` | 物種詳情 |

### 報表匯出

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/export/excel?project_codes=xxx` | Excel |
| GET | `/api/export/pdf?project_codes=xxx` | PDF |
| GET | `/api/sustainability_report` | 永續報告 |

### V3 測量任務

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/pending-measurements/batch` | 批次建立 |
| GET | `/api/pending-measurements/sessions` | 任務列表 |
| PATCH | `/api/pending-measurements/:id` | 更新狀態 |
| GET | `/api/pending-measurements/stats` | 統計 |

### 其他端點

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/tree_statistics` | 統計資料 |
| GET | `/api/tree_species` | 樹種列表 |
| POST | `/api/tree_images` | 上傳樹木影像 |
| GET | `/api/project_areas` | 專案區域 |
| POST | `/api/project_areas/cleanup` | 清理未使用資料 |
| GET | `/api/project-boundaries` | 專案邊界 (GeoJSON) |
| POST | `/api/ml-training/batch` | ML 訓練數據上傳 |
| GET | `/health` | 健康檢查 |

---

## 部署

### 自架伺服器（目前使用）

| 項目 | 值 |
|------|----|
| Node.js | v20.20.1 |
| PostgreSQL | 16.13 |
| PM2 | 6.0.14 (cluster 2) |
| Nginx | 1.24.0 (reverse proxy + TLS) |
| OS | Ubuntu 24.04 LTS |
| Tailscale IP | 100.118.203.75 |

#### 自動部署流程

```
git push origin main
   GitHub Webhook (HMAC-SHA256)
   deploy.sh: git pull  npm install  migrate  pm2 reload
   Health check (3 retries)
   失敗自動 rollback
```

設定 GitHub Webhook：
1. GitHub repo  Settings  Webhooks  Add webhook
2. URL: `https://<server-ip>/webhook/deploy`
3. Content type: `application/json`
4. Secret: 與 `.env` 中 `DEPLOY_WEBHOOK_SECRET` 一致
5. SSL verification: Disable（自簽憑證）
6. Events: Just the push event

---

## 維運指令

所有腳本都支援 `--help` 查看用法。

### 部署

```bash
/opt/tree-app/scripts/deploy.sh              # 自動部署
/opt/tree-app/scripts/deploy.sh --skip-migrate  # 跳過 migration
/opt/tree-app/scripts/deploy.sh --dry-run     # 只拉取不重啟
/opt/tree-app/scripts/deploy.sh --help        # 查看用法
```

### 回滾

```bash
/opt/tree-app/scripts/rollback.sh              # 回到上次成功 commit
/opt/tree-app/scripts/rollback.sh <commit>     # 回到指定 commit
/opt/tree-app/scripts/rollback.sh --list       # 列出最近 10 個 commit
/opt/tree-app/scripts/rollback.sh --help       # 查看用法
```

> 注意：回滾只回退程式碼，不回退資料庫。如需 DB 回退，使用 `/opt/tree-app/backups/` 中的備份。

### 備份

```bash
/opt/tree-app/scripts/backup_db.sh    # 手動備份（自動每天 3:00 執行）
/opt/tree-app/scripts/backup_db.sh --help
```

### PM2 管理

```bash
pm2 status                     # 服務狀態
pm2 logs tree-backend          # 查看日誌
pm2 reload tree-backend        # 零停機重載
pm2 restart tree-backend       # 重啟
pm2 monit                      # 即時監控
```

### 日誌位置

```
/opt/tree-app/logs/deploy.log   # 部署日誌
/opt/tree-app/logs/health.log   # 健康檢查日誌
/opt/tree-app/logs/app-*.log    # 應用程式日誌 (PM2)
```

---

## 資料庫

### 主要資料表

```
tree_survey              # 樹木調查主表
tree_species             # 樹種資料
project_areas            # 專案區域
project_boundaries       # 專案邊界 (PostGIS)
project_members          # 專案成員
pending_tree_measurements # V3 測量任務
tree_images              # 樹木影像
ml_training_batches      # ML 訓練數據批次
ml_training_records      # ML 訓練數據記錄
audit_logs               # 審計日誌
login_attempts           # 登入嘗試記錄
```

### 遷移

啟動時自動執行 `scripts/migrate.js`。手動執行：

```bash
node scripts/migrate.js
```

### 備份與還原

```bash
# 備份
/opt/tree-app/scripts/backup_db.sh

# 還原
pg_restore -U tree_app -d tree_survey --clean /opt/tree-app/backups/<file>.dump
```

---

## 測試

```bash
npm test                    # 所有測試
npm run test:intent         # 意圖分類
npm run test:sql            # SQL 安全驗證
npm run test:integration    # Chat API 整合
npm run test:api            # API 整合
```

185+ 測試案例，涵蓋意圖分類、SQL 注入防護、API 整合、安全審計。

---

## 版本紀錄

完整版本紀錄請見 [CHANGELOG.md](CHANGELOG.md)。

### 主要版本

| 版本 | 日期 | 重點 |
|------|------|------|
| 18.5 | 2026-03-10 | 自架部署 + 自動部署 + 回滾機制 |
| 18.4 | 2026-02-22 | Depth Pro + OpenVINO 整合 |
| 18.3 | 2025-12-14 | 安全性 Phase 4 + 回歸測試 |
| 18.0 | 2025-12-03 | ID 修復 + ML 訓練數據 API |
| 16.0 | 2025-12-02 | OpenAI 兼容性修復 |
| 15.0 | 2025-12-02 | 樹種辨識 API + Text-to-SQL 優化 |

---

## 授權

ISC License

## 聯絡

- GitHub: [@KyleliuNDHU](https://github.com/KyleliuNDHU)
- 專案: [tree-project-backend](https://github.com/KyleliuNDHU/tree-project-backend)