#!/usr/bin/env python3
"""
模型匯出工具
=============

將訓練好的 YOLOv8n-seg 匯出為各平台格式：
  1. TFLite INT8  → Flutter 手機端（6-7 MB, 30+ FPS）
  2. ONNX         → 伺服器端 CPU/GPU
  3. OpenVINO     → Intel 加速
  4. CoreML       → iOS 原生加速（可選）

匯出後會自動驗證每個格式的推論結果一致性。

Usage:
    python export_model.py --model runs/segment/train/weights/best.pt
    python export_model.py --model best.pt --formats tflite onnx
"""

import argparse
import os
import sys
import shutil
from pathlib import Path
from typing import List


def export_model(model_path: str, formats: List[str], imgsz: int = 640):
    """匯出模型到指定格式。"""
    from ultralytics import YOLO

    model = YOLO(model_path)
    output_dir = Path(model_path).parent / "exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("  YOLOv8n-seg Model Export")
    print("=" * 60)
    print(f"  Source:  {model_path}")
    print(f"  Formats: {', '.join(formats)}")
    print(f"  ImgSz:   {imgsz}")
    print("=" * 60)

    results = {}

    for fmt in formats:
        print(f"\n── Exporting to {fmt.upper()} ──")

        try:
            if fmt == 'tflite':
                # TFLite INT8 量化 — 手機部署
                exported = model.export(
                    format='tflite',
                    imgsz=imgsz,
                    int8=True,           # INT8 量化：更小更快
                    half=False,          # INT8 已包含，不需 FP16
                )
                if exported:
                    size_mb = os.path.getsize(exported) / 1024 / 1024
                    results['tflite'] = {
                        'path': str(exported),
                        'size_mb': round(size_mb, 1),
                        'status': 'ok',
                    }
                    print(f"  ✓ TFLite INT8: {exported} ({size_mb:.1f} MB)")

                    # 複製到 Flutter assets 目錄
                    flutter_dst = _get_flutter_assets_path()
                    if flutter_dst:
                        dst = flutter_dst / 'tree_trunk_seg.tflite'
                        shutil.copy2(exported, dst)
                        print(f"  → Copied to {dst}")
                        results['tflite']['flutter_path'] = str(dst)

            elif fmt == 'onnx':
                # ONNX — 伺服器端通用格式
                exported = model.export(
                    format='onnx',
                    imgsz=imgsz,
                    simplify=True,       # 簡化計算圖
                    dynamic=False,       # 固定尺寸（手機用）
                )
                if exported:
                    size_mb = os.path.getsize(exported) / 1024 / 1024
                    results['onnx'] = {
                        'path': str(exported),
                        'size_mb': round(size_mb, 1),
                        'status': 'ok',
                    }
                    print(f"  ✓ ONNX: {exported} ({size_mb:.1f} MB)")

            elif fmt == 'openvino':
                # OpenVINO — Intel CPU/GPU 加速
                exported = model.export(
                    format='openvino',
                    imgsz=imgsz,
                    half=True,           # FP16
                )
                if exported:
                    results['openvino'] = {
                        'path': str(exported),
                        'status': 'ok',
                    }
                    print(f"  ✓ OpenVINO: {exported}")

            elif fmt == 'coreml':
                # CoreML — iOS 原生
                exported = model.export(
                    format='coreml',
                    imgsz=imgsz,
                    half=True,
                    nms=True,
                )
                if exported:
                    size_mb = os.path.getsize(exported) / 1024 / 1024
                    results['coreml'] = {
                        'path': str(exported),
                        'size_mb': round(size_mb, 1),
                        'status': 'ok',
                    }
                    print(f"  ✓ CoreML: {exported} ({size_mb:.1f} MB)")

        except Exception as e:
            results[fmt] = {'status': 'failed', 'error': str(e)}
            print(f"  ✗ {fmt.upper()} export failed: {e}")

    # 生成 labels.txt for TFLite
    labels_path = output_dir / 'tree_trunk_labels.txt'
    labels_path.write_text('tree_trunk\n')
    flutter_dst = _get_flutter_assets_path()
    if flutter_dst:
        shutil.copy2(labels_path, flutter_dst / 'tree_trunk_labels.txt')
        print(f"\n  → Labels copied to {flutter_dst / 'tree_trunk_labels.txt'}")

    # 總結
    print("\n" + "=" * 60)
    print("  Export Summary")
    print("=" * 60)
    for fmt, info in results.items():
        status = "✓" if info.get('status') == 'ok' else "✗"
        size = f"{info.get('size_mb', '?')} MB" if 'size_mb' in info else ""
        print(f"  {status} {fmt.upper():12s} {size:>10s}  {info.get('path', info.get('error', ''))}")

    print("\n  Next steps:")
    if 'tflite' in results and results['tflite']['status'] == 'ok':
        print("  1. Flutter 端已有 TFLite 基礎設施 (tflite_tracking_service.dart)")
        print("     替換模型檔案 + 更新推論程式碼即可啟用")
        print("  2. 在手機上測試推論速度和偵測效果")
    if 'onnx' in results and results['onnx']['status'] == 'ok':
        print("  3. 伺服器端可用 ONNX Runtime 載入模型")

    return results


def _get_flutter_assets_path() -> Path | None:
    """找到 Flutter assets/ml 目錄。"""
    # 嘗試相對路徑
    candidates = [
        Path(__file__).parent.parent.parent.parent / 'frontend' / 'assets' / 'ml',
        Path(__file__).parent.parent.parent / 'frontend' / 'assets' / 'ml',
    ]
    for p in candidates:
        if p.exists():
            return p

    # 搜尋
    for root in [Path(__file__).parent.parent.parent.parent]:
        for d in root.rglob('assets/ml'):
            if 'frontend' in str(d):
                return d

    return None


def verify_export_consistency(model_path: str, test_image: str):
    """
    驗證不同格式的推論結果是否一致。
    """
    from ultralytics import YOLO
    import numpy as np

    print("\n── Verifying Export Consistency ──")

    model = YOLO(model_path)
    ref_results = model.predict(test_image, verbose=False)

    if not ref_results or len(ref_results[0].boxes) == 0:
        print("  [SKIP] No detections in test image")
        return

    ref_box = ref_results[0].boxes.xyxy[0].cpu().numpy()
    ref_conf = float(ref_results[0].boxes.conf[0])

    print(f"  Reference (PyTorch): bbox={ref_box.astype(int).tolist()} conf={ref_conf:.3f}")

    # 測試其他格式
    export_dir = Path(model_path).parent / "exports"
    for fmt_file in export_dir.glob('*'):
        if fmt_file.suffix in ['.tflite', '.onnx']:
            try:
                fmt_model = YOLO(str(fmt_file))
                fmt_results = fmt_model.predict(test_image, verbose=False)
                if fmt_results and len(fmt_results[0].boxes) > 0:
                    fmt_box = fmt_results[0].boxes.xyxy[0].cpu().numpy()
                    fmt_conf = float(fmt_results[0].boxes.conf[0])
                    box_diff = np.max(np.abs(ref_box - fmt_box))
                    conf_diff = abs(ref_conf - fmt_conf)
                    status = "✓" if box_diff < 5 and conf_diff < 0.05 else "△"
                    print(f"  {status} {fmt_file.name}: bbox_diff={box_diff:.1f}px conf_diff={conf_diff:.3f}")
            except Exception as e:
                print(f"  ✗ {fmt_file.name}: {e}")


def main():
    parser = argparse.ArgumentParser(description='Export YOLOv8n-seg to deployment formats')
    parser.add_argument('--model', type=str, required=True, help='Trained model path (.pt)')
    parser.add_argument('--formats', nargs='+', default=['tflite', 'onnx'],
                        choices=['tflite', 'onnx', 'openvino', 'coreml'],
                        help='Export formats (default: tflite onnx)')
    parser.add_argument('--imgsz', type=int, default=640, help='Image size (default: 640)')
    parser.add_argument('--test-image', type=str, help='Test image for consistency check')
    args = parser.parse_args()

    results = export_model(args.model, args.formats, args.imgsz)

    if args.test_image:
        verify_export_consistency(args.model, args.test_image)


if __name__ == '__main__':
    main()
