# 🌲 TreeAI 產品發展藍圖

> **文件狀態**: 📋 規劃中  
> **建立日期**: 2025-12-02  
> **目標**: 打造環境學院專用的智慧樹木碳匯數據收集與分析平台

---

## 📋 目錄

- [產品願景](#產品願景)
- [核心價值主張](#核心價值主張)
- [功能規劃藍圖](#功能規劃藍圖)
- [Phase 1：影像功能強化](#phase-1影像功能強化-近期)
- [Phase 2：AI 碳匯估算](#phase-2ai-碳匯估算-中期)
- [Phase 3：環境學院特化功能](#phase-3環境學院特化功能-長期)
- [技術研究：影像碳匯估算模型](#技術研究影像碳匯估算模型)
- [資料收集優化策略](#資料收集優化策略)
- [開發優先級與資源分配](#開發優先級與資源分配)

---

## 產品願景

### 📍 定位

**TreeAI 是一個專為環境科學研究設計的樹木碳匯數據收集平台**，核心目標是：

1. **降低數據收集門檻** - 讓非專業人員也能收集高品質的樹木調查數據
2. **提升碳匯估算準確度** - 結合 AI 與傳統生態學方法
3. **建立可追溯的數據資產** - 為長期研究提供可信賴的數據基礎

### 🎯 目標用戶

| 用戶類型 | 使用場景 | 痛點 |
|----------|----------|------|
| **現場調查員** | 港區實地調查 | 手動記錄耗時、容易出錯 |
| **環境學院研究生** | 碳匯研究、論文數據 | 缺乏大量高品質訓練數據 |
| **TIPC 管理人員** | 永續報告、ESG 合規 | 需要可驗證的碳匯數據 |
| **生態學教授** | 教學、研究 | 需要便捷的數據分析工具 |

### 🌟 差異化優勢

```
傳統樹木調查 APP        TreeAI
─────────────────       ─────────────────
手動輸入所有數據    →    影像 AI 輔助測量
單純的資料記錄      →    即時碳匯估算
分散的數據管理      →    Text-to-SQL 智慧查詢
靜態報表           →    AI 生成分析報告
```

---

## 核心價值主張

### 💎 一句話價值

> **「拍一張照片，AI 幫你估算碳匯」**

### 📊 量化目標

| 指標 | 目前 | Phase 1 後 | Phase 2 後 |
|------|------|------------|------------|
| 單棵樹調查時間 | 5-10 分鐘 | 3-5 分鐘 | 1-2 分鐘 |
| 碳匯估算準確度 | ±30% | ±25% | ±15% |
| 數據完整度 | 70% | 85% | 95% |
| 影像資料覆蓋率 | ~10% | 100% | 100% |

---

## 功能規劃藍圖

### 🗺️ 整體時程

```
2025 Q1          2025 Q2          2025 Q3          2025 Q4
─────────────────────────────────────────────────────────────
Phase 1          Phase 2          Phase 3
影像功能強化      AI 碳匯估算       環境學院特化
─────────────────────────────────────────────────────────────
[圖片上傳]       [DBH 估算]       [研究數據匯出]
[圖片預覽]       [樹高估算]       [學術報告生成]
[圖片管理]       [碳匯計算]       [多校協作]
[本地儲存]       [DeepForest整合]  [教學模組]
```

---

## Phase 1：影像功能強化（近期）

### 🎯 目標

讓每一筆樹木調查都有對應的影像紀錄，建立完整的視覺化數據資產。

### 📦 功能清單

#### 1.1 影像上傳與儲存

```
優先級：🔴 高
開發時間：2-3 週
```

**需求說明：**
- 支援拍照或從相簿選取
- 每棵樹支援多張照片（全景、樹幹、樹冠、特寫）
- 照片自動加上 GPS 座標與時間戳記
- 本地暫存 + 雲端備份機制

**資料庫變更：**
```sql
-- 新增圖片表
CREATE TABLE tree_images (
    id SERIAL PRIMARY KEY,
    tree_survey_id INTEGER REFERENCES tree_survey(id) ON DELETE CASCADE,
    image_type VARCHAR(20), -- 'full', 'trunk', 'canopy', 'detail'
    storage_url VARCHAR(500), -- 雲端儲存 URL
    local_path VARCHAR(500),  -- 本地路徑
    file_size_kb INTEGER,
    width_px INTEGER,
    height_px INTEGER,
    captured_at TIMESTAMP,
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 擴展 tree_survey
ALTER TABLE tree_survey ADD COLUMN has_images BOOLEAN DEFAULT FALSE;
ALTER TABLE tree_survey ADD COLUMN image_count INTEGER DEFAULT 0;
```

**Frontend 修改：**
```dart
// lib/screens/tree_input_page_v2.dart
// 新增 ImagePicker 區塊
// 顯示圖片縮圖網格
// 支援刪除與重拍
```

#### 1.2 影像瀏覽與管理

```
優先級：🟡 中
開發時間：1-2 週
```

**功能：**
- 在樹木詳情頁顯示所有圖片
- 圖片輪播檢視
- 全螢幕預覽
- 圖片下載

#### 1.3 雲端儲存整合

```
優先級：🟡 中
開發時間：1 週
```

**選項評估：**

| 服務 | 優點 | 缺點 | 成本估計 |
|------|------|------|----------|
| **AWS S3** | 穩定、便宜 | 需要 AWS 帳號 | ~$5/月 |
| **Cloudinary** | 免費額度、圖片處理 | 免費有限制 | 免費-$50/月 |
| **Firebase Storage** | 整合方便 | Google 綁定 | 免費-$25/月 |
| **Supabase Storage** | 與 PostgreSQL 整合 | 較新 | 免費-$25/月 |

**建議**：先用 **Cloudinary**（免費額度足夠測試），後期評估 S3。

#### 1.4 離線支援

```
優先級：🟢 低
開發時間：2 週
```

**功能：**
- 離線時照片存本地
- 網路恢復後自動同步
- 同步狀態指示器

### 📊 Phase 1 驗收標準

- [ ] 可以在新增/編輯樹木時上傳多張照片
- [ ] 照片自動附加 GPS 與時間戳記
- [ ] 可以在樹木詳情頁瀏覽照片
- [ ] 照片正確儲存到雲端
- [ ] 現有功能不受影響

---

## Phase 2：AI 碳匯估算（中期）

### 🎯 目標

利用深度學習模型，從影像自動估算樹木的 DBH（胸徑）與樹高，並計算碳匯。

### 🔬 技術研究總結

#### 目前可用的 AI 模型

| 模型/工具 | 功能 | 適用場景 | 成熟度 |
|-----------|------|----------|--------|
| **DeepForest** | 空拍影像樹冠偵測 | 區域樹木計數 | ⭐⭐⭐⭐⭐ |
| **YOLOv8/v9** | 通用物件偵測 | 樹幹定位 | ⭐⭐⭐⭐ |
| **Detectron2** | 實例分割 | 樹冠邊界 | ⭐⭐⭐⭐ |
| **SAM 3** | 通用分割 | 交互式標註 | ⭐⭐⭐⭐ |
| **自訓練模型** | DBH/樹高估算 | 客製化需求 | ⭐⭐ |

#### 碳匯估算科學基礎：異速生長方程式 (Allometric Equations)

樹木的生物量（進而計算碳儲量）可以透過測量 **DBH（胸徑）** 和 **樹高** 來估算：

**通用公式：**
```
Biomass = a × DBH^b × Height^c

其中：
- a, b, c 為樹種特定參數
- DBH 以公分為單位
- Height 以公尺為單位
- Biomass 為乾重生物量（公斤）
```

**碳儲量計算：**
```
Carbon Storage = Biomass × 0.5  （假設碳含量約 50%）
CO2 Equivalent = Carbon Storage × 3.67
```

**台灣常見樹種參數範例（需驗證）：**

| 樹種 | a | b | c | 資料來源 |
|------|---|---|---|----------|
| 榕樹 | 0.042 | 2.41 | 0.62 | 林試所 |
| 樟樹 | 0.038 | 2.38 | 0.70 | 林試所 |
| 相思樹 | 0.035 | 2.45 | 0.58 | TFRI |
| 一般闊葉樹 | 0.040 | 2.40 | 0.65 | IPCC 預設 |

### 📦 功能清單

#### 2.1 影像 DBH 估算

```
優先級：🔴 高
開發時間：4-6 週
```

**技術方案：**

**方案 A：參照物法（推薦）**
- 用戶在照片中放置已知尺寸的參照物（如卡片、尺）
- AI 偵測參照物並計算比例
- 估算樹幹直徑

**方案 B：深度估測法**
- 需要雙鏡頭手機或 LiDAR
- 直接計算距離與尺寸
- 準確但設備限制大

**方案 C：訓練專用模型**
- 收集標註數據
- Fine-tune 現有模型
- 長期最準確但前期成本高

**建議路徑：** A → C（先用參照物法快速上線，同時收集數據訓練專用模型）

**實作細節：**
```python
# Backend: services/imageAnalysisService.js
# 1. 接收圖片
# 2. 偵測參照物（卡片/尺）
# 3. 計算像素與實際尺寸的比例
# 4. 偵測樹幹輪廓
# 5. 計算 DBH

# 使用技術：
# - OpenCV 邊緣偵測
# - YOLO 物件偵測（參照物）
# - 或調用 Google Cloud Vision API
```

#### 2.2 樹高估算

```
優先級：🟡 中
開發時間：3-4 週
```

**方法：**

1. **仰角測量法**
   - 用戶站在已知距離
   - App 測量仰角（手機陀螺儀）
   - 計算樹高 = 距離 × tan(角度) + 眼高

2. **相對比例法**
   - 已知 DBH 後，使用樹種特定的 DBH-Height 關係
   - 準確度較低但方便

#### 2.3 碳匯自動計算

```
優先級：🔴 高
開發時間：1-2 週
```

**功能：**
- 輸入/AI估算 DBH 和樹高後自動計算
- 顯示碳儲量、年碳吸收量
- 換算成 CO2 當量
- 視覺化呈現（樹木 vs 汽車排放比較）

**整合現有碳匯服務：**
```javascript
// services/carbonSinkService.js
// 現有公式優化
// 加入更多樹種參數
// 支援不確定性估算
```

#### 2.4 DeepForest 空拍整合（選用）

```
優先級：🟢 低（需要空拍數據）
開發時間：4-6 週
```

**功能：**
- 上傳港區空拍圖
- 自動偵測所有樹冠
- 估算樹冠覆蓋率
- 批次建立樹木調查記錄

**使用場景：**
- 新港區快速普查
- 年度樹木變化分析

### 📊 Phase 2 驗收標準

- [ ] 拍攝樹幹照片可自動估算 DBH（誤差 ±20%）
- [ ] 整合樹高估算功能
- [ ] 自動計算並顯示碳匯數據
- [ ] 提供估算的信心區間
- [ ] 支援手動修正 AI 估算值

---

## Phase 3：環境學院特化功能（長期）

### 🎯 目標

讓 TreeAI 成為環境學院研究與教學的標準工具。

### 📦 功能清單

#### 3.1 研究數據匯出

```
優先級：🔴 高
開發時間：2-3 週
```

**功能：**
- 匯出為學術格式（CSV、R data frame、Python pickle）
- 自動生成數據描述（metadata）
- 支援數據引用格式

**匯出格式範例：**
```csv
# TreeAI Export - 2025-01-15
# Project: 高雄港碳匯調查
# Contact: xxx@mail.ndhu.edu.tw
# License: CC BY 4.0
# Citation: TreeAI Database (2025). National Dong Hwa University.

tree_id,species,dbh_cm,height_m,carbon_kg,lat,lng,survey_date,confidence
T-001,Ficus microcarpa,45.2,12.3,234.5,22.6145,120.2867,2025-01-10,0.85
...
```

#### 3.2 AI 學術報告生成

```
優先級：🟡 中
開發時間：3-4 週
```

**功能：**
- 自動生成研究報告草稿
- 包含統計分析、圖表、結論
- 支援中英文

**報告結構：**
```markdown
# 高雄港樹木碳匯調查報告

## 摘要
本研究調查了高雄港區 XXX 棵樹木...

## 研究方法
使用 TreeAI 行動應用程式收集數據...

## 結果
### 樹種分布
[自動生成圓餅圖]

### 碳匯統計
[自動生成表格與直方圖]

## 討論
...

## 參考文獻
[自動引用相關文獻]
```

#### 3.3 教學模組

```
優先級：🟢 低
開發時間：4-6 週
```

**功能：**
- 「學習模式」- 引導新手完成調查
- 互動式碳匯計算教學
- 測驗與認證

#### 3.4 多校協作平台

```
優先級：🟢 低
開發時間：6-8 週
```

**功能：**
- 不同學校的獨立專案空間
- 數據共享與權限管理
- 跨校數據比較

### 📊 Phase 3 驗收標準

- [ ] 可匯出學術標準格式數據
- [ ] 可生成基本研究報告
- [ ] 環境學院學生可獨立使用完成調查
- [ ] 支援至少 3 個學校的協作

---

## 技術研究：影像碳匯估算模型

### 🔍 目前市場上的解決方案

#### 1. DeepForest（強烈推薦）

**簡介：** Python 套件，專門用於空拍影像中的樹冠偵測。

**GitHub:** https://github.com/weecology/DeepForest

**特點：**
- 預訓練模型可直接使用
- 基於 PyTorch，可 fine-tune
- 學術界廣泛使用（被引用 600+ 次）
- 支援 RGB 和多光譜影像

**使用範例：**
```python
from deepforest import main
model = main.deepforest()
model.use_release()

# 預測
boxes = model.predict_image(path="forest_image.jpg")
# 輸出：每棵樹的 bounding box

# Fine-tune 自己的數據
model.config["epochs"] = 10
model.create_trainer()
model.trainer.fit(model, train_data)
```

**適用場景：**
- 港區空拍樹木計數
- 樹冠覆蓋率分析
- 年度樹木變化監測

#### 2. Detectree

**GitHub:** https://github.com/martibosch/detectree

**特點：**
- 樹冠像素分類
- 較輕量
- 適合城市綠化分析

#### 3. YOLOv8/v9 + 自訓練

**適用場景：**
- 地面拍攝的樹幹偵測
- 參照物偵測
- 需要標註自己的數據集

**訓練流程：**
```
1. 收集 500+ 張樹幹照片（含 DBH 標註）
2. 使用 Roboflow 或 CVAT 標註
3. Fine-tune YOLOv8
4. 部署到 API
```

#### 4. Vision API 服務

| 服務 | 功能 | 成本 |
|------|------|------|
| Google Cloud Vision | 物件偵測、OCR | $1.5/1000 張 |
| AWS Rekognition | 自訂標籤 | $1/1000 張 |
| Azure Custom Vision | 自訂模型 | $2/1000 張 |

### 🧪 建議的技術路線圖

```
Phase 2.1: 參照物 DBH 估算
├── 使用 YOLOv8 偵測卡片/尺
├── OpenCV 計算比例
└── 規則 based 樹幹直徑測量

Phase 2.2: 訓練專用模型
├── 收集 1000+ 標註數據
├── Fine-tune YOLOv8 
└── 部署為 API

Phase 2.3: DeepForest 整合
├── 支援空拍圖上傳
├── 批次樹木偵測
└── 與地面調查數據關聯
```

---

## 資料收集優化策略

### 📸 標準化影像收集協議

為確保收集到的影像可用於 AI 訓練，建議制定標準協議：

#### 樹幹照片規範

```
拍攝方式：
- 距離樹幹 2-3 公尺
- 相機與地面水平
- 包含完整的 1.3m 高度區域（DBH 測量位置）
- 放置 A4 紙或標準卡片作為參照物

照片命名：
{tree_id}_{type}_{sequence}.jpg
例如：T-001_trunk_01.jpg
```

#### 樹冠照片規範

```
拍攝方式：
- 從四個方向各拍一張
- 盡量包含完整樹冠邊界
- 避免逆光

照片命名：
{tree_id}_canopy_{direction}.jpg
例如：T-001_canopy_north.jpg
```

### 📊 數據品質保證

**在 App 內建品質檢查：**

```dart
// 拍照後自動檢查
class ImageQualityChecker {
  bool checkBlur();        // 模糊檢測
  bool checkBrightness();  // 亮度檢測
  bool hasReference();     // 參照物檢測
  bool isTreeInFrame();    // 樹木在畫面內
}
```

---

## 開發優先級與資源分配

### 📊 功能優先級矩陣

```
         高價值
            │
     P2.3   │   P1.1
    DeepForest│  影像上傳
            │
低急迫 ─────┼───── 高急迫
            │
     P3.4   │   P2.1
    多校協作 │  DBH 估算
            │
         低價值
```

### 🗓️ 建議開發順序

```
第一階段（1-2 個月）
├── P1.1 影像上傳 ⭐ 必做
├── P1.2 影像瀏覽
└── P1.3 雲端儲存

第二階段（2-3 個月）
├── P2.1 DBH 估算（參照物法）⭐ 核心功能
├── P2.2 樹高估算
└── P2.3 碳匯自動計算

第三階段（3-4 個月）
├── P3.1 研究數據匯出 ⭐ 對環境學院重要
├── P3.2 AI 報告生成
└── P2.4 DeepForest 整合（如果有空拍數據）

第四階段（遠期）
├── P3.3 教學模組
├── P3.4 多校協作
└── 專用 AI 模型訓練
```

### 💰 資源估算

| 項目 | 人力（人月） | 雲端成本（月） |
|------|-------------|---------------|
| Phase 1 | 1.5 | $10-30 |
| Phase 2 | 3-4 | $30-100 |
| Phase 3 | 2-3 | $50-150 |
| **總計** | **6.5-8.5** | **$90-280** |

---

## 附錄

### A. 相關學術資源

**碳匯計算：**
- IPCC Guidelines for National Greenhouse Gas Inventories
- 林業試驗所碳匯計算手冊
- Taiwan Forest Carbon Calculator

**AI/ML 模型：**
- DeepForest: https://deepforest.readthedocs.io/
- Detectree: https://github.com/martibosch/detectree
- Tree Crown Detection Survey: https://arxiv.org/abs/2401.04032

### B. 現有碳匯計算邏輯位置

```
Backend:
└── services/
    └── carbonSinkService.js (如果存在)
    
或直接在 Controller:
└── controllers/
    └── carbonSinkController.js

Frontend:
└── lib/services/
    └── carbon_sink_service.dart
```

### C. 資料庫相關文件

- `backend/.docs/DATABASE_NORMALIZATION_PLAN.md` - 正規化計畫
- `backend/database/initial_data/` - SQL 定義

---

## 下一步行動

### 立即可做（無需開發）

1. **定義影像收集規範** - 寫成 SOP 給調查員
2. **評估雲端儲存方案** - 申請試用帳號
3. **收集現有樹木照片** - 即使品質不一，也可作為初步數據

### 需要討論的決策

1. **雲端儲存選擇** - Cloudinary vs S3 vs Firebase？
2. **AI 模型託管** - 自架 vs 雲端 API？
3. **影像品質要求** - 寬鬆 vs 嚴格？
4. **Phase 2 的 DBH 估算方案** - 參照物法 vs 深度法？

---

*最後更新：2025-12-02*
*負責人：待指定*
