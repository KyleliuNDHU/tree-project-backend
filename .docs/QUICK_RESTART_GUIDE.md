# 🚀 考試後快速重啟開發指南

> **適用時機**: 研究所考試結束後，準備繼續開發 TreeAI  
> **預計閱讀時間**: 5 分鐘  
> **目標**: 快速回到開發狀態

---

## 📋 第一步: 環境檢查 (5分鐘)

### 1. 拉取最新代碼
```bash
cd ~/project_code/tree-project-backend
git pull origin main

cd ~/project_code/tree-project-frontend
git pull origin main
```

### 2. 檢查 Render 部署狀態
```bash
# 訪問健康檢查端點
curl https://tree-app-backend-prod.onrender.com/health

# 應該回傳: OK
```

### 3. 執行回歸測試
```bash
cd ~/project_code/tree-project-backend
npm run test:regression

# 預期: 20+ 項測試通過
# 如果有失敗，先不用擔心，可能是測試帳號問題
```

---

## 📖 第二步: 快速複習 (10分鐘)

### 閱讀順序
1. **本文件** (你正在讀) - 快速重啟
2. **`DEVELOPMENT_STATUS_AND_TODO.md`** - 完整狀態與待辦清單
3. **`MASTER_PLAN.md`** - 總體進度
4. **`PHASE_4_COMPLETION_SUMMARY.md`** - 上次完成的內容

### 核心重點
- ✅ Phase 1-4 核心功能已完成 (98%)
- ✅ JWT 認證、權限控管、審計日誌都已上線
- ✅ V3 功能已建立但需要改進 AR 測量
- ❌ 剩餘工作主要是 UX 改進和細節優化

---

## 🎯 第三步: 選擇任務 (5分鐘)

### 推薦優先順序

#### 🔴 高優先級 (直接影響使用體驗)
1. **AR 測量 130cm 位置引導**
   - 檔案: `lib/screens/ar_dbh_measurement_page.dart`
   - 預計時間: 4-6 小時
   - 難度: 中

2. **AR 測量時重新定位並計算距離**
   - 檔案: `lib/screens/v3/integrated_tree_form_page.dart`
   - 預計時間: 2-3 小時
   - 難度: 低

3. **新增頁面加入測量功能**
   - 檔案: `lib/screens/v3/manual_input_page_v3.dart`
   - 預計時間: 1-2 小時
   - 難度: 低

#### 🟡 中優先級 (改善功能完整性)
4. **影像瀏覽 UI**
   - 新建: `lib/screens/tree_images_gallery_page.dart`
   - 預計時間: 3-4 小時
   - 難度: 中

5. **優化專案輸入速度**
   - 檔案: `lib/services/project_service.dart`
   - 預計時間: 1-2 小時
   - 難度: 低

#### 🟢 低優先級 (錦上添花)
6. **刪除專案功能**
7. **新增樹種對話框 UI**
8. **新增按鈕位置微調**

---

## 🛠️ 第四步: 開始開發

### 範例: 實作 AR 130cm 位置引導

#### 1. 閱讀相關檔案
```bash
# 打開相關檔案
code lib/screens/ar_dbh_measurement_page.dart
code lib/services/ar_measurement_service.dart
```

#### 2. 規劃工作
建立 Todo List:
- [ ] 研究 ARKit/ARCore 垂直距離測量 API
- [ ] 實作地面平面偵測
- [ ] 實作 130cm 標記顯示
- [ ] 實作測量員位置引導
- [ ] 測試驗證

#### 3. 小步迭代
- 一次只改一個功能
- 改完立即測試
- 通過後再繼續

#### 4. 更新文件
完成後更新:
- `MASTER_PLAN.md` - 標記完成
- `DEVELOPMENT_STATUS_AND_TODO.md` - 移除待辦項目

---

## 🧪 測試流程

### 本地測試
```bash
# 1. 啟動本地 server
cd tree-project-backend
npm run dev

# 2. 執行測試
npm run test:regression:local
```

### 遠端測試
```bash
# 測試 Render 環境
npm run test:regression
```

### 手機測試
1. 燒錄新 APK
2. 安裝到手機
3. 執行「待測試項目」清單

---

## 📞 需要幫助時

### 查看文件
- **功能不確定**: 看 `V3_DEVELOPMENT_PLAN.md`
- **API 不確定**: 看 `DEVELOPMENT_PLAN.md`
- **工作流程**: 看 `WORKFLOW_RULES.md`

### 查看代碼
- **前端服務**: `lib/services/`
- **V3 功能**: `lib/screens/v3/`
- **後端 API**: `routes/`
- **中間件**: `middleware/`

### 查看測試
- **回歸測試**: `tests/regression.test.js`
- **測試說明**: `tests/README.md`

---

## ⚡ 快速指令參考

### Git
```bash
# 查看狀態
git status

# 提交更新
git add -A
git commit -m "feat: 功能描述"
git push origin main

# 查看最近提交
git log --oneline -10
```

### 測試
```bash
# 完整測試
npm run test:regression

# 只測試認證
node tests/regression.test.js --section=auth

# 只測試樹木
node tests/regression.test.js --section=tree

# 詳細模式
npm run test:regression:verbose
```

### 部署
```bash
# Backend 推送後自動部署到 Render
cd tree-project-backend
git push origin main

# 等待 2-3 分鐘後測試
npm run test:regression
```

---

## 🎯 目標設定建議

### 短期目標 (1週)
- [ ] 完成 AR 測量 130cm 引導
- [ ] 完成測量時重新定位
- [ ] 新增頁面加入測量功能

### 中期目標 (2週)
- [ ] 完成影像瀏覽 UI
- [ ] 優化專案輸入速度
- [ ] 實地測試所有功能

### 長期目標 (1個月)
- [ ] 所有待辦項目完成
- [ ] 撰寫使用者手冊
- [ ] 準備論文數據

---

**準備好了嗎？開始開發吧！** 💪

記住：
1. 小步迭代
2. 充分測試
3. 保持兼容
4. 更新文件

祝開發順利！🌲
