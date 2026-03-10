# Changelog

所有主要版本變更記錄。

---

## v18.5.0 (2026-03-10) - Self-Hosted Deployment & Auto-Deploy

### 自架伺服器部署
- 完整自架部署系統 — 從 Render 遷移至雙機自架架構
- Ubuntu (i3-8130U) 運行 Node.js Backend + PostgreSQL
- Windows (Core Ultra 5) 運行 ML Service (Depth Pro + SAM 2.1)
- PM2 cluster mode (2 instances) + systemd auto-start
- Nginx reverse proxy with self-signed TLS

### 自動部署與回滾
- GitHub Webhook 自動部署 (`POST /webhook/deploy`，HMAC-SHA256)
- Health check 失敗自動 rollback
- `scripts/deploy.sh` — 自動部署（支援 `--skip-migrate`、`--dry-run`）
- `scripts/rollback.sh` — 回滾到任意 commit
- `scripts/backup_db.sh` — PostgreSQL 備份（cron 每天 3:00）
- `scripts/health_check.sh` — 健康檢查（cron 每 5 分鐘）

### 變更檔案
| 類型 | 檔案 | 說明 |
|------|------|------|
| feat | `routes/webhook.js` | GitHub Webhook 自動部署路由 |
| feat | `scripts/deploy.sh` | 自動部署腳本 (含 rollback) |
| feat | `scripts/rollback.sh` | 手動回滾腳本 |
| feat | `scripts/backup_db.sh` | 資料庫備份腳本 |
| feat | `scripts/health_check.sh` | 健康檢查腳本 |
| feat | `ecosystem.config.js` | PM2 cluster 設定檔 |
| chore | `app.js` | 掛載 webhook 路由 (JWT 之外) |

---

## v18.4.0 (2026-02-22) - ML Precision Upgrade & Backend Stabilization

### ML 模型升級
- Depth Pro 與 OpenVINO 整合 — SOTA 深度預測模型
- EXIF 焦距提取與亞像素精度計算
- 多鏡頭融合提升測量穩定度
- `setup_models.py` 自動下載與轉換 OpenVINO 模型

### 後端穩定性
- 增強輸入驗證與錯誤清理
- NumPy 向量化運算提升處理效能
- 修正資料表初始化順序
- `pending_measurements` 新增 `project_area`、`project_code`、`project_name` 支援

### 開發工具
- ngrok header bypass、`start.ps1` 啟動腳本

---

## v18.3.2 (2025-12-14) - 清理 API 使用改進

- 前端退出未提交時自動清理未使用的專案區位和樹種
- `POST /api/project_areas/cleanup` 清理 API
- `DELETE /api/project_areas/:id`、`DELETE /api/projects/:code`

---

## v18.3.0 (2025-12-14) - Phase 4 安全性完成

### 安全性增強
- `projectAuth` 中間件 — 專案權限控管
- 登入失敗監控 — 5 次失敗鎖定 30 分鐘
- 審計日誌系統 — 記錄所有資料修改操作

### 新功能
- 樹種管理 API (`POST /api/tree_species`)
- 樹木影像 API (`POST/GET/DELETE /api/tree_images`)
- 完整回歸測試套件 — 32+ 項自動化測試

### 資料庫變更
- 新增表格：`project_members`、`login_attempts`、`audit_logs`、`tree_images`

---

## v18.0.0 (2025-12-03) - ID 修復與 ML 訓練數據收集

- 修復新專案第一筆樹木 ID 從 PT-2 開始的問題（改用 PT-0 佔位）
- ML 訓練數據收集 API（`/api/ml-training/batch`、`/statistics`、`/export`、`/analysis`）
- 支援 6 種記錄類型：AR測量、樹種辨識、碳儲量、座標、樹高、冠幅

---

## v16.0.1 (2025-12-02) - 錯誤修復

- OpenAI API 兼容性 — `getTokenLimitParams()` 支援 o1/o3 系列
- multer 圖片上傳錯誤處理改進

---

## v15.0.0 (2025-12-02) - 重大更新

- 樹種辨識 API — Pl@ntNet + GBIF + iNaturalist 三合一
- Text-to-SQL 查詢準確度優化
