#!/usr/bin/env python3
"""
🌲 訓練後處理 — 獨立格子版
==============================
訓練中斷或跑完後，直接把這個格子內容貼到 Colab 執行。
不需要重新跑資料準備或訓練。

用法：
  new Code Cell → 貼入整個檔案內容 → 執行

會自動：
  1. 找到最好的 best.pt
  2. 在 merged_dataset 驗證（val mAP）
  3. 在 Xiang 驗證集獨立驗證（如果存在）
  4. 匯出 TFLite INT8 + ONNX + PyTorch
  5. 打包 zip + 觸發下載
"""

import os, sys, shutil, glob
import numpy as np

os.environ['PYTHONUNBUFFERED'] = '1'
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

# ── 路徑設定 ─────────────────────────────────────────────
MERGED_DIR   = '/content/merged_dataset'
XIANG_VAL    = '/content/xiang_yolo_validation'
EXPORT_DIR   = '/content/exported_models'
TFLITE_SIZE  = 640
ONNX_SIZE    = 640   # 若訓練用 960px 可改成 960

# ── 自動找 best.pt ────────────────────────────────────────
_candidates = [
    '/content/runs/segment/train/weights/best.pt',
    '/content/runs/segment/train2/weights/best.pt',
    '/content/runs/segment/train3/weights/best.pt',
    '/content/runs/segment/train4/weights/best.pt',
]

best_pt = None
for _c in _candidates:
    if os.path.exists(_c):
        best_pt = _c
        break

if best_pt is None:
    # 最後嘗試：glob 搜尋
    found = sorted(glob.glob('/content/runs/segment/**/best.pt', recursive=True))
    if found:
        best_pt = found[-1]

if best_pt is None:
    print('❌ 找不到任何 best.pt！')
    print('   請確認訓練有跑過，或手動設定 best_pt = "/your/path/best.pt"')
    sys.exit(1)

print(f'✅ 找到模型: {best_pt}')
print(f'   大小: {os.path.getsize(best_pt) / 1024**2:.1f} MB')

import torch
from ultralytics import YOLO

data_yaml_path = os.path.join(MERGED_DIR, 'data.yaml')

# ════════════════════════════════════════════════════════
# Step 8a：匯出 TFLite — 子進程 CPU 模式
# ════════════════════════════════════════════════════════
# onnx2tf 1.28.8 + TF 2.19 在 Blackwell GPU 會觸發
# CUDA_ERROR_INVALID_HANDLE（Slice op 的 tf.cast）。
# 唯一解法：在全新子進程中 **啟動前** 就設
# CUDA_VISIBLE_DEVICES=-1，讓 TF 完全不碰 GPU。
# 這次不走 Ultralytics（會做 INT8 calibration 很慢），
# 而是直接用 onnx2tf + TFLiteConverter，FP16 量化。
print('\n' + '='*60)
print('Step 8a：匯出 TFLite（子進程 CPU 模式）')
print('='*60)

# 清空舊的匯出目錄
if os.path.exists(EXPORT_DIR):
    shutil.rmtree(EXPORT_DIR)
os.makedirs(EXPORT_DIR)

model = YOLO(best_pt)

# 1. 先確保 ONNX 存在（子進程的 onnx2tf 需要它）
_onnx_file = best_pt.replace('.pt', '.onnx')
if not os.path.exists(_onnx_file):
    print('  先匯出 ONNX...')
    model.export(format='onnx', imgsz=TFLITE_SIZE, simplify=True)

_tflite_ok = False

if os.path.exists(_onnx_file):
    import subprocess as _sp

    # 2. 寫入子進程腳本 ── 第 1 行就禁 GPU
    _conv_script = f'''import os, sys, shutil
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

print("[tflite] CPU 模式啟動", flush=True)

TMP = "/content/tflite_tmp"
if os.path.exists(TMP):
    shutil.rmtree(TMP)

# onnx >= 1.16 把 float32_to_bfloat16 從 helper 移走了，
# 但 onnx_graphsurgeon（onnx2tf 依賴）還在用舊 API，
# 主進程裡 PyTorch 會先 import onnx 並 patch 所以沒事，
# 乾淨子進程就會炸。這裡手動補回去。
import numpy as _np, onnx as _onnx
if not hasattr(_onnx.helper, "float32_to_bfloat16"):
    def _f32_to_bf16(fval):
        return int(_np.array([fval], dtype=_np.float32).view(_np.uint32)[0] >> 16)
    _onnx.helper.float32_to_bfloat16 = _f32_to_bf16
    print("[tflite] 已修補 onnx.helper.float32_to_bfloat16", flush=True)

import onnx2tf
print("[tflite] onnx2tf 轉換中（ONNX → SavedModel）...", flush=True)
onnx2tf.convert(
    input_onnx_file_path="{_onnx_file}",
    output_folder_path=TMP,
    non_verbose=True,
)
print("[tflite] SavedModel 完成", flush=True)

# FP16 量化（不需 calibration 資料，速度快）
try:
    import tensorflow as tf
    print("[tflite] FP16 量化中...", flush=True)
    converter = tf.lite.TFLiteConverter.from_saved_model(TMP)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    tflite_model = converter.convert()
    out = "{EXPORT_DIR}/tree_trunk_seg.tflite"
    with open(out, "wb") as f:
        f.write(tflite_model)
    print(f"[tflite] FP16: {{len(tflite_model)/1024**2:.1f}} MB", flush=True)
except Exception as e:
    print(f"[tflite] FP16 量化失敗: {{e}}", flush=True)
    # 回退：使用 onnx2tf 預設產出的 FP32 tflite
    fp32 = os.path.join(TMP, "model_float32.tflite")
    if os.path.exists(fp32):
        shutil.copy2(fp32, "{EXPORT_DIR}/tree_trunk_seg.tflite")
        print(f"[tflite] FP32 fallback: {{os.path.getsize(fp32)/1024**2:.1f}} MB", flush=True)
    else:
        print("[tflite] FAILED", flush=True)
        sys.exit(1)

print("[tflite] SUCCESS", flush=True)
'''
    _script_path = '/content/_tflite_worker.py'
    with open(_script_path, 'w') as _f:
        _f.write(_conv_script)

    # 3. 啟動子進程（完全隔離，無 GPU）
    print(f'  ONNX: {os.path.getsize(_onnx_file)/1024**2:.1f} MB')
    print('  子進程啟動（CUDA 完全停用，純 CPU 轉換）...')
    _env = {k: v for k, v in os.environ.items()}
    _env['CUDA_VISIBLE_DEVICES'] = '-1'

    try:
        _proc = _sp.run(
            [sys.executable, _script_path],
            env=_env,
            capture_output=True,
            text=True,
            timeout=900,   # 15 分鐘（FP16 不需 calibration，夠用）
        )
        for _line in (_proc.stdout or '').strip().split('\n'):
            if _line.strip():
                print(f'  {_line}')
        if _proc.returncode != 0:
            print(f'  ✗ 子進程失敗 (exit={_proc.returncode})')
            _err = (_proc.stderr or '')[-800:]
            if _err:
                print(f'  錯誤:\n{_err}')
        else:
            _tflite_out = os.path.join(EXPORT_DIR, 'tree_trunk_seg.tflite')
            if os.path.exists(_tflite_out):
                print(f'  ✓ TFLite: {os.path.getsize(_tflite_out)/1024**2:.1f} MB')
                _tflite_ok = True
            else:
                print('  ✗ 子進程完成但 TFLite 未產生')
    except _sp.TimeoutExpired:
        print('  ✗ 子進程逾時（15 分鐘）— 跳過 TFLite')
    except Exception as _e:
        print(f'  ✗ 子進程錯誤: {_e}')
else:
    print('  ✗ ONNX 不存在，無法轉 TFLite')

if not _tflite_ok:
    print('\n  ⚠️ TFLite 匯出失敗 — ONNX + PyTorch 仍會正常匯出')
    print('  💡 可在本地離線轉換：')
    print('     CUDA_VISIBLE_DEVICES=-1 onnx2tf -i tree_trunk_seg.onnx -o tflite_out')

# ════════════════════════════════════════════════════════
# Step 6：驗證模型品質（merged_dataset val set）
# ════════════════════════════════════════════════════════
print('\n' + '='*60)
print('Step 6：驗證模型品質')
print('='*60)

# TFLite export 之後重新載入，確保 model 物件狀態乾淨
model = YOLO(best_pt)

if os.path.exists(data_yaml_path):
    metrics = model.val(data=data_yaml_path)
    seg_map50    = float(getattr(metrics.seg, 'map50',    0))
    seg_map50_95 = float(getattr(metrics.seg, 'map',      0))
    box_map50    = float(getattr(metrics.box, 'map50',    0))
    box_p        = float(getattr(metrics.box, 'mp',       0))
    box_r        = float(getattr(metrics.box, 'mr',       0))

    print(f'\n  Detection  mAP50: {box_map50:.3f}  P: {box_p:.3f}  R: {box_r:.3f}')
    print(f'  Segment    mAP50: {seg_map50:.3f}  mAP50-95: {seg_map50_95:.3f}')
    fitness = 0.1 * seg_map50 + 0.9 * seg_map50_95
    print(f'  fitness = 0.1×mAP50 + 0.9×mAP50-95 = {fitness:.4f}')

    if seg_map50 >= 0.85:
        print('\n✅ 模型品質優秀！可以匯出到手機')
    elif seg_map50 >= 0.70:
        print('\n⚠️ 模型品質可以，但建議加更多訓練資料')
    else:
        print('\n❌ 品質不足，需要更多資料或更長訓練')
else:
    print(f'⚠️ 找不到 {data_yaml_path}，跳過 merged_dataset 驗證')

# ════════════════════════════════════════════════════════
# Step 6.5：Xiang et al. 獨立分割品質驗證
# ════════════════════════════════════════════════════════
print('\n' + '='*60)
print('Step 6.5：Xiang et al. 獨立分割品質驗證')
print('='*60)

xiang_yaml    = os.path.join(XIANG_VAL, 'data.yaml')
xiang_img_dir = os.path.join(XIANG_VAL, 'images')

if os.path.exists(xiang_yaml) and os.path.exists(xiang_img_dir):
    # 修補 YAML：Ultralytics val() 要求同時有 train: 和 val: key
    import yaml as _yaml
    with open(xiang_yaml, 'r') as _f:
        _cfg = _yaml.safe_load(_f)
    if 'train' not in _cfg:
        _cfg['train'] = 'images'   # 指向同一個 images 目錄即可（只用來讓 val 不報錯）
        with open(xiang_yaml, 'w') as _f:
            _yaml.dump(_cfg, _f, default_flow_style=False)
        print('  ✓ 已補上 train: key 到 Xiang data.yaml')

    all_img_files = sorted([f for f in os.listdir(xiang_img_dir)
                            if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    n_val = len(all_img_files)
    print(f'  驗證子集: {n_val} 張')

    val_model = YOLO(best_pt)
    xiang_seg_map50  = 0.0
    xiang_box_map50  = 0.0
    try:
        xiang_metrics   = val_model.val(data=xiang_yaml, verbose=False)
        xiang_seg_map50 = float(getattr(xiang_metrics.seg, 'map50', 0))
        xiang_box_map50 = float(getattr(xiang_metrics.box, 'map50', 0))
        print(f'  Box  mAP50:    {xiang_box_map50:.3f}')
        print(f'  Mask mAP50:    {xiang_seg_map50:.3f}')
    except Exception as e:
        print(f'  ⚠️ 驗證指標計算失敗: {e}')

    # 逐圖推論統計
    all_results = []
    for img_file in all_img_files:
        img_p = os.path.join(xiang_img_dir, img_file)
        preds = val_model.predict(img_p, verbose=False)
        n_det   = len(preds[0].boxes)
        max_conf = float(preds[0].boxes.conf.max()) if n_det > 0 else 0.0
        all_results.append({'detected': n_det > 0, 'conf': max_conf})

    n_detected = sum(1 for x in all_results if x['detected'])
    det_rate   = n_detected / n_val * 100 if n_val > 0 else 0
    confs      = [x['conf'] for x in all_results if x['detected']]
    avg_conf   = np.mean(confs) if confs else 0

    print(f'\n  偵測率:     {n_detected}/{n_val} = {det_rate:.1f}%')
    print(f'  平均信心度: {avg_conf:.3f}')

    if xiang_seg_map50 >= 0.85 and det_rate >= 95:
        print('  🏆 優秀')
    elif xiang_seg_map50 >= 0.70 and det_rate >= 85:
        print('  ✅ 良好')
    else:
        print('  ⚠️ 待加強')
else:
    print('  ⚠️ 未找到 Xiang 驗證集，跳過（若有需要可重跑 Step 2.7）')

# ════════════════════════════════════════════════════════
# Step 8b：匯出 ONNX + PyTorch（val 後執行，不影響 TFLite）
# ════════════════════════════════════════════════════════
print('\n' + '='*60)
print('Step 8b：匯出 ONNX + PyTorch')
print('='*60)

# ONNX
print(f'  匯出 ONNX (imgsz={ONNX_SIZE})...')
try:
    onnx_path = model.export(format='onnx', imgsz=ONNX_SIZE, simplify=True)
    if onnx_path:
        shutil.copy2(onnx_path, os.path.join(EXPORT_DIR, 'tree_trunk_seg.onnx'))
        print(f'  ✓ ONNX: {os.path.getsize(onnx_path) / 1024**2:.1f} MB')
except Exception as e:
    print(f'  ✗ ONNX 失敗: {e}')

# PyTorch best.pt
shutil.copy2(best_pt, os.path.join(EXPORT_DIR, 'tree_trunk_seg_best.pt'))
print(f'  ✓ PyTorch best.pt: {os.path.getsize(best_pt) / 1024**2:.1f} MB')

# Labels
with open(os.path.join(EXPORT_DIR, 'tree_trunk_labels.txt'), 'w') as f:
    f.write('tree_trunk\n')

print(f'\n📁 所有模型已匯出到: {EXPORT_DIR}')
for fname in sorted(os.listdir(EXPORT_DIR)):
    size = os.path.getsize(os.path.join(EXPORT_DIR, fname)) / 1024**2
    print(f'   {fname}  ({size:.1f} MB)')

# ════════════════════════════════════════════════════════
# Step 9：打包下載
# ════════════════════════════════════════════════════════
print('\n' + '='*60)
print('Step 9：打包下載')
print('='*60)

os.system('cd /content && zip -r exported_models.zip exported_models/')

try:
    from google.colab import files
    files.download('/content/exported_models.zip')
    print('\n✓ 下載開始！')
except Exception:
    print('\n⚠️ 自動下載失敗（非 Colab 瀏覽器環境）')
    print('   請在左側 Files 面板右鍵 exported_models.zip → Download')

print('\n部署步驟：')
print('  1. tree_trunk_seg.tflite       → frontend/assets/ml/')
print('  2. tree_trunk_labels.txt       → frontend/assets/ml/')
print('  3. tree_trunk_seg.onnx         → backend/ml_service/models/')
print('  4. tree_trunk_seg_best.pt      → 備份留著（日後可繼續 fine-tune）')

print('\n' + '='*60)
print('🎉 後處理完成！')
print('='*60)
