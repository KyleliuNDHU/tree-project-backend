"""
NPU + GPU Collaboration Test for Depth Pro
============================================
Tests 3 strategies:
  A) GPU-only baseline (current production)
  B) HETERO with manual affinity (fov_encoder->NPU, rest->GPU)
  C) INT8 quantization on GPU (if B fails)

Run:
  python test_npu_depth_pro.py gpu       # GPU-only baseline
  python test_npu_depth_pro.py hetero    # HETERO manual affinity
  python test_npu_depth_pro.py split     # Manual model split (3 sub-models)
  python test_npu_depth_pro.py all       # All tests
"""

import os
import sys
import time
import gc
import numpy as np


OV_PATH = os.path.join("openvino_models", "depth_pro", "openvino_model.xml")
CACHE_DIR = os.path.join("openvino_models", "cache")


def _load_and_reshape():
    from openvino import Core
    core = Core()
    model = core.read_model(OV_PATH)
    model.reshape({"pixel_values": [1, 3, 1536, 1536]})
    return core, model


def _print_header():
    from openvino import Core
    core = Core()
    print("=" * 65)
    print("  Depth Pro — GPU vs NPU+GPU Benchmark")
    print("=" * 65)
    for d in core.available_devices:
        name = core.get_property(d, "FULL_DEVICE_NAME")
        print(f"  {d}: {name}")
    print(f"  Model: {OV_PATH}")
    print(f"  Exists: {os.path.exists(OV_PATH)}")
    print("=" * 65)


# ================================================================
# Strategy A: GPU-only baseline
# ================================================================

def test_gpu_baseline():
    """Current production setup: GPU FP16."""
    print("\n" + "─" * 65)
    print("[Strategy A] GPU-only (FP16) — Current Production Baseline")
    print("─" * 65)

    core, model = _load_and_reshape()
    os.makedirs(CACHE_DIR, exist_ok=True)

    t0 = time.time()
    try:
        compiled = core.compile_model(model, "GPU", config={
            "INFERENCE_PRECISION_HINT": "f16",
            "CACHE_DIR": CACHE_DIR,
        })
        t_compile = time.time() - t0
        print(f"  Compilation: {t_compile:.1f}s")
    except Exception as e:
        print(f"  FAIL (compile): {e}")
        return None

    dummy = np.random.randn(1, 3, 1536, 1536).astype(np.float32)

    # Warmup
    print("  Warmup inference...")
    try:
        compiled([dummy])
    except Exception as e:
        print(f"  FAIL (warmup): {e}")
        return None

    # Timed runs (3 iterations)
    times = []
    for i in range(3):
        t0 = time.time()
        result = compiled([dummy])
        dt = time.time() - t0
        times.append(dt)
        print(f"  Run {i+1}: {dt:.2f}s")

    avg = sum(times) / len(times)
    print(f"  Average: {avg:.2f}s")

    # Output info
    for idx, out in enumerate(result.values()):
        arr = np.asarray(out)
        print(f"  Output {idx}: shape={arr.shape}, range=[{arr.min():.3f}, {arr.max():.3f}]")

    print(f"  [RESULT] GPU-only: {avg:.2f}s per inference")
    del compiled
    gc.collect()
    return avg


# ================================================================
# Strategy B: HETERO with manual affinity
# ================================================================

def test_hetero_manual_affinity():
    """
    Manually assign fov_encoder layers to NPU, everything else to GPU.
    fov_encoder is the smallest (24 blocks, ~1900 ops) and independent.
    """
    print("\n" + "─" * 65)
    print("[Strategy B] HETERO — fov_encoder→NPU, rest→GPU")
    print("─" * 65)

    core, model = _load_and_reshape()
    ops = list(model.get_ops())

    # Find fov_encoder ops by name pattern
    npu_count = 0
    gpu_count = 0
    for op in ops:
        name = op.get_friendly_name()
        if "fov_model.fov_encoder" in name or "fov_model.conv" in name or "fov_model.head" in name:
            # Assign fov-related ops to NPU
            rt_info = op.get_rt_info()
            rt_info["affinity"] = "NPU"
            npu_count += 1
        else:
            rt_info = op.get_rt_info()
            rt_info["affinity"] = "GPU"
            gpu_count += 1

    print(f"  NPU ops (fov_encoder): {npu_count}")
    print(f"  GPU ops (rest):        {gpu_count}")

    t0 = time.time()
    try:
        compiled = core.compile_model(model, "HETERO:NPU,GPU", config={
            "INFERENCE_PRECISION_HINT": "f16",
            "CACHE_DIR": CACHE_DIR,
        })
        t_compile = time.time() - t0
        print(f"  Compilation: {t_compile:.1f}s")
    except Exception as e:
        print(f"  FAIL: {e}")
        return None

    dummy = np.random.randn(1, 3, 1536, 1536).astype(np.float32)

    print("  Warmup inference...")
    try:
        compiled([dummy])
    except Exception as e:
        print(f"  FAIL (warmup): {e}")
        return None

    times = []
    for i in range(3):
        t0 = time.time()
        result = compiled([dummy])
        dt = time.time() - t0
        times.append(dt)
        print(f"  Run {i+1}: {dt:.2f}s")

    avg = sum(times) / len(times)
    print(f"  Average: {avg:.2f}s")
    print(f"  [RESULT] HETERO (fov→NPU): {avg:.2f}s per inference")
    del compiled
    gc.collect()
    return avg


# ================================================================
# Strategy C: Manual split — export 3 sub-models
# ================================================================

def test_manual_split():
    """
    Split Depth Pro into sub-models and run on different devices.
    
    This approach exports sub-models from PyTorch level for maximum control.
    Requires transformers with DepthPro support.
    """
    print("\n" + "─" * 65)
    print("[Strategy C] Manual Split — separate encoder sub-models")
    print("─" * 65)

    try:
        import torch
        from transformers import DepthProForDepthEstimation
    except ImportError as e:
        print(f"  SKIP: {e}")
        return None

    from openvino import Core
    import openvino as ov

    core = Core()
    split_dir = os.path.join("openvino_models", "depth_pro_split")
    os.makedirs(split_dir, exist_ok=True)

    # Check if sub-models already exported
    fov_xml = os.path.join(split_dir, "fov_encoder.xml")
    if os.path.exists(fov_xml):
        print("  Sub-models already exported, loading...")
    else:
        print("  Exporting sub-models from PyTorch (one-time)...")
        print("  Loading Depth Pro model...")

        torch.set_grad_enabled(False)
        model = DepthProForDepthEstimation.from_pretrained(
            "apple/DepthPro-hf", torch_dtype=torch.float32
        )
        model.eval()

        # Export FOV encoder separately
        print("  Exporting fov_encoder...")
        fov_encoder = model.fov_model.fov_encoder
        dummy_fov = torch.zeros(1, 3, 384, 384)  # FOV uses smaller input
        try:
            ov_fov = ov.convert_model(fov_encoder, example_input=dummy_fov)
            ov.save_model(ov_fov, fov_xml, compress_to_fp16=True)
            print(f"  Saved fov_encoder to {fov_xml}")
        except Exception as e:
            print(f"  fov_encoder export failed: {e}")

        del model
        gc.collect()

    # Try loading and running fov_encoder on NPU
    if os.path.exists(fov_xml):
        print("  Compiling fov_encoder on NPU...")
        fov_model = core.read_model(fov_xml)
        t0 = time.time()
        try:
            fov_compiled = core.compile_model(fov_model, "NPU", config={
                "INFERENCE_PRECISION_HINT": "f16",
            })
            print(f"  fov_encoder on NPU: compiled in {time.time()-t0:.1f}s")
            dummy = np.random.randn(1, 3, 384, 384).astype(np.float32)
            t0 = time.time()
            result = fov_compiled([dummy])
            print(f"  fov_encoder NPU inference: {time.time()-t0:.3f}s")
        except Exception as e:
            print(f"  fov_encoder NPU failed: {e}")

    print("  [NOTE] Full split pipeline requires more engineering work")
    return None


# ================================================================
# Quick NPU alive check
# ================================================================

def test_npu_alive():
    """Quick check that NPU responds."""
    from openvino import Core
    import openvino as ov
    from openvino.runtime import opset13 as opset

    core = Core()
    param = opset.parameter([1, 64], dtype=np.float32, name="input")
    weights = opset.constant(np.random.randn(64, 32).astype(np.float32))
    matmul = opset.matmul(param, weights, False, False)
    model = ov.Model([matmul], [param], "tiny")

    compiled = core.compile_model(model, "NPU")
    result = compiled([np.random.randn(1, 64).astype(np.float32)])
    print("  NPU alive check: OK")
    return True


# ================================================================
# Main
# ================================================================

if __name__ == "__main__":
    if not os.path.exists(OV_PATH):
        print(f"ERROR: Model not found at {OV_PATH}")
        print("Run: python export_openvino_custom.py --depth")
        sys.exit(1)

    _print_header()

    mode = sys.argv[1] if len(sys.argv) > 1 else "gpu"

    results = {}

    if mode in ("gpu", "all"):
        results["gpu_baseline"] = test_gpu_baseline()

    if mode in ("hetero", "all"):
        print("\n  Checking NPU...")
        test_npu_alive()
        results["hetero_fov_npu"] = test_hetero_manual_affinity()

    if mode in ("split", "all"):
        results["manual_split"] = test_manual_split()

    # Summary
    print("\n" + "=" * 65)
    print("  Summary")
    print("=" * 65)
    for name, val in results.items():
        if val is not None:
            print(f"  {name}: {val:.2f}s")
        else:
            print(f"  {name}: FAILED / SKIPPED")

    gpu_t = results.get("gpu_baseline")
    hetero_t = results.get("hetero_fov_npu")
    if gpu_t and hetero_t:
        speedup = (gpu_t - hetero_t) / gpu_t * 100
        if speedup > 0:
            print(f"\n  HETERO is {speedup:.1f}% faster than GPU-only!")
        else:
            print(f"\n  GPU-only is {-speedup:.1f}% faster than HETERO")
            print("  → GPU-only is the best strategy for your hardware.")
    print("=" * 65)
