#!/usr/bin/env python3
"""
Lightweight Depth Pro Memory Stability Test
============================================
Loads ONLY Apple Depth Pro — no FastAPI, no SAM 2. Minimal dependencies.

Use to verify Depth Pro runs without OOM and memory stays stable:
  python test_depth_pro.py [path/to/test/image.jpg]
  python test_depth_pro.py                    # synthetic 518x518 if no path
  python test_depth_pro.py --load-only        # load model only, no inference (memory baseline)
"""

import os
import sys
import time

# Force Depth Pro for reproducible memory footprint
os.environ["ML_DEPTH_MODEL"] = "depth_pro"
# Do not force ML_USE_OPENVINO to false so we can test the OpenVINO speed
# os.environ["ML_USE_OPENVINO"] = "false"
os.environ["ML_ENABLE_SAM"] = "false"

# Add parent so imports work
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)


def _get_memory_mb():
    """Return current process memory in MB, if psutil available."""
    try:
        import psutil
        return psutil.Process().memory_info().rss / (1024 * 1024)
    except ImportError:
        return None


def _load_test_image(path):
    """Load image from path, or create minimal synthetic image."""
    from PIL import Image
    import numpy as np

    if path and os.path.isfile(path):
        img = Image.open(path).convert("RGB")
        print(f"[Test] Loaded: {path} ({img.size[0]}x{img.size[1]})")
        return img

    # Synthetic 518x518 RGB (Depth Pro will resize internally to 1536)
    arr = np.random.randint(0, 255, (518, 518, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    print("[Test] No image path given; using synthetic 518x518 image")
    return img


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    load_only = "--load-only" in flags
    image_path = args[0] if args else None

    # Try common locations if no path provided
    if not image_path:
        for d in ("test_photos", "assets", "static", ".."):
            cand = os.path.join(_script_dir, d)
            if os.path.isdir(cand):
                for ext in ("*.jpg", "*.jpeg", "*.png"):
                    import glob
                    matches = glob.glob(os.path.join(cand, ext))
                    if matches:
                        image_path = matches[0]
                        break
            if image_path:
                break

    img = None if load_only else _load_test_image(image_path)

    mem_before = _get_memory_mb()
    if mem_before is not None:
        print(f"[Memory] Before load: {mem_before:.1f} MB")

    # Import only what we need — no FastAPI, no SAM
    from depth_estimation import load_model, estimate_depth_rich

    print("[Test] Loading Depth Pro (apple/DepthPro-hf)...")
    t0 = time.perf_counter()
    load_model()
    load_time = time.perf_counter() - t0
    print(f"[Test] Model loaded in {load_time:.2f}s")

    mem_after_load = _get_memory_mb()
    if mem_after_load is not None:
        print(f"[Memory] After load: {mem_after_load:.1f} MB")
        if mem_before is not None:
            print(f"[Memory] Delta: +{mem_after_load - mem_before:.1f} MB")

    if load_only:
        print("\n[OK] Depth Pro loaded successfully (--load-only). Memory baseline captured.")
        return 0

    print("[Test] Running inference...")
    t1 = time.perf_counter()
    result = estimate_depth_rich(img)  # img guaranteed non-None when not load_only
    infer_time = time.perf_counter() - t1
    print(f"[Test] Inference: {infer_time:.2f}s")

    mem_after_infer = _get_memory_mb()
    if mem_after_infer is not None:
        print(f"[Memory] After inference: {mem_after_infer:.1f} MB")
        if mem_after_load is not None:
            print(f"[Memory] Inference delta: +{mem_after_infer - mem_after_load:.1f} MB")

    d = result.depth_map
    print(f"[Test] Depth map: {d.shape}, range [{d.min():.3f}, {d.max():.3f}] m")
    if result.auto_focal_length_px is not None:
        print(f"[Test] Auto focal: {result.auto_focal_length_px:.1f} px")
    if result.auto_fov_degrees is not None:
        print(f"[Test] Auto FOV: {result.auto_fov_degrees:.1f} deg")

    print("\n[OK] Depth Pro ran successfully — no OOM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
