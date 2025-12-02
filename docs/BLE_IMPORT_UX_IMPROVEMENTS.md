# BLE 匯入功能使用者體驗優化建議

## 一、當前流程

```
掃描設備 → 選擇連接 → 自動接收數據 → 顯示原始數據 → 點擊「解析並匯入」→ 手動補全頁面
```

### 問題點
1. **等待時間不確定**：使用者不知道傳輸何時結束
2. **原始數據難以理解**：顯示的是 `ID: 10001 | H: 12.3m` 格式，不夠直觀
3. **沒有進度指示**：不知道接收了多少筆記錄
4. **錯誤處理不明確**：超時後直接清空，沒有給使用者選擇

---

## 二、建議優化

### 1. 傳輸進度指示

**當前**：只顯示 `已接收 XXX bytes`
**建議**：顯示已解析的記錄數量

```dart
// 即時統計已解析的記錄數
int get _parsedRecordCount {
  String data = _dataBuffer.toString();
  return RegExp(r'\$;[^;]*;[^;]*;').allMatches(data).length;
}
```

UI 顯示：
```
正在接收數據... (已接收 156 筆記錄)
████████████████░░░░ 78%
```

### 2. 傳輸完成確認畫面

**當前**：收到 EOT 後直接顯示原始數據列表
**建議**：顯示傳輸摘要確認畫面

```dart
// 傳輸完成摘要
showDialog(
  context: context,
  builder: (context) => AlertDialog(
    title: Text('傳輸完成'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('✓ 接收成功'),
        Text('總記錄數：${parsedData.length} 筆'),
        Text('時間範圍：${dateRange}'),
        Text('資料完整性：100%'),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text('繼續'),
      ),
    ],
  ),
);
```

### 3. 數據預覽優化

**當前**：列表顯示 `ID: 10001 | H: 12.3m | HD: 4.5m`
**建議**：卡片式顯示，包含更多資訊

```dart
Card(
  child: ListTile(
    leading: CircleAvatar(child: Text('${index + 1}')),
    title: Text('樹高: ${data['height']}m'),
    subtitle: Text('HD: ${hd}m | 時間: ${time}'),
    trailing: Icon(
      data['dbh'] != null ? Icons.check_circle : Icons.warning,
      color: data['dbh'] != null ? Colors.green : Colors.orange,
    ),
  ),
)
```

### 4. 批量操作功能

**建議新增**：
- [ ] 全選/取消全選
- [ ] 按時間排序/按 ID 排序
- [ ] 篩選（有/無胸徑）
- [ ] 匯出 CSV 功能（本地備份）

### 5. 離線重試機制

**問題**：傳輸中斷後數據完全清空
**建議**：提供選項

```dart
showDialog(
  context: context,
  builder: (context) => AlertDialog(
    title: Text('傳輸中斷'),
    content: Text('已接收 ${_parsedRecordCount} 筆記錄。要保留這些數據嗎？'),
    actions: [
      TextButton(
        onPressed: () {
          _clearAndReset();
          Navigator.pop(context);
        },
        child: Text('清除並重新掃描'),
      ),
      ElevatedButton(
        onPressed: () {
          Navigator.pop(context);
          // 保留已接收的數據，讓使用者可以繼續
        },
        child: Text('保留數據'),
      ),
    ],
  ),
);
```

---

## 三、與後續功能的銜接

### 當前架構

```
BleImportPage
    ↓ parsedData (List<Map>)
ManualInputPage / ManualInputPageV2
    ↓ 提交到後端 API
後端處理
```

### 建議優化

```
BleImportPage
    ↓
ImportPreviewPage (新增)  ← 預覽、確認、編輯
    ↓
BatchUploadPage (新增)    ← 批量上傳進度
    ↓
上傳結果頁面             ← 成功/失敗統計
```

### 新增 ImportPreviewPage 的好處

1. **數據驗證**：在提交前檢查數據完整性
2. **快速編輯**：可以直接修改明顯錯誤的數值
3. **批量操作**：選擇要上傳的記錄
4. **重複檢測**：標記可能重複的記錄（根據 ID 或座標）

### 數據流改進

```dart
// 建議的數據模型
class TreeMeasurement {
  final String id;
  final double lat;
  final double lon;
  final double height;
  final double? dbh;
  final DateTime? timestamp;
  final Map<String, dynamic> metadata;
  
  // 驗證方法
  bool get isValid => height > 0 && lat != 0 && lon != 0;
  
  // 轉換為 API 格式
  Map<String, dynamic> toApiJson() { ... }
}
```

---

## 四、程式碼架構建議

### 分離關注點

```
lib/
  services/
    ble_packet_decoder.dart     ← 封包解碼 (已完成)
    ble_data_processor.dart     ← CSV 解析 (已存在)
    ble_connection_service.dart ← BLE 連接管理 (建議新增)
  models/
    tree_measurement.dart       ← 數據模型 (建議新增)
  screens/
    ble_import_page.dart        ← 掃描與連接 UI
    import_preview_page.dart    ← 預覽與確認 (建議新增)
```

### BleConnectionService 範例

```dart
class BleConnectionService {
  // 狀態管理
  final _connectionState = BehaviorSubject<BleConnectionState>();
  final _dataStream = BehaviorSubject<List<int>>();
  
  // 連接設備
  Future<void> connect(BluetoothDevice device);
  
  // 斷開連接
  Future<void> disconnect();
  
  // 數據流
  Stream<List<int>> get dataStream => _dataStream.stream;
  
  // 連接狀態
  Stream<BleConnectionState> get connectionState => _connectionState.stream;
}
```

---

## 五、優先級建議

### Phase 1 (快速改善)
1. ✅ 封包解碼優化 (已完成)
2. 🔲 即時記錄數統計
3. 🔲 傳輸完成摘要對話框

### Phase 2 (中期改善)
4. 🔲 數據預覽卡片化
5. 🔲 中斷重試機制
6. 🔲 ImportPreviewPage

### Phase 3 (長期改善)
7. 🔲 BleConnectionService 服務化
8. 🔲 批量上傳進度追蹤
9. 🔲 離線緩存機制
