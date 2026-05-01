#!/usr/bin/env python3
"""
🔍 Sample old YOLOv8m-seg predictions vs Kaggle GT masks
=========================================================
目標：用舊 YOLO 對 Kaggle 子集 inference，找出「GT 標 < YOLO 抓到」的影像
    → 找出 under-labeled 樣本，估計人工要花多少時間 review

輸出：
  - sample_yolo_vs_gt/visual/<stem>.jpg  三聯圖 (orig | gt | yolo)
  - sample_yolo_vs_gt/diff/<stem>.jpg    GT vs YOLO 差異圖（紅=GT 標、綠=YOLO 抓、黃=兩者）
  - sample_yolo_vs_gt/_summary.csv       每張 stats:
      gt_area_pct, yolo_area_pct, iou,
      yolo_minus_gt_pct (YOLO 抓到但 GT 沒標的面積比例 = 疑似 under-label),
      gt_minus_yolo_pct (GT 標但 YOLO 沒抓的面積)

注意：先不修任何資料，只是看 YOLO 多偵測到多少。
"""

import argparse
import csv
import random
import sys
from pathlib import Path

import cv2
import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

YOLO_PT = r"C:\projects\tree_project\project_code\backend\ml_service\trunk_detector_training\tree_trunk_seg_best.pt"
KAGGLE_VOC_ROOT = r"C:\projects\tree_project\trunk_training_data\kaggle_urban_street\trunk\VOCdevkit\VOC2012"
OUT_ROOT = Path(r"C:\projects\tree_project\trunk_training_data\sample_yolo_vs_gt")
RNG_SEED = 42


def gt_mask_from_voc(seg_png: Path, target_shape) -> np.ndarray:
    """Kaggle VOC PNG → binary uint8 (0/255), resized to target_shape (H,W)."""
    m = cv2.imread(str(seg_png), cv2.IMREAD_GRAYSCALE)
    if m is None:
        return np.zeros(target_shape, np.uint8)
    if m.max() <= 1:
        b = (m > 0).astype(np.uint8) * 255
    else:
        b = np.zeros_like(m)
        b[(m > 0) & (m < 255)] = 255
    if b.shape != target_shape:
        b = cv2.resize(b, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_NEAREST)
    return b


def yolo_mask_union(model, img_path: Path, conf=0.25) -> np.ndarray:
    """Run YOLOv8m-seg, union all trunk masks → binary uint8 (orig HxW)."""
    img = cv2.imread(str(img_path))
    if img is None:
        return None  # type: ignore
    h, w = img.shape[:2]
    out = np.zeros((h, w), np.uint8)
    res = model.predict(source=str(img_path), conf=conf, verbose=False, imgsz=640)
    if not res or res[0].masks is None:
        return out
    masks = res[0].masks.data.cpu().numpy()  # N x H_yolo x W_yolo
    for m in masks:
        rm = cv2.resize((m > 0.5).astype(np.uint8) * 255, (w, h), interpolation=cv2.INTER_NEAREST)
        out = np.maximum(out, rm)
    return out


def overlay(img: np.ndarray, mask: np.ndarray, color, alpha=0.5):
    out = img.copy()
    layer = np.zeros_like(img)
    layer[mask > 0] = color
    return cv2.addWeighted(out, 1.0, layer, alpha, 0)


def diff_visual(img, gt, yolo):
    """紅=GT only, 綠=YOLO only, 黃=both."""
    out = img.copy()
    layer = np.zeros_like(img)
    both = (gt > 0) & (yolo > 0)
    gt_only = (gt > 0) & ~both
    yolo_only = (yolo > 0) & ~both
    layer[gt_only] = (0, 0, 255)      # red
    layer[yolo_only] = (0, 255, 0)    # green
    layer[both] = (0, 255, 255)       # yellow
    return cv2.addWeighted(out, 0.5, layer, 0.5, 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20, help="sample size")
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--seed", type=int, default=RNG_SEED)
    args = ap.parse_args()

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "visual").mkdir(exist_ok=True)
    (OUT_ROOT / "diff").mkdir(exist_ok=True)

    voc_root = Path(KAGGLE_VOC_ROOT)
    jpeg_dir = voc_root / "JPEGImages"
    seg_dir = voc_root / "SegmentationClass"
    masks_all = sorted([f for f in seg_dir.iterdir() if f.suffix.lower() == ".png"])
    print(f"Kaggle: {len(masks_all)} masks total")

    rng = random.Random(args.seed)
    chosen = rng.sample(masks_all, min(args.n, len(masks_all)))
    print(f"Sampling {len(chosen)} for visual diff")

    print(f"Loading YOLO from {YOLO_PT} ...")
    from ultralytics import YOLO
    model = YOLO(YOLO_PT)

    rows = []
    for i, mask_p in enumerate(chosen):
        stem = mask_p.stem
        img_p = None
        for ext in [".jpg", ".jpeg", ".png", ".JPG"]:
            cand = jpeg_dir / f"{stem}{ext}"
            if cand.exists():
                img_p = cand
                break
        if img_p is None:
            continue
        img = cv2.imread(str(img_p))
        if img is None:
            continue
        h, w = img.shape[:2]
        gt = gt_mask_from_voc(mask_p, (h, w))
        yolo = yolo_mask_union(model, img_p, conf=args.conf)
        if yolo is None:
            continue

        gt_area = int((gt > 0).sum())
        yolo_area = int((yolo > 0).sum())
        inter = int(((gt > 0) & (yolo > 0)).sum())
        union = int(((gt > 0) | (yolo > 0)).sum())
        total = h * w
        iou = inter / max(union, 1)
        yolo_minus_gt = ((yolo > 0) & (gt == 0)).sum() / max(total, 1) * 100
        gt_minus_yolo = ((gt > 0) & (yolo == 0)).sum() / max(total, 1) * 100

        rows.append({
            "stem": stem,
            "gt_area_pct": round(gt_area / total * 100, 3),
            "yolo_area_pct": round(yolo_area / total * 100, 3),
            "iou": round(iou, 4),
            "yolo_minus_gt_pct": round(float(yolo_minus_gt), 3),
            "gt_minus_yolo_pct": round(float(gt_minus_yolo), 3),
        })

        # Triple
        gt_overlay = overlay(img, gt, (0, 0, 255), 0.4)
        yolo_overlay = overlay(img, yolo, (0, 255, 0), 0.4)
        h2 = 480
        scale = h2 / h
        triple = cv2.hconcat([
            cv2.resize(img, (int(w * scale), h2)),
            cv2.resize(gt_overlay, (int(w * scale), h2)),
            cv2.resize(yolo_overlay, (int(w * scale), h2)),
        ])
        cv2.putText(triple, "ORIG", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(triple, "GT (red)", (int(w * scale) + 10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(triple, f"YOLO conf>={args.conf} (green)", (int(w * scale) * 2 + 10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(triple, f"IoU={iou:.2f} y-g={yolo_minus_gt:.1f}% g-y={gt_minus_yolo:.1f}%",
                    (10, h2 - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        cv2.imwrite(str(OUT_ROOT / "visual" / f"{stem}.jpg"), triple)

        diff = diff_visual(img, gt, yolo)
        diff_small = cv2.resize(diff, (int(w * scale), h2))
        cv2.putText(diff_small, "RED=GT only  GREEN=YOLO only  YELLOW=both",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.imwrite(str(OUT_ROOT / "diff" / f"{stem}.jpg"), diff_small)

        print(f"  [{i+1}/{len(chosen)}] {stem}  IoU={iou:.2f}  yolo-gt={yolo_minus_gt:.1f}%  gt-yolo={gt_minus_yolo:.1f}%")

    # Summary CSV
    with open(OUT_ROOT / "_summary.csv", "w", newline="", encoding="utf-8") as f:
        wcsv = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else
                              ["stem", "gt_area_pct", "yolo_area_pct", "iou", "yolo_minus_gt_pct", "gt_minus_yolo_pct"])
        wcsv.writeheader()
        wcsv.writerows(rows)

    if rows:
        ious = [r["iou"] for r in rows]
        ymg = [r["yolo_minus_gt_pct"] for r in rows]
        print("\n=== summary ===")
        print(f"  IoU  mean={np.mean(ious):.3f}  median={np.median(ious):.3f}  min={min(ious):.3f}")
        print(f"  yolo_minus_gt%  mean={np.mean(ymg):.2f}  median={np.median(ymg):.2f}  max={max(ymg):.2f}")
        print(f"  ↑ 高代表 GT 標漏 (YOLO 抓到但 GT 沒標)")
    print(f"\n✅ Done. Open {OUT_ROOT}\\visual\\ to inspect")


if __name__ == "__main__":
    main()
