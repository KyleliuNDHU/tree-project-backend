#!/usr/bin/env python3
"""
Pinnacle Mode — Environment Check
==================================
Verifies Python version, OpenVINO, and optional CUDA availability.
Run before setup_models.py or starting the Fusion Pipeline.
"""

import sys
import platform

def main():
    print("=" * 60)
    print("  Pinnacle Mode — Environment Check")
    print("=" * 60)

    # Python
    py_ver = sys.version_info
    ok = py_ver >= (3, 10)
    print(f"  Python:     {sys.version.split()[0]} {'[OK]' if ok else '[need >=3.10]'}")

    # CUDA (optional; Intel Core Ultra typically has no NVIDIA)
    try:
        import torch
        cuda = torch.cuda.is_available()
        print(f"  CUDA:       {'Available' if cuda else 'Not available (OK for Intel)'}")
    except ImportError:
        print("  CUDA:       (torch not installed)")

    # OpenVINO
    try:
        import openvino as ov
        core = ov.Core()
        devices = core.available_devices
        has_gpu = "GPU" in devices
        has_npu = "NPU" in devices
        print(f"  OpenVINO:   {ov.__version__} [OK]")
        print(f"  Devices:    {', '.join(devices)}")
        if has_gpu:
            print("             → Intel Arc iGPU detected")
        if has_npu:
            print("             → Intel NPU detected")
    except ImportError:
        print("  OpenVINO:   Not installed")
        print("             → pip install openvino optimum[intel]")

    # Optimum Intel
    try:
        from optimum.intel import OVModelForDepthEstimation
        print("  Optimum:    optimum[intel] [OK]")
    except ImportError:
        print("  Optimum:    optimum[intel] not installed")
        print("             → pip install optimum[intel]")

    # Transformers (Depth Pro, SAM 2)
    try:
        import transformers
        print(f"  Transformers: {transformers.__version__} [OK]")
        try:
            from transformers import DepthProForDepthEstimation
            has_dp = True
        except ImportError:
            has_dp = False
        try:
            from transformers import Sam2Model
            has_sam2 = True
        except ImportError:
            has_sam2 = False
        print(f"             DepthPro: {'[OK]' if has_dp else '[?]'} | SAM2: {'[OK]' if has_sam2 else '[?]'}")
    except ImportError:
        print("  Transformers: Not installed")

    # SAM 2 native (optional)
    try:
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        print("  SAM 2 pkg:  Installed [OK] (for OpenVINO conversion)")
    except ImportError:
        print("  SAM 2 pkg:  Not installed (optional; for OpenVINO SAM conversion)")

    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
