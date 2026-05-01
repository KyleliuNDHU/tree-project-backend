#!/usr/bin/env python3
"""
🔬 Apples-to-apples validation: DA3 OV-FP16 vs PT-FP32 with IDENTICAL preprocessing.

Both paths receive the EXACT same tensor produced by DA3's InputProcessor, so any
remaining diff is purely model-numerics (FP16 vs FP32). Pass = median diff < 1%.
"""

from __future__ import annotations
import sys, time
from pathlib import Path
import numpy as np
import torch
from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "third_party" / "depth-anything-3" / "src"))

from depth_anything_3.api import DepthAnything3
from depth_anything_3.utils.io.input_processor import InputProcessor

OV_XML = ROOT / "openvino_models" / "da3_metric_large" / "openvino_model.xml"
XIANG_RGB = Path(r"C:\projects\tree_project\trunk_training_data\xiang_zenodo\data and code\tree\treeRGB")
N_IMGS = 5
PROCESS_RES = 504

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def main():
    print(f"[load] DA3 PyTorch FP32...")
    m = DepthAnything3.from_pretrained("depth-anything/DA3METRIC-LARGE")
    m.eval()
    inner = m.model
    ipr = InputProcessor()

    print(f"[load] OV IR from {OV_XML}")
    import openvino as ov
    core = ov.Core()
    devices = core.available_devices
    target = "GPU" if "GPU" in devices else "CPU"
    print(f"  OV devices={devices}, using {target}")
    ov_model = core.read_model(str(OV_XML))
    print(f"  OV input partial shape: {ov_model.inputs[0].get_partial_shape()}")
    compiled = core.compile_model(ov_model, target)
    out_node = compiled.outputs[0]

    files = sorted([f for f in XIANG_RGB.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png")])[:N_IMGS]
    if not files:
        print("❌ no images"); sys.exit(1)

    diffs_med = []
    for img_p in files:
        img = Image.open(img_p).convert("RGB")
        # Use DA3's own preprocessing → tensor (1, N, 3, H, W) where N=1
        proc, _, _ = ipr([img], None, None, PROCESS_RES, "upper_bound_resize", num_workers=1)
        # proc shape: (1, 3, H, W) (after _stack_batch which drops outer N for single-image)
        # Actually returns (1, N, 3, H, W) — we want (1, 3, H, W) for OV/wrapper
        if proc.dim() == 5:
            pt_in = proc[:, 0]  # (1, 3, H, W)
        else:
            pt_in = proc  # already (1, 3, H, W) or similar
        # DA3 inner expects (B, N, 3, H, W) — add N=1
        pt_in_5d = pt_in.unsqueeze(1).float()
        ov_in = pt_in.numpy().astype(np.float32)
        H, W = pt_in.shape[-2], pt_in.shape[-1]

        # PyTorch FP32 forward (same code path as the export wrapper)
        t0 = time.time()
        with torch.no_grad():
            out_pt = inner(pt_in_5d, None, None, [], False, False, "saddle_balanced")
        d_pt = out_pt["depth"]  # (1, 1, 1, H, W) or (1, 1, H, W)
        if d_pt.dim() == 5:
            d_pt = d_pt[0, 0, 0]
        elif d_pt.dim() == 4:
            d_pt = d_pt[0, 0]
        d_pt = d_pt.cpu().numpy().astype(np.float32)
        pt_ms = (time.time() - t0) * 1000

        # OV inference
        t0 = time.time()
        d_ov = compiled([ov_in])[out_node]
        ov_ms = (time.time() - t0) * 1000
        d_ov = np.asarray(d_ov).squeeze().astype(np.float32)

        # Diff (treat valid metric depth)
        mask = (d_pt > 0.05) & (d_pt < 50.0)
        if mask.sum() == 0:
            mask = np.ones_like(d_pt, dtype=bool)
        rel = np.abs(d_ov[mask] - d_pt[mask]) / np.maximum(d_pt[mask], 1e-3) * 100
        med, p95 = float(np.median(rel)), float(np.percentile(rel, 95))
        diffs_med.append(med)
        print(f"  {img_p.name}: shape={H}x{W}  PT={pt_ms:.0f}ms OV={ov_ms:.0f}ms"
              f"  PT[{d_pt.min():.2f},{d_pt.max():.2f}m] OV[{d_ov.min():.2f},{d_ov.max():.2f}m]"
              f"  |Δd|/d  med={med:.3f}%  p95={p95:.3f}%")

    overall = float(np.median(diffs_med))
    verdict = "✅ PASS (<1%)" if overall < 1.0 else (
              "✅ ACCEPTABLE (<3%)" if overall < 3.0 else
              "⚠️ MARGINAL (<10%)" if overall < 10.0 else "❌ FAIL")
    print(f"\n[summary] median = {overall:.3f}%  → {verdict}")


if __name__ == "__main__":
    main()
