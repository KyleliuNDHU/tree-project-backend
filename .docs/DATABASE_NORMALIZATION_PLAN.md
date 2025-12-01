# 📊 資料庫正規化計畫

> **狀態**: 📋 規劃中（尚未實施）  
> **建立日期**: 2024-12-02  
> **優先級**: 低（系統目前運作正常）  
> **風險評估**: 需謹慎，涉及核心資料表

---

## 📋 目錄

- [現狀分析](#現狀分析)
- [問題識別](#問題識別)
- [正規化目標](#正規化目標)
- [實施計畫](#實施計畫)
- [兼容性策略](#兼容性策略)
- [測試清單](#測試清單)
- [回滾方案](#回滾方案)

---

## 現狀分析

### 目前資料庫架構圖

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           tree_survey (主表)                             │
├─────────────────────────────────────────────────────────────────────────┤
│ id                    SERIAL PRIMARY KEY                                │
│ ─────────────────────────────────────────────────────────────────────── │
│ 【區位相關 - 有冗餘】                                                     │
│ project_location      VARCHAR(255)    ← 直接存區位名稱 (如 "高雄港")      │
│                                                                         │
│ 【專案相關 - 部分正規化】                                                  │
│ project_code          VARCHAR(50)     ← 直接存專案代碼                   │
│ project_name          VARCHAR(255)    ← 直接存專案名稱                   │
│ project_id            INTEGER FK      ← ✅ 已有 FK 指向 projects.id     │
│                                                                         │
│ 【樹種相關 - 有冗餘】                                                     │
│ species_id            VARCHAR(20)     ← 字串，非真正的 FK                │
│ species_name          VARCHAR(100)    ← 直接存樹種名稱                   │
│                                                                         │
│ 【其他欄位】                                                              │
│ system_tree_id, x_coord, y_coord, dbh_cm, tree_height_m, ...           │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │ project_id (FK) - 有 Trigger 自動同步
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           projects (已建立)                              │
├─────────────────────────────────────────────────────────────────────────┤
│ id              SERIAL PRIMARY KEY                                      │
│ project_code    VARCHAR(50) UNIQUE                                      │
│ name            VARCHAR(255)           ← 應對應 tree_survey.project_name │
│ area_id         INTEGER FK             ← 指向 project_areas.id          │
│ description     TEXT                                                    │
│ is_active       BOOLEAN                                                 │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │ area_id (FK)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        project_areas (已建立)                            │
├─────────────────────────────────────────────────────────────────────────┤
│ id              SERIAL PRIMARY KEY                                      │
│ area_name       VARCHAR(50) UNIQUE     ← 對應 tree_survey.project_location│
│ area_code       VARCHAR(10) UNIQUE     ← 如 "AREA-009"                  │
│ city            VARCHAR(20)            ← 所屬縣市                        │
│ center_lat      DOUBLE PRECISION                                        │
│ center_lng      DOUBLE PRECISION                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        tree_species (已建立)                             │
├─────────────────────────────────────────────────────────────────────────┤
│ id              SERIAL PRIMARY KEY                                      │
│ species_id      VARCHAR(20) UNIQUE     ← 目前 tree_survey 存的是這個字串 │
│ common_name     VARCHAR(100)                                            │
│ scientific_name VARCHAR(150)                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 現有正規化機制

#### ✅ 已實施：project_id 自動同步 Trigger

檔案位置：`database/initial_data/01_sync_project_id_trigger.sql`

```sql
-- 當 INSERT/UPDATE tree_survey 時：
-- 1. 若 project_code 存在，查找對應的 projects.id
-- 2. 若 projects 中不存在該 code，自動建立新 project 記錄
-- 3. 設定 tree_survey.project_id
```

**效果**：新增樹木調查時，`project_id` 會自動關聯到 `projects` 表

#### ✅ 已實施：tree_survey_with_areas View

檔案位置：`database/initial_data/tree_survey_with_areas.pg.sql`

```sql
-- 透過 LEFT JOIN 關聯區位資訊
-- 但這是「讀取時」JOIN，不是真正的 FK 約束
```

---

## 問題識別

### 🔴 高優先級問題

| 問題 | 影響 | 嚴重度 |
|------|------|--------|
| 無 | 目前系統運作正常 | - |

### 🟡 中優先級問題（資料一致性風險）

| 問題 | 情境 | 影響 |
|------|------|------|
| `project_location` 無 FK | 若 `project_areas.area_name` 被修改 | `tree_survey` 中的舊名稱不會更新 |
| `project_name` 不同步 | 若 `projects.name` 被修改 | `tree_survey.project_name` 維持舊值 |
| `species_name` 冗餘 | 若樹種名稱需要更正 | 需要更新所有 `tree_survey` 記錄 |

### 🟢 低優先級問題（僅影響效能/維護性）

| 問題 | 說明 |
|------|------|
| 儲存空間浪費 | 重複儲存相同字串 |
| 查詢效能 | 字串比對比 ID 比對慢（但資料量小時無感） |

---

## 正規化目標

### 理想的 2NF/3NF 結構

```
tree_survey (正規化後)
├── id
├── project_id      FK → projects.id      (取代 project_code, project_name)
├── area_id         FK → project_areas.id (取代 project_location)  [NEW]
├── species_ref_id  FK → tree_species.id  (取代 species_id, species_name) [NEW]
└── ... (其他欄位保持不變)

透過 JOIN 取得：
- project_code, project_name → FROM projects
- project_location (area_name), city → FROM project_areas
- species_name, scientific_name → FROM tree_species
```

---

## 實施計畫

### Phase 0: 準備階段（必要）

**預計時間**: 2-4 小時  
**風險**: 無

- [ ] 備份生產資料庫
- [ ] 在 staging 環境測試所有變更
- [ ] 確認所有 Controller/Route 的 SELECT 查詢

### Phase 1: Area 正規化

**預計時間**: 4-6 小時  
**風險**: 低  
**前置條件**: Phase 0 完成

#### Step 1.1: 新增 area_id 欄位（無破壞性）

```sql
-- 檔案: database/initial_data/03_area_normalization.pg.sql

-- 1. 新增欄位（不影響現有資料）
ALTER TABLE tree_survey 
ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES project_areas(id) ON DELETE SET NULL;

-- 2. 建立索引
CREATE INDEX IF NOT EXISTS idx_tree_survey_area_id ON tree_survey(area_id);
```

#### Step 1.2: 建立同步 Trigger

```sql
-- 當 project_location 變更時，自動更新 area_id
CREATE OR REPLACE FUNCTION sync_tree_survey_area_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_location IS NOT NULL AND 
       (NEW.area_id IS NULL OR NEW.project_location IS DISTINCT FROM OLD.project_location) THEN
        SELECT id INTO NEW.area_id 
        FROM project_areas 
        WHERE area_name = NEW.project_location 
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_area_id
BEFORE INSERT OR UPDATE ON tree_survey
FOR EACH ROW
EXECUTE FUNCTION sync_tree_survey_area_id();
```

#### Step 1.3: 回填現有資料

```sql
-- 一次性更新（安全，可重複執行）
UPDATE tree_survey ts
SET area_id = pa.id
FROM project_areas pa
WHERE ts.project_location = pa.area_name
AND ts.area_id IS NULL;
```

#### Step 1.4: 驗證

```sql
-- 檢查是否所有 project_location 都有對應的 area_id
SELECT project_location, COUNT(*) 
FROM tree_survey 
WHERE area_id IS NULL AND project_location IS NOT NULL
GROUP BY project_location;
-- 預期結果：0 筆（或是未知區位名稱）
```

### Phase 2: Project Name 雙向同步

**預計時間**: 2-3 小時  
**風險**: 低-中  
**前置條件**: Phase 1 完成

#### Step 2.1: 強化現有 Trigger

```sql
-- 修改 sync_tree_survey_project_id() 函數
-- 當 tree_survey.project_name 變更時，同步更新 projects.name

-- 新增：反向同步 Trigger（在 projects 表上）
CREATE OR REPLACE FUNCTION sync_project_name_to_survey()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE tree_survey 
        SET project_name = NEW.name 
        WHERE project_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_project_name
AFTER UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION sync_project_name_to_survey();
```

### Phase 3: Species 正規化（選擇性）

**預計時間**: 6-8 小時  
**風險**: 中  
**前置條件**: Phase 2 完成，充分測試

> ⚠️ 此階段影響較大，建議在有充足時間時執行

```sql
-- 新增 species_ref_id FK
ALTER TABLE tree_survey 
ADD COLUMN IF NOT EXISTS species_ref_id INTEGER REFERENCES tree_species(id);

-- Trigger 同步
-- ... (類似 area_id 的實作)
```

### Phase 4: 應用層兼容（最重要）

**預計時間**: 4-6 小時  
**風險**: 中  

#### 4.1 建立兼容 View

```sql
-- 應用層使用這個 View，底層結構變更對前端透明
CREATE OR REPLACE VIEW v_tree_survey AS
SELECT 
    ts.id,
    ts.system_tree_id,
    ts.project_tree_id,
    
    -- 區位：優先使用正規化欄位
    COALESCE(pa.area_name, ts.project_location) AS project_location,
    ts.area_id,
    pa.area_code,
    pa.city,
    
    -- 專案：優先使用正規化欄位
    COALESCE(p.project_code, ts.project_code) AS project_code,
    COALESCE(p.name, ts.project_name) AS project_name,
    ts.project_id,
    
    -- 樹種：保持現狀
    ts.species_id,
    ts.species_name,
    
    -- 其他欄位
    ts.x_coord, ts.y_coord,
    ts.tree_height_m, ts.dbh_cm,
    ts.status, ts.notes,
    ts.carbon_storage, ts.carbon_sequestration_per_year,
    ts.survey_time, ts.created_at, ts.updated_at
FROM tree_survey ts
LEFT JOIN project_areas pa ON ts.area_id = pa.id
LEFT JOIN projects p ON ts.project_id = p.id;
```

#### 4.2 修改 Controller（可選）

將 SELECT 查詢改為從 `v_tree_survey` 讀取：

```javascript
// Before
const result = await pool.query('SELECT * FROM tree_survey WHERE ...');

// After (兼容版本)
const result = await pool.query('SELECT * FROM v_tree_survey WHERE ...');
```

---

## 兼容性策略

### 原則：不破壞現有功能

1. **新增欄位，不刪除舊欄位**
   - `area_id` 是新增的，`project_location` 保留
   - 兩者透過 Trigger 保持同步

2. **Trigger 自動處理**
   - 應用層程式碼不需修改
   - 無論寫入 `project_location` 或 `area_id`，系統都能正確處理

3. **View 作為抽象層**
   - 應用層從 View 讀取
   - 底層表結構變更對上層透明

4. **漸進式遷移**
   - 每個 Phase 獨立執行
   - 任何階段出問題可以停止

### 需要修改的檔案清單

執行 Phase 1-4 後，**理論上不需要**修改應用層程式碼。

但若要完全利用正規化優勢，可考慮修改：

| 檔案 | 修改內容 | 優先級 |
|------|----------|--------|
| `controllers/treeSurveyCreateController.js` | 改用 `area_id` 而非 `project_location` | 低 |
| `controllers/treeSurveyUpdateController.js` | 同上 | 低 |
| `services/sqlQueryService.js` | Schema 說明更新 | 低 |
| `routes/treeSurvey.js` | 無需修改（Trigger 處理） | - |

---

## 測試清單

### Phase 1 測試項目

- [ ] 新增樹木調查，確認 `area_id` 自動設定
- [ ] 更新樹木調查的 `project_location`，確認 `area_id` 跟著更新
- [ ] 查詢 `tree_survey_with_areas` View，確認資料正確
- [ ] AI 聊天功能正常（SQL 查詢不受影響）
- [ ] 報表匯出功能正常
- [ ] 地圖顯示功能正常

### 回歸測試

- [ ] `GET /api/tree_survey` - 列表正常
- [ ] `GET /api/tree_survey/map` - 地圖資料正常
- [ ] `POST /api/tree_survey` - 新增正常
- [ ] `PUT /api/tree_survey/:id` - 更新正常
- [ ] `POST /api/chat` - AI 聊天正常
- [ ] `GET /api/export/excel` - 匯出正常

---

## 回滾方案

### Phase 1 回滾

```sql
-- 移除 Trigger
DROP TRIGGER IF EXISTS trigger_sync_area_id ON tree_survey;
DROP FUNCTION IF EXISTS sync_tree_survey_area_id();

-- 移除欄位（資料會遺失，但原本的 project_location 還在）
ALTER TABLE tree_survey DROP COLUMN IF EXISTS area_id;
```

### 完整回滾

```sql
-- 移除所有新增的 Trigger 和欄位
-- 系統會回到純字串儲存的狀態
-- 不影響現有資料（因為舊欄位從未刪除）
```

---

## 結論與建議

### 📌 現狀評估

**目前系統穩定運作中，不急需正規化。**

現有的 `01_sync_project_id_trigger.sql` 已經處理了 `project_id` 的同步，這是最重要的部分。

### 📌 建議執行時機

| 情境 | 建議 |
|------|------|
| 系統正常運作 | **不要動** |
| 有新功能需要區位/專案關聯 | 考慮 Phase 1 |
| 進行大型重構 | 可以執行完整計畫 |
| 效能問題 | 先檢查是否真的是 DB 問題 |

### 📌 最小可行方案

如果未來要做，建議只做 **Phase 1（Area 正規化）**：
- 風險最低
- 效益明顯（區位資料一致性）
- 不影響現有功能

---

## 附錄：相關檔案位置

```
backend/
├── database/initial_data/
│   ├── 00_normalization_schema.pg.sql   # projects 表 + project_id 欄位
│   ├── 01_sync_project_id_trigger.sql   # project_id 同步 Trigger
│   ├── 02_area_normalization.pg.sql     # (空檔案，預留給 Phase 1)
│   ├── project_areas.pg.sql             # 區位資料
│   ├── tree_survey.pg.sql               # 主表結構
│   └── tree_survey_with_areas.pg.sql    # 關聯 View
│
├── scripts/migrate.js                    # 資料庫遷移腳本
│
└── .docs/
    └── DATABASE_NORMALIZATION_PLAN.md   # 本文件
```

---

*最後更新：2024-12-02*
