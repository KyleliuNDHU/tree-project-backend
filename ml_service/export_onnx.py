#!/usr/bin/env python3
"""
ONNX Model Export Script
=========================
Export depth estimation models to ONNX format for 1.5-2.5x CPU speedup.

PREREQUISITES:
  pip install optimum onnxruntime

USAGE:
  # Export current (Small) model:
  python export_onnx.py

  # Export Base model (Phase 1):
  python export_onnx.py --model da_v2_base

  # Export with optimization level:
  python export_onnx.py --model da_v2_base --optimize

AFTER EXPORT:
  1. Set ML_USE_ONNX=true environment variable
  2. Restart the ML service
  3. The service will automatically load the ONNX model

BENCHMARK:
  python export_onnx.py --benchmark
"""

import argparse
import os
import sys
import time

def export_model(model_key: str, output_dir: str, optimize: bool = False):
    """Export a depth model to ONNX format."""
    
    # Import here so missing deps give clear error
    try:
        from optimum.onnxruntime import ORTModelForDepthEstimation
    except ImportError:
        print("ERROR: optimum not installed.")
        print("Install with: pip install optimum onnxruntime")
        sys.exit(1)
    
    from model_registry import DEPTH_MODELS
    
    if model_key not in DEPTH_MODELS:
        print(f"ERROR: Unknown model '{model_key}'")
        print(f"Available: {list(DEPTH_MODELS.keys())}")
        sys.exit(1)
    
    config = DEPTH_MODELS[model_key]
    model_id = config.model_id
    out_path = os.path.join(output_dir, "depth")
    
    print(f"Exporting {config.display_name} ({config.params_m}M params)")
    print(f"  Model ID: {model_id}")
    print(f"  Output:   {out_path}")
    print(f"  Optimize: {optimize}")
    print()
    
    # Export
    print("Step 1: Loading and exporting to ONNX...")
    t0 = time.time()
    model = ORTModelForDepthEstimation.from_pretrained(model_id, export=True)
    print(f"  Export completed in {time.time() - t0:.1f}s")
    
    # Save
    print(f"Step 2: Saving to {out_path}...")
    model.save_pretrained(out_path)
    print(f"  Saved!")
    
    # Optimize (optional)
    if optimize:
        try:
            from optimum.onnxruntime import ORTOptimizer
            from optimum.onnxruntime.configuration import OptimizationConfig
            
            print("Step 3: Optimizing ONNX graph...")
            optimizer = ORTOptimizer.from_pretrained(out_path)
            optimization_config = OptimizationConfig(
                optimization_level=99,  # Maximum optimization
                optimize_for_gpu=False,
            )
            optimizer.optimize(
                optimization_config=optimization_config,
                save_dir=out_path,
            )
            print("  Optimized!")
        except Exception as e:
            print(f"  Optimization failed (non-critical): {e}")
    
    # Check file size
    onnx_files = [f for f in os.listdir(out_path) if f.endswith('.onnx')]
    for f in onnx_files:
        size_mb = os.path.getsize(os.path.join(out_path, f)) / 1024 / 1024
        print(f"  {f}: {size_mb:.1f} MB")
    
    print()
    print("✅ Export complete!")
    print()
    print("To use this model:")
    print("  export ML_USE_ONNX=true")
    print("  # Then restart the ML service")


def benchmark(model_key: str, output_dir: str):
    """Compare PyTorch vs ONNX inference speed."""
    
    from PIL import Image
    import numpy as np
    
    from model_registry import DEPTH_MODELS
    
    if model_key not in DEPTH_MODELS:
        print(f"ERROR: Unknown model '{model_key}'")
        sys.exit(1)
    
    config = DEPTH_MODELS[model_key]
    
    # Create a test image
    test_image = Image.fromarray(
        np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    )
    
    print(f"Benchmarking {config.display_name}")
    print(f"Test image: 640x480")
    print()
    
    # PyTorch benchmark
    print("── PyTorch ──")
    try:
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        import torch
        
        processor = AutoImageProcessor.from_pretrained(config.model_id)
        model = AutoModelForDepthEstimation.from_pretrained(
            config.model_id, torch_dtype=torch.float32
        )
        model.eval()
        
        # Warmup
        inputs = processor(images=test_image, return_tensors="pt")
        with torch.no_grad():
            model(**inputs)
        
        # Benchmark
        times = []
        for i in range(5):
            t0 = time.time()
            inputs = processor(images=test_image, return_tensors="pt")
            with torch.no_grad():
                model(**inputs)
            times.append(time.time() - t0)
        
        avg_pt = sum(times) / len(times)
        print(f"  Average: {avg_pt * 1000:.0f} ms")
        print(f"  Times:   {[f'{t*1000:.0f}ms' for t in times]}")
    except Exception as e:
        print(f"  Failed: {e}")
        avg_pt = None
    
    # ONNX benchmark
    print()
    print("── ONNX Runtime ──")
    onnx_path = os.path.join(output_dir, "depth")
    if not os.path.exists(onnx_path):
        print(f"  ONNX model not found at {onnx_path}")
        print(f"  Run: python export_onnx.py --model {model_key}")
        return
    
    try:
        from optimum.onnxruntime import ORTModelForDepthEstimation
        from transformers import AutoImageProcessor
        import onnxruntime as ort
        
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 4
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        processor = AutoImageProcessor.from_pretrained(config.model_id)
        model = ORTModelForDepthEstimation.from_pretrained(
            onnx_path, session_options=sess_options
        )
        
        # Warmup
        inputs = processor(images=test_image, return_tensors="pt")
        model(**inputs)
        
        # Benchmark
        times = []
        for i in range(5):
            t0 = time.time()
            inputs = processor(images=test_image, return_tensors="pt")
            model(**inputs)
            times.append(time.time() - t0)
        
        avg_onnx = sum(times) / len(times)
        print(f"  Average: {avg_onnx * 1000:.0f} ms")
        print(f"  Times:   {[f'{t*1000:.0f}ms' for t in times]}")
    except Exception as e:
        print(f"  Failed: {e}")
        avg_onnx = None
    
    # Summary
    if avg_pt and avg_onnx:
        speedup = avg_pt / avg_onnx
        print()
        print(f"── Summary ──")
        print(f"  PyTorch:  {avg_pt * 1000:.0f} ms")
        print(f"  ONNX:     {avg_onnx * 1000:.0f} ms")
        print(f"  Speedup:  {speedup:.2f}x {'✅' if speedup > 1.2 else '⚠️'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export depth model to ONNX")
    parser.add_argument(
        "--model", default="da_v2_small",
        help="Model key from model_registry.py (e.g. da_v2_small, da_v2_base)"
    )
    parser.add_argument(
        "--output-dir", default="./onnx_models",
        help="Output directory for ONNX models"
    )
    parser.add_argument(
        "--optimize", action="store_true",
        help="Apply ONNX graph optimizations"
    )
    parser.add_argument(
        "--benchmark", action="store_true",
        help="Run PyTorch vs ONNX benchmark"
    )
    
    args = parser.parse_args()
    
    if args.benchmark:
        benchmark(args.model, args.output_dir)
    else:
        export_model(args.model, args.output_dir, args.optimize)
