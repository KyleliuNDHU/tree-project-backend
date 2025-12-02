# BLE 匯入功能整合優化方案

## 文件資訊
- **建立日期**: 2025-12-02
- **當前版本**: v14.0.0 (pubspec.yaml) / v14.3.1 (APK 實際發布版)
- **狀態**: 規劃階段

---

## 一、現有架構分析

### 1.1 資料流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BLE 匯入完整流程                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐  │
│  │ VLGEO2 設備   │────>│ BleImportPage  │────>│ BlePacketDecoder │  │
│  │ (BLE 傳輸)    │     │ (掃描/連接/接收) │     │ (封包級解碼)     │  │
│  └──────────────┘     └────────────────┘     └────────┬─────────┘  │
│                                                        │            │
│                                                        ▼            │
│                       ┌────────────────┐     ┌──────────────────┐  │
│                       │ BleDataProcessor│<────│ 字串緩衝區       │  │
│                       │ (CSV 欄位解析)  │     │ (_dataBuffer)    │  │
│                       └───────┬────────┘     └──────────────────┘  │
│                               │                                    │
│                               ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    parsedData (List<Map>)                    │  │
│  │  • id: 樹木編號 (VLGEO 儀器 ID)                               │  │
│  │  • lat/lon: GPS 座標                                         │  │
│  │  • height: 樹高 (m)                                          │  │
│  │  • dbh: 胸徑 (cm) - VLGEO2 無法測量，永遠為空                  │  │
│  │  • type: 測量類型 (3P, 1P, DME...)                           │  │
│  │  • timestamp/timestamp_iso: 測量時間                         │  │
│  │  • metadata: { horizontal_distance, slope_distance,          │  │
│  │              pitch, azimuth, altitude }                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                    │
│                               ▼                                    │
│  ┌─────────────────────┐           ┌─────────────────────────────┐ │
│  │ ManualInputPage (V1)│    OR     │ ManualInputPageV2          │ │
│  │ (舊版逐筆提交)       │           │ (批量 API 提交)             │ │
│  └──────────┬──────────┘           └─────────────┬───────────────┘ │
│             │                                     │                 │
│             ▼                                     ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                        後端 API                               │  │
│  │  V1: POST /tree_survey (逐筆)                                │  │
│  │  V2: POST /tree_survey/batch_import (批量)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 ManualInputPage 功能清單

| 步驟 | 功能 | 說明 |
|------|------|------|
| **Step 0** | 預設專案設定 | 選擇預設區位/專案，套用到所有記錄 |
| **Step 1** | 數據預覽與清洗 | 全選/取消、滑動連選、批量編輯 |
| **Step 2** | 最終確認 | 顯示統計，執行提交 |

### 1.3 批量編輯功能 (Step 1)

| 功能 | 按鈕 | 說明 |
|------|------|------|
| 區位 | `OutlinedButton` | 批量修改 `project_area` |
| 專案 | `OutlinedButton` | 批量修改 `project_name` / `project_code` |
| 樹種 | `ElevatedButton` | 批量修改 `species_id` / `species_name` |
| 胸徑 | `OutlinedButton` | 批量修改 `dbh` (手動輸入數字) |
| 狀況 | `OutlinedButton` | 批量修改 `status` |
| 備註 | `OutlinedButton` | 批量修改 `tree_remark` |

### 1.4 已解決的關鍵問題

#### BLE 封包解碼問題 ✅
- **問題**: PacketLogger 標記 (`44 xx 00`) 導致封包邊界錯亂
- **方案**: `BlePacketDecoder` 實現協議級解碼
  - 正常封包 (20 bytes): 保留全部
  - 殘留封包 (5 bytes): 只保留前 3 bytes
  - 標記封包 (20 bytes): 跳過前 3 bytes
- **結果**: 100% 解碼準確率

#### CSV 欄位驗證問題 ✅
- **問題**: 封包雜訊插入數字欄位造成解析錯誤
- **方案**: `BleFieldValidator` 實現欄位級驗證
  - Layer 4: Context-Aware Letter Filtering
  - Layer 5: Field-Specific Validation
- **結果**: 所有 33 個欄位正確解碼

#### 狀態管理問題 ✅
- **問題**: 從 ManualInputPage 返回時數據殘留
- **方案**: `_resetState()` 重置所有狀態變數
- **結果**: 不再發生崩潰

---

## 二、現有處理邏輯 (必須保留)

### 2.1 資料去重 (`_deduplicateAndInitData`)

```dart
// 依據 ID 去重，相同 ID 只保留最後一筆
Map<String, Map<String, dynamic>> uniqueMap = {};
List<Map<String, dynamic>> noIdList = [];

for (var item in widget.importedData) {
  if (item['id'] != null && item['id'].toString().isNotEmpty) {
    uniqueMap[item['id'].toString()] = item;
  } else {
    noIdList.add(item);
  }
}
```

### 2.2 預設欄位 (`_deduplicateAndInitData`)

```dart
_editableData = List.from(mergedList.map((item) {
  return {
    ...item,
    'status': '良好',           // 預設狀況
    'note': '無',              // 預設註記
    'tree_remark': '無',       // 預設樹木備註
    'survey_remark': '批量匯入', // 預設調查備註
    'project_area': null,      // 後續選擇
    'project_name': null,      // 後續選擇
    'project_code': null,      // 後續選擇
  };
}));
```

### 2.3 資料驗證 (`_validateData`)

```dart
bool _validateData() {
  for (var item in _editableData) {
    // 必填：樹種
    if (item['species_name'] == null || item['species_name'].isEmpty) {
      // Error: '錯誤：尚有樹木未設定「樹種」。'
      return false;
    }
    // 必填：專案
    if (item['project_name'] == null || item['project_name'].isEmpty) {
      // Error: '錯誤：尚有樹木未歸屬「專案」。'
      return false;
    }
  }
  return true;
}
```

**注意**: DBH (胸徑) 不是必填，因為 VLGEO2 無法測量。

### 2.4 清理機制 (`_performCleanup`)

```dart
// 追蹤臨時創建的資源
final List<int> _createdAreaIds = [];      // 新增的區位 ID
final List<int> _createdPlaceholderIds = []; // 新增的佔位樹木 ID

Future<void> _performCleanup() async {
  // 使用者放棄匯入時，清除臨時創建的資源
  for (var id in _createdPlaceholderIds) {
    await _treeService.deletePlaceholderTree(id.toString());
  }
  for (var id in _createdAreaIds) {
    await _projectAreaService.deleteProjectArea(id);
  }
}
```

### 2.5 儀器 Metadata 整合 (V1: survey_remark)

```dart
// V1 將 metadata 編碼到 survey_remark 欄位
String instrumentData = "";
if (item['metadata'] != null) {
  final meta = item['metadata'];
  List<String> params = [];
  if (meta['horizontal_distance'] != null) params.add("HD:${meta['horizontal_distance']}m");
  if (meta['slope_distance'] != null) params.add("SD:${meta['slope_distance']}m");
  if (meta['pitch'] != null) params.add("Pitch:${meta['pitch']}°");
  if (meta['azimuth'] != null) params.add("Az:${meta['azimuth']}°");
  if (meta['altitude'] != null) params.add("Alt:${meta['altitude']}m");
  
  if (params.isNotEmpty) {
    instrumentData = "[VLGEO] ${params.join(', ')}";
  }
}
```

### 2.6 V2 批量提交 (`_submitBatchDataV2`)

```dart
// V2 直接傳遞 metadata 物件
Map<String, dynamic> payload = {
  "project_area": first['project_area'],
  "project_code": pCode,
  "project_name": first['project_name'],
  "trees": group.map((item) => {
    "species_id": item['species_id'],
    "height": item['height'],
    "dbh": item['dbh'],
    "lat": item['lat'],
    "lon": item['lon'],
    "metadata": item['metadata'] // 直接傳遞 Map
  }).toList()
};

await _treeService.batchImportTreesV2(payload);
```

---

## 三、待優化項目

### Phase 1: 即時改善 (低風險)

#### 3.1 傳輸進度指示 ✅ (已實作)
- 已在 `ble_import_page.dart` 加入 `_estimatedRecordCount`
- UI 顯示: `正在接收數據... (X 筆記錄)`

#### 3.2 傳輸完成摘要 🔲

**建議**: 在收到 EOT 後顯示確認對話框

```dart
void _handleSuccess() {
  // ... existing code ...
  
  // 顯示摘要對話框
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('傳輸完成'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 48),
          const SizedBox(height: 16),
          Text('✓ 接收成功'),
          Text('總記錄數：${parsedData.length} 筆'),
          // 可選：顯示時間範圍
          // Text('資料時間：$startTime ~ $endTime'),
        ],
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('繼續處理'),
        ),
      ],
    ),
  );
}
```

### Phase 2: 中期改善 (需測試)

#### 3.3 數據預覽卡片化 🔲

**現況**: 列表顯示 `ID: 10001 | H: 12.3m | HD: 4.5m`

**建議**: 改用卡片式顯示

```dart
// 修改 _buildDataView 或 ManualInputPage 的 ListView.builder
Card(
  child: ListTile(
    leading: CircleAvatar(
      backgroundColor: item['dbh'] != null ? Colors.green : Colors.orange,
      child: Text('${index + 1}'),
    ),
    title: Text('樹高: ${item['height']}m | HD: ${item['metadata']?['horizontal_distance']}m'),
    subtitle: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ID: ${item['id']} | ${item['type'] ?? 'N/A'}'),
        Text('座標: (${item['lat']?.toStringAsFixed(5)}, ${item['lon']?.toStringAsFixed(5)})'),
      ],
    ),
    trailing: Icon(
      item['dbh'] != null ? Icons.check_circle : Icons.warning,
      color: item['dbh'] != null ? Colors.green : Colors.orange,
    ),
  ),
)
```

#### 3.4 中斷重試機制 🔲

**現況**: 傳輸中斷直接清空數據

**建議**: 給使用者選擇

```dart
void _onTransferComplete() {
  if (_isTransmissionSuccess) return;
  
  // 如果已有數據，詢問使用者
  if (_dataBuffer.length > 100) { // 至少有一些數據
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('傳輸中斷'),
        content: Text('已接收 ${_estimatedRecordCount} 筆記錄。\n要保留這些數據繼續處理嗎？'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _handleFailure(); // 清除並重置
            },
            child: const Text('清除並重新掃描'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _parseAndShowData(); // 保留已有數據
              setState(() => _isReceiving = false);
            },
            child: const Text('保留數據'),
          ),
        ],
      ),
    );
  } else {
    _handleFailure();
  }
}
```

### Phase 3: 長期改善 (架構變更)

#### 3.5 ImportPreviewPage 🔲

**目的**: 在 BleImportPage 和 ManualInputPage 之間增加一個預覽確認頁

**好處**:
- 分離「資料接收」和「資料編輯」的職責
- 提供更好的數據概覽
- 可實作重複檢測

#### 3.6 TreeMeasurement 資料模型 🔲

```dart
// lib/models/tree_measurement.dart
class TreeMeasurement {
  final String id;
  final double lat;
  final double lon;
  final double height;
  final double? dbh;  // 可選，VLGEO2 無法測量
  final DateTime? timestamp;
  final String type;
  final MeasurementMetadata metadata;
  
  // 驗證方法
  bool get isValid => height > 0 && lat.abs() > 0 && lon.abs() > 0;
  bool get needsDbh => dbh == null || dbh == 0;
  
  // 轉換方法
  Map<String, dynamic> toApiJson() { ... }
  factory TreeMeasurement.fromBleData(Map<String, dynamic> data) { ... }
}

class MeasurementMetadata {
  final double? horizontalDistance;
  final double? slopeDistance;
  final double? pitch;
  final double? azimuth;
  final double? altitude;
}
```

---

## 四、建置與發布設定

### 4.1 版本號管理

| 位置 | 當前值 | 說明 |
|------|--------|------|
| `pubspec.yaml` | `14.0.0+1` | Flutter 主版本定義 |
| APK 發布版 | `v14.3.1` | 實際發布的 APK 版本 |

**建議**: 同步 pubspec.yaml 到最新發布版本

```yaml
# pubspec.yaml
version: 14.3.1+1
```

### 4.2 Android 簽名設定

**當前設定** (`android/key.properties`):
```properties
storePassword=<YOUR_KEYSTORE_PASSWORD>
keyPassword=<YOUR_KEY_PASSWORD>
keyAlias=<YOUR_KEY_ALIAS>
storeFile=keystore/upload-keystore.jks
```

> ⚠️ **安全提醒**: 不要將實際密碼寫入任何文件！

**問題**: `storeFile` 不應使用絕對路徑
- Mac 上此路徑不存在
- 不同電腦的使用者目錄不同

**建議方案**:

1. **方案 A**: 使用相對路徑 (推薦)
```properties
storeFile=keystore/upload-keystore.jks
```
- 將 keystore 放入專案目錄 (不要 commit)
- 在 `.gitignore` 中排除 keystore

2. **方案 B**: 使用環境變數
```properties
storeFile=$KEYSTORE_PATH
```
- Mac: `export KEYSTORE_PATH=/path/to/keystore.jks`
- Windows: `set KEYSTORE_PATH=c:/path/to/keystore.jks`

3. **方案 C**: 分離設定檔
```
android/
  key.properties        (Windows, .gitignore)
  key.properties.mac    (Mac, .gitignore)
```
- 手動切換或使用腳本

### 4.3 iOS 簽名設定

**當前設定**:
- Bundle ID: `com.sustainable.sustainableTreeai`
- 版本號: 從 Flutter 讀取 (`FLUTTER_BUILD_NAME`, `FLUTTER_BUILD_NUMBER`)
- 簽名: 需要在 Xcode 中手動設定 Team / Provisioning Profile

**Mac 上執行**:
```bash
# 確認 iOS 開發環境
xcode-select --print-path

# 執行 release 建置
cd frontend
flutter build ios --release

# 或使用 Xcode Archive
open ios/Runner.xcworkspace
```

### 4.4 統一建置流程

**建議建立 `build.sh` (Mac) / `build.ps1` (Windows)**:

```powershell
# build.ps1 (Windows)
param(
    [string]$version = "14.3.1",
    [switch]$android,
    [switch]$ios
)

# 更新版本號
(Get-Content pubspec.yaml) -replace 'version: .+', "version: $version+1" | Set-Content pubspec.yaml

if ($android) {
    flutter build apk --release --build-name=$version
    Write-Host "APK: build/app/outputs/flutter-apk/app-release.apk"
}

if ($ios) {
    Write-Host "iOS 建置請在 Mac 上執行:"
    Write-Host "  flutter build ios --release --build-name=$version"
}
```

```bash
#!/bin/bash
# build.sh (Mac)

VERSION=${1:-"14.3.1"}

# 更新版本號
sed -i '' "s/version: .*/version: $VERSION+1/" pubspec.yaml

if [[ "$2" == "android" ]]; then
    flutter build apk --release --build-name=$VERSION
    echo "APK: build/app/outputs/flutter-apk/app-release.apk"
elif [[ "$2" == "ios" ]]; then
    flutter build ios --release --build-name=$VERSION
    echo "iOS build ready for Xcode Archive"
fi
```

---

## 五、優先級與時程建議

| 優先級 | 項目 | 預估工時 | 風險 |
|--------|------|----------|------|
| 🔴 高 | 版本號同步 | 5 min | 低 |
| 🔴 高 | 建置路徑統一 | 30 min | 低 |
| 🟡 中 | 傳輸完成摘要 | 1 hr | 低 |
| 🟡 中 | 中斷重試機制 | 2 hr | 中 |
| 🟢 低 | 數據預覽卡片化 | 3 hr | 低 |
| 🟢 低 | ImportPreviewPage | 1 day | 中 |
| 🟢 低 | TreeMeasurement 模型 | 1 day | 高 |

---

## 七、後端與資料庫分析

### 7.1 資料表結構

#### 主表：`tree_survey`
| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | SERIAL | 自增主鍵 |
| `project_location` | VARCHAR(255) | 專案區位 |
| `project_code` | VARCHAR(50) | 專案代碼 |
| `project_name` | VARCHAR(255) | 專案名稱 |
| `system_tree_id` | VARCHAR(50) | 系統樹木編號 (如 `ST-123` 或純數字) |
| `project_tree_id` | VARCHAR(50) | 專案樹木編號 (如 `PT-1` 或純數字) |
| `species_id` | VARCHAR(20) | 樹種編號 |
| `species_name` | VARCHAR(100) | 樹種名稱 |
| `x_coord` | DOUBLE PRECISION | 經度 (Lon) |
| `y_coord` | DOUBLE PRECISION | 緯度 (Lat) |
| `status` | TEXT | 狀況 |
| `notes` | TEXT | 註記 |
| `tree_notes` | TEXT | 樹木備註 |
| `tree_height_m` | DOUBLE PRECISION | 樹高 (公尺) |
| `dbh_cm` | DOUBLE PRECISION | 胸徑 (公分) |
| `survey_notes` | TEXT | 調查備註 |
| `survey_time` | TIMESTAMP | 調查時間 |
| `carbon_storage` | DOUBLE PRECISION | 碳儲存量 |
| `carbon_sequestration_per_year` | DOUBLE PRECISION | 推估年碳吸存量 |
| `project_id` | INTEGER | 關聯 projects 表 (正規化) |
| `created_at` | TIMESTAMP | 建立時間 |
| `updated_at` | TIMESTAMP | 更新時間 |

#### 儀器原始數據表：`tree_measurement_raw` ✅ 已建立
| 欄位 | 類型 | 說明 | BLE 對應 |
|------|------|------|---------|
| `id` | BIGSERIAL | 自增主鍵 | - |
| `tree_id` | BIGINT | 關聯 tree_survey.id | - |
| `instrument_type` | VARCHAR(20) | 測量類型 | `type` (1P, 3P, DME) |
| `device_sn` | VARCHAR(50) | 設備序號 | `metadata.snr` |
| `horizontal_dist` | FLOAT | 水平距離 (m) | `metadata.horizontal_distance` |
| `slope_dist` | FLOAT | 斜距 (m) | `metadata.slope_distance` |
| `vertical_angle` | FLOAT | 俯仰角 (Deg) | `metadata.pitch` |
| `azimuth` | FLOAT | 方位角 (Deg) | `metadata.azimuth` |
| `ref_height` | FLOAT | 參考高度 (m) | - |
| `gps_hdop` | FLOAT | GPS 精度 | - |
| `raw_lat` | DOUBLE PRECISION | 原始緯度 | `lat` |
| `raw_lon` | DOUBLE PRECISION | 原始經度 | `lon` |
| `altitude` | FLOAT | 海拔 | `metadata.altitude` |
| `measured_at` | TIMESTAMP | 測量時間 | `timestamp_iso` |
| `raw_data_snapshot` | TEXT | 完整備份 (JSON) | `metadata` (JSON 序列化) |
| `created_at` | TIMESTAMP | 建立時間 | - |

### 7.2 編號格式說明

#### 系統樹木編號 (`system_tree_id`)
- **新格式**: `ST-123` (V2 API 生成)
- **舊格式**: 純數字 `7`, `100` (舊資料/Excel 匯入)
- **顯示**: 前端可能顯示為 `ST-0001` 格式

#### 專案樹木編號 (`project_tree_id`)
- **新格式**: `PT-1`, `PT-2` (V2 API 生成)
- **舊格式**: 純數字 `1`, `31`
- **起始值**: 每個專案從 `1` 開始 (或 `2`，如果已有佔位記錄)

#### 編號從 2 開始的原因
當使用者新增專案時，系統會自動建立一筆「佔位樹木」(placeholder)：
```javascript
// 佔位樹木的 species_name = '預設樹種'
// 這樣可以確保專案有至少一筆記錄
// 因此真正的數據會從編號 2 開始
```

### 7.3 前端 metadata 到後端欄位的映射

#### 當前前端發送的 metadata 結構
```dart
metadata = {
  'horizontal_distance': double,  // HD
  'slope_distance': double,       // SD
  'pitch': double,                // PITCH (垂直角/俯仰角)
  'azimuth': double,              // AZ (方位角)
  'altitude': double,             // 海拔
}
```

#### 後端 BatchController 期望的結構
```javascript
tree.metadata = {
  instrument_type: string,  // TYPE (1P, 3P, DME...)
  snr: string,              // 設備序號
  hd: number,               // 水平距離
  sd: number,               // 斜距
  pitch: number,            // 俯仰角
  az: number,               // 方位角
  ref_height: number,       // 參考高度
  hdop: number,             // GPS 精度
  raw_lat: number,          // 原始緯度
  raw_lon: number,          // 原始經度
  measured_at: string,      // 測量時間
}
```

### 7.4 ⚠️ 欄位對應問題

| 問題 | 說明 | 影響 |
|------|------|------|
| 欄位名稱不一致 | 前端 `horizontal_distance` vs 後端期望 `hd` | V2 寫入 raw 表失敗 |
| 缺少欄位 | 前端未傳 `instrument_type`, `snr` | raw 表資料不完整 |
| 座標欄位混淆 | x_coord 是 lon? y_coord 是 lat? | 需確認一致性 |

### 7.5 V1 vs V2 API 差異

| 功能 | V1 (舊版) | V2 (批量) |
|------|-----------|-----------|
| 路由 | `POST /tree_survey` | `POST /tree_survey/batch_import` |
| ID 生成 | 前端生成 | 後端生成 (ST-/PT-) |
| 事務 | 無 | 有 (原子性) |
| metadata | 編碼到 survey_notes | 寫入 tree_measurement_raw |
| 鎖定機制 | 無 | 有 (Advisory Lock) |

---

## 八、待解決的同步問題

### 8.1 前端 metadata 欄位名稱修正

**修改檔案**: `ble_data_processor.dart`

```dart
// 當前
metadata['horizontal_distance'] = double.tryParse(hdStr);
metadata['slope_distance'] = double.tryParse(sdStr);

// 建議改為 (符合後端期望)
metadata['hd'] = double.tryParse(hdStr);
metadata['sd'] = double.tryParse(sdStr);
metadata['az'] = double.tryParse(azStr);  // 已是 azimuth，可簡化
```

**或者** 修改後端 BatchController 以相容兩種命名：
```javascript
horizontal_dist: meta.hd ?? meta.horizontal_distance ?? null,
slope_dist: meta.sd ?? meta.slope_distance ?? null,
```

### 8.2 新增缺失的欄位

**前端應額外傳送**:
```dart
metadata['instrument_type'] = type;  // 從 CSV TYPE 欄位取得
// snr 欄位 VLGEO2 可能沒有，可設為 null 或 'VLGEO2'
```

### 8.3 座標欄位確認

**資料庫定義**:
- `x_coord` = 經度 (Longitude)
- `y_coord` = 緯度 (Latitude)

**前端傳送**:
- `lat` = 緯度
- `lon` = 經度

**後端處理** (treeSurveyBatchController.js):
```javascript
parseFloat(tree.lat) || 0, // 存到 x_coord (注意：這是錯誤的！lat 應對應 y_coord)
parseFloat(tree.lon) || 0, // 存到 y_coord
```

⚠️ **發現問題**: 後端 Batch Controller 中座標欄位對應可能有誤！

---

## 九、修正狀態

### 優先級 🔴 高 - ✅ 已完成

1. **✅ 修正後端座標對應** (`treeSurveyBatchController.js`) - 2025-12-02 完成
   ```javascript
   // 修改前 (錯誤)
   parseFloat(tree.lat) || 0, // x_coord
   parseFloat(tree.lon) || 0, // y_coord
   
   // 修改後 (正確)
   parseFloat(tree.lon) || 0, // x_coord (經度)
   parseFloat(tree.lat) || 0, // y_coord (緯度)
   ```

2. **✅ 修正後端 metadata 欄位相容** (`treeSurveyBatchController.js`) - 2025-12-02 完成
   ```javascript
   // 已實作雙向相容
   meta.horizontal_distance !== undefined ? parseFloat(meta.horizontal_distance) : 
     (meta.hd !== undefined ? parseFloat(meta.hd) : null),
   meta.slope_distance !== undefined ? parseFloat(meta.slope_distance) :
     (meta.sd !== undefined ? parseFloat(meta.sd) : null),
   meta.azimuth !== undefined ? parseFloat(meta.azimuth) :
     (meta.az !== undefined ? parseFloat(meta.az) : null),
   ```

### 優先級 🟡 中 - ✅ 已完成

3. **✅ 前端新增 type 欄位到 metadata** (`ble_data_processor.dart`) - 2025-12-02 完成
   ```dart
   // 新增以下欄位到 metadata
   metadata['instrument_type'] = type;  // 儀器測量類型 (1P, 3P, DME...)
   metadata['raw_lat'] = lat;           // 原始緯度
   metadata['raw_lon'] = lon;           // 原始經度
   metadata['measured_at'] = dateTime.toIso8601String();  // 測量時間
   ```

4. **✅ 文件同步** - 2025-12-02 完成
   - 本文檔已更新反映所有修正

---

## 十、資料完整性確認清單

### 10.1 BLE 匯入資料存放

| 資料類型 | 存放位置 | 狀態 |
|----------|----------|------|
| 基本資訊 (ID, 座標, 樹高) | `tree_survey` | ✅ |
| 專案/區位歸屬 | `tree_survey` | ✅ |
| 樹種資訊 | `tree_survey` | ✅ |
| 胸徑 (手動輸入) | `tree_survey.dbh_cm` | ✅ |
| 儀器測量參數 (HD, SD, Pitch, Az) | `tree_measurement_raw` | ✅ 已修正欄位映射 |
| 原始 GPS | `tree_measurement_raw.raw_lat/lon` | ✅ 已確認傳送 |
| 測量時間 | `tree_measurement_raw.measured_at` | ✅ |
| 完整備份 | `tree_measurement_raw.raw_data_snapshot` | ✅ (JSON) |

### 10.2 V1 舊版相容性

| 欄位 | V1 處理方式 | V2 處理方式 |
|------|-------------|-------------|
| 系統編號 | 前端計算，純數字 | 後端生成 `ST-XXX` |
| 專案編號 | 前端計算，純數字 | 後端生成 `PT-XXX` |
| metadata | 編碼到 survey_notes | 寫入 tree_measurement_raw |

⚠️ V1 不會寫入 `tree_measurement_raw` 表！如果需要保留儀器原始數據，應使用 V2。

---

## 十一、向後相容性設計原則

### 11.1 API 層級相容

| 路由 | 版本 | 狀態 | 說明 |
|------|------|------|------|
| `POST /tree_survey` | V1 | ✅ 未修改 | 舊版 APP 使用，中文欄位名稱 |
| `PUT /tree_survey/:id` | V1 | ✅ 未修改 | 舊版 APP 編輯功能 |
| `GET /tree_survey/*` | 通用 | ✅ 未修改 | 查詢 API 兩版通用 |
| `POST /tree_survey/batch_import` | V2 | ✅ 已優化 | 新版 APP 批量匯入 |
| `POST /tree_survey/create_v2` | V2 | ✅ 未修改 | 新版 APP 單筆新增 |

### 11.2 資料庫層級相容

| 表格 | 說明 | 相容策略 |
|------|------|----------|
| `tree_survey` | 主表 | V1/V2 共用，無結構變更 |
| `tree_measurement_raw` | 儀器原始資料 | V2 專用，後端檢查表是否存在後才寫入 |
| `projects` | 專案表 | 可選關聯，不存在時跳過 |

### 11.3 前端欄位相容

後端已實作雙向相容，支援以下欄位名稱：

| 前端 (新) | 前端 (舊/替代) | 後端處理 |
|-----------|----------------|----------|
| `horizontal_distance` | `hd` | `meta.horizontal_distance ?? meta.hd` |
| `slope_distance` | `sd` | `meta.slope_distance ?? meta.sd` |
| `azimuth` | `az` | `meta.azimuth ?? meta.az` |
| `instrument_type` | `type` (從 tree 取) | `meta.instrument_type || tree.type` |

### 11.4 未來汰換計畫

當所有用戶升級到 V2 版本後，可以：
1. 移除 `POST /tree_survey` (V1) 路由
2. 移除 `PUT /tree_survey/:id` (V1) 路由
3. 移除後端中文欄位映射邏輯
4. 移除前端 `manual_input_page.dart` (V1)
5. 簡化 metadata 欄位名稱 (統一使用短名)

