"""
Depth Pro — INT8 Weight Compression (Minimal Accuracy Loss)
=============================================================
Compresses model weights from FP16 → INT8 while keeping activations in FP16.

Why this approach:
  - Weight-only compression (NOT full INT8 quantization)
  - Accuracy loss typically < 0.1-0.3% (negligible for depth estimation)
  - Memory footprint reduced ~50%
  - Inference speed improved ~20-40% on Intel iGPU
  - No calibration dataset needed

Usage:
  cd backend\ml_service
  .\venv\Scripts\Activate.ps1
  python compress_depth_pro.py              # INT8_SYM (default, fastest)
  python compress_depth_pro.py --mode asym  # INT8_ASYM (slightly better quality)
  python compress_depth_pro.py --test       # Compress + run speed comparison
"""

import os
import sys
import time
import gc
import argparse
import numpy as np


OV_DIR = os.path.join("openvino_models", "depth_pro")
OV_XML = os.path.join(OV_DIR, "openvino_model.xml")
OUT_DIR = os.path.join("openvino_models", "depth_pro_int8w")
OUT_XML = os.path.join(OUT_DIR, "openvino_model.xml")
CACHE_DIR = os.path.join("openvino_models", "cache")


def compress_weights(mode: str = "sym"):
    """
    Compress Depth Pro weights to INT8.
    
    mode:
      "sym"  — INT8_SYM: symmetric quantization, faster inference
      "asym" — INT8_ASYM: asymmetric, slightly better quality
    """
    import nncf
    from openvino import Core, save_model
    
    if not os.path.exists(OV_XML):
        print(f"ERROR: Source model not found at {OV_XML}")
        print("Run: python export_openvino_custom.py --depth")
        return False
    
    os.makedirs(OUT_DIR, exist_ok=True)
    
    print("=" * 60)
    print(f"  Depth Pro Weight Compression (INT8_{mode.upper()})")
    print("=" * 60)
    
    # Load source model
    print("[1/3] Loading FP16 model...")
    core = Core()
    model = core.read_model(OV_XML)
    model.reshape({"pixel_values": [1, 3, 1536, 1536]})
    
    # Count original model size
    orig_size = sum(
        os.path.getsize(os.path.join(OV_DIR, f))
        for f in os.listdir(OV_DIR)
        if f.endswith(('.xml', '.bin'))
    )
    print(f"  Original size: {orig_size / 1024**2:.1f} MB")
    
    # Compress weights
    print(f"[2/3] Compressing weights (mode=INT8_{mode.upper()})...")
    print("  This only compresses weights, activations stay FP16.")
    print("  Expected accuracy loss: < 0.1-0.3%")
    
    if mode == "asym":
        compress_mode = nncf.CompressWeightsMode.INT8_ASYM
    else:
        compress_mode = nncf.CompressWeightsMode.INT8_SYM
    
    t0 = time.time()
    compressed_model = nncf.compress_weights(
        model,
        mode=compress_mode,
    )
    t_compress = time.time() - t0
    print(f"  Compression done in {t_compress:.1f}s")
    
    # Save compressed model
    print(f"[3/3] Saving to {OUT_DIR}...")
    save_model(compressed_model, OUT_XML, compress_to_fp16=False)
    
    # Copy config.json if exists
    config_src = os.path.join(OV_DIR, "config.json")
    if os.path.exists(config_src):
        import shutil
        shutil.copy2(config_src, os.path.join(OUT_DIR, "config.json"))
    
    # Report size reduction
    new_size = sum(
        os.path.getsize(os.path.join(OUT_DIR, f))
        for f in os.listdir(OUT_DIR)
        if f.endswith(('.xml', '.bin'))
    )
    reduction = (1 - new_size / orig_size) * 100
    print()
    print(f"  Original:   {orig_size / 1024**2:.1f} MB")
    print(f"  Compressed: {new_size / 1024**2:.1f} MB")
    print(f"  Reduction:  {reduction:.1f}%")
    print(f"  Mode:       INT8_{mode.upper()} weight-only")
    print()
    print("  ✅ Compression complete!")
    print(f"  Model saved to: {OUT_DIR}")
    
    del model, compressed_model
    gc.collect()
    return True


def benchmark_comparison():
    """Compare FP16 vs INT8-weight models on GPU."""
    from openvino import Core
    
    core = Core()
    
    if not os.path.exists(OUT_XML):
        print("ERROR: Compressed model not found. Run compression first.")
        return
    
    print()
    print("=" * 60)
    print("  Speed Comparison: FP16 vs INT8-Weight")
    print("=" * 60)
    
    dummy = np.random.randn(1, 3, 1536, 1536).astype(np.float32)
    os.makedirs(CACHE_DIR, exist_ok=True)
    
    results = {}
    
    for label, xml_path in [("FP16 (original)", OV_XML), ("INT8-W (compressed)", OUT_XML)]:
        print(f"\n── {label} ──")
        model = core.read_model(xml_path)
        model.reshape({"pixel_values": [1, 3, 1536, 1536]})
        
        t0 = time.time()
        compiled = core.compile_model(model, "GPU", config={
            "INFERENCE_PRECISION_HINT": "f16",
            "CACHE_DIR": CACHE_DIR,
        })
        print(f"  Compile: {time.time()-t0:.1f}s")
        
        # Warmup
        compiled([dummy])
        
        # 3 timed runs
        times = []
        for i in range(3):
            t0 = time.time()
            result = compiled([dummy])
            dt = time.time() - t0
            times.append(dt)
            print(f"  Run {i+1}: {dt:.2f}s")
        
        avg = sum(times) / len(times)
        results[label] = avg
        
        # Output stats
        depth = np.asarray(list(result.values())[0])
        print(f"  Avg: {avg:.2f}s | Depth range: [{depth.min():.2f}, {depth.max():.2f}]")
        
        del compiled, model
        gc.collect()
    
    # Summary
    fp16_t = results.get("FP16 (original)", 0)
    int8w_t = results.get("INT8-W (compressed)", 0)
    
    print()
    print("=" * 60)
    print("  Results")
    print("=" * 60)
    print(f"  FP16:   {fp16_t:.2f}s")
    print(f"  INT8-W: {int8w_t:.2f}s")
    if fp16_t > 0 and int8w_t > 0:
        speedup = (fp16_t - int8w_t) / fp16_t * 100
        if speedup > 0:
            print(f"  Speedup: {speedup:.1f}% faster")
        else:
            print(f"  Difference: {-speedup:.1f}% slower (memory savings still apply)")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Depth Pro INT8 Weight Compression")
    parser.add_argument("--mode", choices=["sym", "asym"], default="sym",
                        help="INT8_SYM (faster) or INT8_ASYM (better quality)")
    parser.add_argument("--test", action="store_true",
                        help="Run speed comparison after compression")
    parser.add_argument("--benchmark-only", action="store_true",
                        help="Skip compression, only benchmark existing models")
    args = parser.parse_args()
    
    if args.benchmark_only:
        benchmark_comparison()
        return
    
    ok = compress_weights(mode=args.mode)
    if ok and args.test:
        benchmark_comparison()


if __name__ == "__main__":
    main()
