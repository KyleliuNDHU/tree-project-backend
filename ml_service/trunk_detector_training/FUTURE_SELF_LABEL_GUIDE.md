# 自己標註樹幹資料集 — 未來精度提升指南

> 目前先用公開資料集訓練，日後有時間收集台灣在地樹種照片時，
> 按照這份指南自己標註，可以大幅提升模型對台灣樹木的辨識精度。

---

## 為什麼需要自己標註？

公開資料集（tree-trunks/tree-trunk-detection-bi-axe）主要是歐美的果園樹木，
和台灣常見的樟樹、榕樹、相思樹、楓香等形態不同。

自己標註 200-500 張台灣樹木照片，混合公開資料集一起訓練，
可以讓 mAP50 從 ~75% 提升到 ~90%+。

---

## Step 1：拍攝照片（收集資料）

### 拍攝原則
- **多樣性最重要**，不需要追求數量
- 每種場景 30-50 張就很夠

### 拍攝清單

| 變數 | 建議 |
|------|------|
| **樹種** | 至少 5-10 種常見樹種（樟樹、榕樹、茄苳、相思樹、楓香、黑板樹、木棉等） |
| **距離** | 近（1m）、中（2-3m）、遠（5m+） |
| **光線** | 晴天、陰天、逆光、樹蔭下 |
| **角度** | 正面、側面、微仰角 |
| **背景** | 公園、校園、行道樹、山林步道 |
| **單/多** | 單棵樹、多棵樹一起出現 |
| **季節** | 有葉/落葉/開花（不同外觀） |

### 拍攝建議
- 用手機正常拍（和 app 使用場景一致）
- 橫拍直拍都要有
- 解析度不用太高，1080p 就夠（Roboflow 會自動 resize 到 640×640）

---

## Step 2：上傳到 Roboflow

1. 前往 https://app.roboflow.com
2. **Create New Project**
   - Name: `taiwan-tree-trunk-segmentation`
   - Type: **Instance Segmentation**（不是 Object Detection！）
   - 新增 class: `tree_trunk`
3. 拖曳上傳照片

---

## Step 3：標註（最重要！）

### 工具：Polygon Tool（多邊形工具）

1. 進入 **Annotate** 頁面
2. 點選左側的 **Polygon Tool** 🔺
3. 沿著樹幹邊緣點一圈

### 標註規則

```
✅ 正確：只標樹幹部分（根部到第一個主要分枝處）
✅ 正確：每棵樹分開標（一個 polygon = 一棵樹幹）
✅ 正確：邊緣大致貼合（不用完美像素級）

❌ 錯誤：把整棵樹（含樹冠）圈起來
❌ 錯誤：把多棵樹合在一個 polygon
❌ 錯誤：標太短（只標一小段）
```

### 標註的重點區域
```
        🌿🌿🌿  ← 不標（樹冠）
       🌿🌿🌿🌿
      🌿🌿🌿🌿🌿
     ╔═══════════╗
     ║           ║ ← 如果有大分枝這邊可以往上延伸一點
     ║   TRUNK   ║ ← 主要標註區域
     ║           ║
     ║           ║
     ╚═══════════╝
     ───地面───── ← 標到地面即可
```

### 標註技巧
- 每棵樹幹 **10-20 個點**（彎曲處多放）
- 用 `N` 鍵跳到下一張
- 每張圖花 **15-30 秒**
- 一個小時大約能標 **100-150 張**

### 特殊情況
| 情況 | 處理方式 |
|------|---------|
| 樹幹被遮擋一部分 | 只標可見部分 |
| 榕樹氣根 | 只標主幹 |
| 多幹樹（一根分成多根） | 每根分別標 |
| 非常遠的小樹 | 可以跳過不標 |
| 倒木 | 不標 |

---

## Step 4：生成版本 + 下載

1. 標完 → **Generate** → **Create New Version**
2. Preprocessing:
   - Resize: `Stretch to 640×640`
3. Augmentation（建議加）:
   - Flip: Horizontal
   - Brightness: ±15%
   - Blur: Up to 1px
4. Generate → 記下 version 號碼

---

## Step 5：混合訓練

在 `train_colab.ipynb` 中，可以下載多個資料集合併：

```python
# 1. 下載公開資料集
rf = Roboflow(api_key=API_KEY)
ds1 = rf.workspace('tree-trunks').project('tree-trunk-detection-bi-axe').version(7).download('yolov8', '/content/ds1')

# 2. 下載自己的資料集
ds2 = rf.workspace('YOUR_WORKSPACE').project('taiwan-tree-trunk-segmentation').version(1).download('yolov8', '/content/ds2')

# 3. 合併（複製自己的圖片到公開資料集資料夾）
import shutil, glob
for split in ['train', 'valid']:
    for f in glob.glob(f'/content/ds2/{split}/images/*'):
        shutil.copy(f, f'/content/ds1/{split}/images/')
    for f in glob.glob(f'/content/ds2/{split}/labels/*'):
        shutil.copy(f, f'/content/ds1/{split}/labels/')

# 用合併後的資料集訓練
data_yaml_path = '/content/ds1/data.yaml'
```

---

## 精度提升路線圖

| 階段 | 資料量 | 預期 mAP50 | 說明 |
|------|--------|-----------|------|
| V1 | 公開 1.3k | ~75-80% | 先用起來 |
| V2 | + 200 張台灣樹 | ~82-87% | 最小可行改進 |
| V3 | + 500 張台灣樹 | ~88-92% | 顯著改進 |
| V4 | + 1000 張 + 困難案例 | ~92-95% | 生產級品質 |

### 困難案例（V4 重點收集）
- 逆光剪影
- 被其他樹遮擋的樹幹
- 非常粗的樹（如百年榕樹 DBH > 100cm）
- 非常細的樹（DBH < 10cm）
- 有寄生植物/藤蔓纏繞的樹幹
- 彩繪過的行道樹（白色反光漆）

---

## 標註時間估算

| 照片數量 | 標註時間 | 訓練時間 (T4 GPU) |
|---------|---------|-------------------|
| 200 張 | ~2 小時 | ~30 分鐘 |
| 500 張 | ~5 小時 | ~50 分鐘 |
| 1000 張 | ~10 小時 | ~80 分鐘 |

> 建議分批做：每次出門拍 50 張，回來花 30 分鐘標，持續累積。
