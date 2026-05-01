"""
lidar_gt_eval.py
================

Per-pixel depth-quality evaluation against the iPhone LiDAR depth maps that
ship with the Xiang 2025 dataset (`tree_Xiang/treePNG/combine-<id>..png`).

For each of the 294 Xiang samples we
  1. run a monocular depth model (selected via ML_DEPTH_MODEL env var) on the
     full-resolution RGB,
  2. resize the predicted depth and the Xiang GT trunk mask to the native
     LiDAR resolution (~256x192),
  3. decode the 16-bit LiDAR PNG to metric depth using
        depth_m = uint16[4:] * 6.0 / 65536    (per Xiang's MATLAB png16Depth.m)
  4. compute MAE, RMSE, MARE and bias on pixels that are
        (a) inside the Xiang trunk mask
        (b) have a valid LiDAR reading: 0 < |z| <= 4.8 m  (Xiang threshold)
  5. write per-image metrics to a CSV plus an aggregate JSON.

Usage:
    python lidar_gt_eval.py --model da_v2_small --out lidar_eval/da_v2_small.csv
    python lidar_gt_eval.py --model depth_pro  --out lidar_eval/depth_pro.csv

This script bypasses the FastAPI service and imports `depth_estimation`
directly so the depth model is loaded only once per process.

NOTE: do not run this while the benchmark matrix is still running on the same
GPU - they will fight for memory.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageOps

# --- paths ------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[2]               # .../project_code
WORKSPACE_ROOT = PROJECT_ROOT.parent          # .../tree_project
XIANG_DIR = WORKSPACE_ROOT / "tree_Xiang"
RGB_DIR = XIANG_DIR / "treeRGB"
LIDAR_DIR = XIANG_DIR / "treePNG"
SEG_DIR = XIANG_DIR / "treeSeg"
LOG_CSV = XIANG_DIR / "tree_log.csv"

LIDAR_MAX_M = 4.8        # Xiang's "unconvinced" threshold (tree_measurement.m:56)
LIDAR_SCALE = 6.0 / 65536.0


# --- LiDAR decode -----------------------------------------------------------
def load_lidar_depth(name: str) -> Optional[np.ndarray]:
    """Decode a Xiang LiDAR PNG to metric depth (meters).
    Returns None if the file is missing or malformed."""
    p = LIDAR_DIR / f"combine-{name}..png"
    if not p.exists():
        return None
    arr = np.array(Image.open(p))
    if arr.dtype != np.uint16 or arr.ndim != 2 or arr.shape[0] <= 4:
        return None
    depth = arr[4:].astype(np.float32) * LIDAR_SCALE
    return depth


def load_xiang_mask(name: str, target_hw: tuple[int, int]) -> Optional[np.ndarray]:
    """Load and resize Xiang's GT trunk mask to (H, W). Returns boolean array."""
    p = SEG_DIR / f"rgb-{name}-tm.jpg"
    if not p.exists():
        return None
    img = Image.open(p).convert("L")
    img = img.resize((target_hw[1], target_hw[0]), Image.NEAREST)
    a = np.array(img)
    return a > 127


# --- per-sample evaluation --------------------------------------------------
def eval_one(name: str, predict_fn) -> Optional[dict]:
    """Run depth model on RGB and compare with LiDAR inside trunk mask."""
    rgb_path = RGB_DIR / f"rgb-{name}.jpg"
    if not rgb_path.exists():
        return {"name": name, "ok": False, "error": "rgb_missing"}

    lidar = load_lidar_depth(name)
    if lidar is None:
        return {"name": name, "ok": False, "error": "lidar_missing"}
    H_l, W_l = lidar.shape

    mask = load_xiang_mask(name, (H_l, W_l))
    if mask is None:
        return {"name": name, "ok": False, "error": "mask_missing"}

    try:
        pil = Image.open(rgb_path).convert("RGB")
        pil = ImageOps.exif_transpose(pil) or pil
        t0 = time.time()
        info = predict_fn(pil)
        latency = time.time() - t0
    except Exception as e:
        return {"name": name, "ok": False,
                "error": f"predict_fail: {type(e).__name__}: {e}"}

    pred = info["depth_map"].astype(np.float32)
    # resize predicted depth to LiDAR resolution
    pred_pil = Image.fromarray(pred, mode="F").resize(
        (W_l, H_l), Image.BILINEAR)
    pred_l = np.array(pred_pil, dtype=np.float32)

    valid = mask & (lidar > 0.05) & (np.abs(lidar) <= LIDAR_MAX_M) \
            & np.isfinite(pred_l) & np.isfinite(lidar)
    n = int(valid.sum())
    if n < 50:                          # too few trunk-pixels w/ LiDAR
        return {"name": name, "ok": False, "error": f"too_few_pixels:{n}"}

    diff = pred_l[valid] - lidar[valid]
    abs_diff = np.abs(diff)
    rel = abs_diff / np.maximum(lidar[valid], 0.05)
    return {
        "name":          name,
        "ok":            True,
        "n_pixels":      n,
        "mae_m":         float(abs_diff.mean()),
        "rmse_m":        float(np.sqrt(np.mean(diff * diff))),
        "mare":          float(rel.mean()),
        "medae_m":       float(np.median(abs_diff)),
        "bias_m":        float(diff.mean()),
        "mean_pred_m":   float(pred_l[valid].mean()),
        "mean_lidar_m": float(lidar[valid].mean()),
        "latency_s":     round(latency, 3),
    }


# --- aggregate --------------------------------------------------------------
def aggregate(rows: list[dict]) -> dict:
    ok = [r for r in rows if r.get("ok")]
    if not ok:
        return {"n_ok": 0, "n_total": len(rows)}
    arr = lambda k: np.array([r[k] for r in ok], dtype=np.float64)
    return {
        "n_ok":          len(ok),
        "n_total":       len(rows),
        "mae_m":         float(arr("mae_m").mean()),
        "rmse_m":        float(arr("rmse_m").mean()),
        "mare":          float(arr("mare").mean()),
        "medae_m":       float(np.median(arr("medae_m"))),
        "bias_m":        float(arr("bias_m").mean()),
        "avg_latency_s": float(arr("latency_s").mean()),
    }


# --- CLI --------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", required=True,
                   help="ML_DEPTH_MODEL value (da_v2_small, depth_pro, ...)")
    p.add_argument("--out", required=True,
                   help="Output CSV path (JSON sibling will be written too)")
    p.add_argument("--limit", type=int, default=0,
                   help="Stop after N images (0 = all 294)")
    p.add_argument("--openvino", default="auto",
                   choices=("auto", "true", "false"),
                   help="Force ML_USE_OPENVINO. 'auto' = leave existing env.")
    p.add_argument("--ov-device", default=None,
                   help="ML_OV_DEVICE (CPU/GPU/NPU)")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    os.environ["ML_DEPTH_MODEL"] = args.model
    if args.openvino != "auto":
        os.environ["ML_USE_OPENVINO"] = args.openvino
    if args.ov_device:
        os.environ["ML_OV_DEVICE"] = args.ov_device

    # Lazy import after env vars are set
    sys.path.insert(0, str(HERE))
    from depth_estimation import estimate_depth_with_info  # noqa: E402

    # Load Xiang sample list (just the Name column)
    import csv as _csv
    with open(LOG_CSV, "r", encoding="utf-8") as f:
        reader = _csv.DictReader(f)
        names = [r["Name"] for r in reader]
    if args.limit > 0:
        names = names[: args.limit]
    print(f"[lidar-eval] model={args.model}  n_samples={len(names)}")

    out_csv = Path(args.out)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    out_json = out_csv.with_suffix(".json")

    rows: list[dict] = []
    field_order = ["name", "ok", "error", "n_pixels", "mae_m", "rmse_m",
                   "mare", "medae_m", "bias_m", "mean_pred_m",
                   "mean_lidar_m", "latency_s"]
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = _csv.DictWriter(f, fieldnames=field_order)
        w.writeheader()
        t_start = time.time()
        for i, name in enumerate(names, 1):
            try:
                r = eval_one(name, estimate_depth_with_info)
            except Exception as e:
                traceback.print_exc()
                r = {"name": name, "ok": False, "error": f"{type(e).__name__}: {e}"}
            rows.append(r)
            w.writerow({k: r.get(k, "") for k in field_order})
            f.flush()
            if r.get("ok"):
                print(f"[{i:3}/{len(names)}] {name}  "
                      f"MAE={r['mae_m']:.3f}m  bias={r['bias_m']:+.3f}  "
                      f"n={r['n_pixels']}  t={r['latency_s']:.2f}s")
            else:
                print(f"[{i:3}/{len(names)}] {name}  SKIP {r.get('error')}")
        wall = time.time() - t_start

    summary = aggregate(rows)
    summary["model"] = args.model
    summary["wall_s"] = round(wall, 1)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print("[lidar-eval] DONE", json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
