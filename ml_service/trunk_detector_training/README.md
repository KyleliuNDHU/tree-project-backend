# YOLOv8n-seg 樹幹偵測模型訓練指南

## 概述

訓練一個專門辨識 **tree_trunk（樹幹）** 的 YOLOv8n-seg 實例分割模型。  
訓練完成後匯出為 TFLite INT8（手機端 ~6.3MB, 30+ FPS）和 ONNX（伺服器端）。

## 效能預估

| 項目 | 數值 |
|------|------|
| 模型大小 (INT8) | ~6.3 MB |
| 手機推論速度 | 25-35 FPS (Pixel 6 / iPhone 12 以上) |
| 記憶體佔用 | ~50-80 MB |
| 是否會崩潰？ | **不會** — 比現有 ML Kit 還輕量 |

## 快速開始

```bash
# 1. 安裝環境
pip install -r requirements_train.txt

# 2. 準備資料集（三種方式選一）
#    方式 A：從 Roboflow 下載現成資料集
python prepare_dataset.py --source roboflow --api-key YOUR_KEY

#    方式 B：用 SAM 半自動標註自己的照片
python prepare_dataset.py --source local --images-dir /path/to/your/photos

#    方式 C：合併 A+B（推薦）
python prepare_dataset.py --source merged

# 3. 訓練
python train.py

# 4. 驗證精度
python validate_accuracy.py --model runs/segment/train/weights/best.pt

# 5. 匯出到手機
python export_model.py --model runs/segment/train/weights/best.pt
```

## 目錄結構
```
trunk_detector_training/
├── README.md                    # 本文件
├── requirements_train.txt       # 訓練依賴
├── train.py                     # 訓練腳本
├── prepare_dataset.py           # 資料集準備（含 SAM 標註）
├── validate_accuracy.py         # DBH 測量精度驗證
├── export_model.py              # 匯出 TFLite/ONNX
├── dataset.yaml                 # YOLO 資料集描述
├── datasets/                    # (訓練時自動建立)
│   ├── images/
│   │   ├── train/
│   │   └── val/
│   └── labels/
│       ├── train/
│       └── val/
└── runs/                        # (訓練結果)
```
