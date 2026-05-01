#!/usr/bin/env python3
"""
🚂 Local YOLOv8-seg trainer (Windows + auto device detect)
=================================================================
- 自動偵測 device:
    - CUDA (NVIDIA, e.g. GTX 1060)         → batch 8/16
    - Intel XPU (Arc iGPU via IPEX)        → batch 4
    - CPU                                  → batch 4 (慢)
- 訓練完自動 export ONNX + TFLite (INT8)
- 兩個必要 flag:
    --data <path/to/data.yaml>     由 prepare_merged_local.py 產生
    --model {n,s,m}                yolov8 segmentation size
=================================================================
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def detect_device():
    """Return (device_str, label, vram_gb)."""
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            vram = (getattr(props, "total_memory", 0) or 0) / 1024**3
            return "0", torch.cuda.get_device_name(0), vram
        # Intel XPU
        try:
            import intel_extension_for_pytorch  # noqa: F401
            if hasattr(torch, "xpu") and torch.xpu.is_available():
                return "xpu:0", "Intel XPU", 2.0
        except ImportError:
            pass
    except ImportError:
        pass
    return "cpu", "CPU", 0.0


def pick_batch(model_size: str, device_label: str, vram_gb: float, override: int) -> int:
    if override > 0:
        return override
    if "GTX 1060" in device_label or vram_gb < 7:
        return {"n": 16, "s": 8, "m": 4}.get(model_size, 8)
    if vram_gb >= 20:
        return {"n": 64, "s": 32, "m": 16}.get(model_size, 32)
    if vram_gb >= 10:
        return {"n": 32, "s": 16, "m": 8}.get(model_size, 16)
    if device_label == "Intel XPU":
        return {"n": 4, "s": 2, "m": 1}.get(model_size, 4)
    return {"n": 8, "s": 4, "m": 2}.get(model_size, 4)  # CPU


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="path to data.yaml from prepare_merged_local.py")
    ap.add_argument("--model", choices=["n", "s", "m"], default="n")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=0, help="override auto batch size")
    ap.add_argument("--project", default=r"C:\projects\tree_project\trunk_training_data\runs",
                    help="ultralytics runs dir")
    ap.add_argument("--name", default="", help="run name (default auto)")
    ap.add_argument("--no-export", action="store_true", help="skip ONNX/TFLite export")
    ap.add_argument("--patience", type=int, default=20, help="early stopping patience")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    data_yaml = Path(args.data).resolve()
    if not data_yaml.exists():
        sys.exit(f"❌ data.yaml not found: {data_yaml}")

    # GPU 友善設定
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    import torch
    torch.backends.cudnn.benchmark = True
    if hasattr(torch.backends, "cuda"):
        torch.backends.cuda.matmul.allow_tf32 = True

    from ultralytics import YOLO

    device, dev_label, vram = detect_device()
    batch = pick_batch(args.model, dev_label, vram, args.batch)
    print(f"\n🖥️  Device: {dev_label} ({vram:.1f} GB) | device str = {device}")
    print(f"📦 Model: yolov8{args.model}-seg | batch={batch} | imgsz={args.imgsz} | epochs={args.epochs}")
    print(f"🗂️  Data: {data_yaml}")

    variant_tag = data_yaml.parent.name  # merged_no_xiang / merged_with_xiang
    run_name = args.name or f"{variant_tag}_yolov8{args.model}_{int(time.time())}"

    model = YOLO(f"yolov8{args.model}-seg.pt")
    t0 = time.time()
    results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=batch,
        device=device,
        project=args.project,
        name=run_name,
        patience=args.patience,
        workers=args.workers,
        cache=False,           # GTX 1060 6GB / 16GB RAM 別 cache 整個資料集
        exist_ok=False,
        verbose=True,
    )
    elapsed = time.time() - t0
    print(f"\n✅ Train done in {elapsed/60:.1f} min")

    save_dir = Path(args.project) / run_name
    best_pt = save_dir / "weights" / "best.pt"
    print(f"🏆 best.pt: {best_pt}")

    # Validation on test split
    print("\n🔬 Validating on test split ...")
    metrics = model.val(
        data=str(data_yaml),
        split="test",
        device=device,
        imgsz=args.imgsz,
        batch=batch,
        project=args.project,
        name=f"{run_name}_test",
        verbose=True,
    )
    print(f"  test metrics: mAP50-95(box)={metrics.box.map:.4f} | mAP50-95(seg)={metrics.seg.map:.4f}")

    if not args.no_export and best_pt.exists():
        print("\n📦 Exporting ONNX + TFLite (INT8) ...")
        try:
            best_model = YOLO(str(best_pt))
            best_model.export(format="onnx", imgsz=args.imgsz, simplify=True)
            print(f"  ✓ ONNX → {best_pt.with_suffix('.onnx')}")
        except Exception as e:
            print(f"  ⚠️ ONNX export failed: {e}")
        try:
            best_model = YOLO(str(best_pt))
            best_model.export(format="tflite", imgsz=args.imgsz, int8=True, data=str(data_yaml))
            print(f"  ✓ TFLite INT8 (find under {best_pt.parent})")
        except Exception as e:
            print(f"  ⚠️ TFLite export failed: {e}")

    print(f"\n🎯 Done. Inspect: {save_dir}")


if __name__ == "__main__":
    main()
