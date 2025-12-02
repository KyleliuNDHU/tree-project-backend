# Text-to-SQL 優化完成報告

## 📅 更新日期: 2025-01

---

## 1. 📊 Schema 資訊優化

### 改進內容
- 新增 **Few-Shot Examples**：提供 9 個完整的問答範例
- 更詳細的欄位說明和範例值
- 強調 `system_tree_id` 和 `project_tree_id` 是純數字字串
- 新增常見港口名稱列表

### Few-Shot 範例
```
Q: 高雄港有幾棵樹？
SQL: SELECT COUNT(*) as total FROM tree_survey WHERE project_location ILIKE '%高雄港%' LIMIT 50

Q: 列出所有榕樹
SQL: SELECT system_tree_id, species_name, tree_height_m, dbh_cm, carbon_storage, project_location FROM tree_survey WHERE species_name ILIKE '%榕樹%' LIMIT 50

Q: 碳儲存量最高的5棵樹是什麼？
SQL: SELECT system_tree_id, species_name, carbon_storage, carbon_sequestration_per_year, dbh_cm, tree_height_m, project_location FROM tree_survey WHERE carbon_storage IS NOT NULL ORDER BY carbon_storage DESC LIMIT 5
...
```

---

## 2. 🎯 SQL 生成 Prompt 優化

### 新增功能
- **智能樹木編號識別**：自動從問題中提取編號
  - 支援格式：「編號 7」「第7號」「ST-001」「PT-002」
- 改進輸出規則：
  - 強調只輸出純 SQL，不要 Markdown
  - 排序時使用 `NULLS LAST`
  - 預設 LIMIT 50，全部時用 100

### 程式碼片段
```javascript
// 智能預處理：識別用戶提到的編號
let treeIdHint = '';
const treeIdPatterns = [
    { regex: /(?:編號|樹木|第)\s*(\d+)\s*(?:號|棵)?/g, field: 'system_tree_id' },
    { regex: /ST[.-]?(\d+)/gi, field: 'system_tree_id' },
    { regex: /PT[.-]?(\d+)/gi, field: 'project_tree_id' },
    { regex: /^(\d+)號?$/g, field: 'system_tree_id' },
];
```

---

## 3. 📝 結果解釋 Prompt 優化

### 智能格式化
根據查詢結果類型自動調整輸出格式：

| 結果類型 | 輸出格式 |
|---------|---------|
| 無資料 (0筆) | 說明原因、建議替代查詢 |
| 統計結果 (COUNT) | 直接回答數量 |
| 分組統計 (GROUP BY) | 表格/清單 + 最大/最小標註 |
| 單筆樹木 | 自然語言描述 + 所有指標 |
| 少量資料 (≤10筆) | 清單逐筆列出 |
| 大量資料 (>10筆) | 統計摘要 + 前10筆 + 下載提示 |

---

## 4. 🧠 意圖分類增強 (shouldQueryDatabase)

### 三層分類策略

#### 第一層：絕對資料信號 (直接返回 true)
```javascript
const absoluteDataSignals = [
    // 樹木編號
    /編號\s*\d+/i, /第\s*\d+\s*[號棵株]/, /^\d+號?$/, /ST[.-]?\d+/i, /PT[.-]?\d+/i,
    
    // 數量查詢
    /[有總共].*[幾多少][棵顆株筆]/, /[幾多少][棵顆株筆].*樹/,
    
    // 列表/搜尋
    /^列出/, /找[出到].*樹/, /搜尋/, /查詢.*資料/,
    
    // 條件篩選
    /胸徑.{0,5}\d+/, /樹高.{0,5}\d+/, /[超大低小於過].*\d+\s*(公分|cm|公尺|m)/i,
    
    // 統計類
    /^統計/, /平均[值是有]/, /總[和量計]/, /最[高大低小矮].{0,3}[的是]/, /前\s*\d+\s*[名筆棵]/,
    
    // 區位查詢
    /(高雄|花蓮|台北|..)[港].*[有幾多少資料樹]/,
];
```

#### 第二層：絕對知識信號 (直接返回 false)
```javascript
const absoluteKnowledgeSignals = [
    /^什麼是/, /^為什麼/, /^如何.*種植/, /^怎麼.*[種照養護]/,
    /適合.*[什哪]麼.*環境/, /生長.*條件/, /特[性徵點]是什麼/,
    /有什麼.*[好優]處/, /^介紹/, /^說明/, /^解釋/,
];
```

#### 第三層：上下文跟隨 + 計分制
- 短問題 (< 12 字) + 地點關鍵字 → 查資料
- 弱信號關鍵字計分：`幾` +2, `多少` +2, `找` +1.5, ...
- 資料分數 ≥ 知識分數 + 1 → 查資料

---

## 5. 🖥️ 前端 AI 聊天頁面更新

### 新功能
1. **首頁改版**：「AI助手」按鈕現在導向新版聊天頁面
2. **建議問題分類展示**：
   - 📍 區位查詢
   - 🌳 樹種分析
   - 📊 數據統計
   - 🔍 精確搜尋
3. **正確處理 API 回應**：`response['response']` 或 `response['answer']`

### 建議問題範例
```dart
{
  'icon': Icons.pin_drop,
  'title': '區位查詢',
  'questions': [
    '高雄港有多少棵樹？',
    '花蓮港有哪些樹種？',
    '統計各區位的樹木數量',
  ],
},
```

---

## 6. 📁 修改的檔案清單

| 檔案 | 修改內容 |
|------|---------|
| `backend/services/sqlQueryService.js` | Schema、Prompt、意圖分類全面優化 |
| `frontend/lib/screens/ai_chat_page.dart` | 新增建議問題卡片、修正 API 回應處理 |
| `frontend/lib/screens/home_page.dart` | AI助手導向新版頁面 |

---

## 7. 🧪 測試建議

### 資料查詢測試
```
1. "高雄港有幾棵樹" → 應查詢資料庫，回傳數量
2. "編號 7 的樹" → 應識別編號，查詢 system_tree_id = '7'
3. "胸徑超過 50 公分的大樹" → 條件篩選查詢
4. "各區位的碳儲存總量" → 分組統計查詢
5. "花蓮港呢？" → 上下文跟隨查詢
```

### 知識問答測試
```
1. "什麼是碳匯？" → 應為知識問答模式
2. "樟樹適合什麼環境？" → 知識問答
3. "如何種植榕樹？" → 知識問答
```

---

## 8. 📈 預期效果

- ✅ SQL 生成準確率提升 (Few-shot learning)
- ✅ 意圖分類更精確 (三層分類策略)
- ✅ 結果輸出更易讀 (智能格式化)
- ✅ 用戶體驗更好 (建議問題引導)
- ✅ 支援口語化查詢 (上下文跟隨)
