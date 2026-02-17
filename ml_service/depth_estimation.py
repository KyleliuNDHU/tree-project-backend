"""
Depth Estimation Service
========================
Uses configurable depth model for per-pixel metric depth estimation.

UPGRADE GUIDE:
  Phase 0 (Current): DA V2 Metric Outdoor Small (24.8M, ~1.5s)
  Phase 1: Change ML_DEPTH_MODEL env var to "da_v2_base" → 97.5M, ~5s, +15% accuracy
  Phase 2: Set ML_USE_ONNX=true after exporting → same accuracy, 1.5-2.5x faster
  Phase 3: Change to "da3_metric_large" after testing CPU compatibility
  Phase 4: Switch to MetricAnything for direct 3D point cloud output

All model switching is controlled by model_registry.py — no code changes needed
for Phase 1 and Phase 2 upgrades.
"""

import torch
import numpy as np
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

from model_registry import (
    get_depth_config, USE_ONNX_RUNTIME, ONNX_MODEL_DIR,
    CPU_THREADS, INPUT_SIZE_OVERRIDE,
)

# Singleton model holder
_model = None
_processor = None
_device = None
_model_id = None  # Track which model is loaded for hot-swap detection


def get_device() -> str:
    """Determine the best available device."""
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model(model_id_override: str = None):
    """
    Load depth model (lazy singleton).
    
    Supports:
    - HuggingFace transformers (default)
    - ONNX Runtime (when USE_ONNX_RUNTIME=True, Phase 2+)
    - DA3 native API (Phase 3+, commented out)
    
    Args:
        model_id_override: Override the model_id from registry (for A/B testing)
    """
    global _model, _processor, _device, _model_id

    config = get_depth_config()
    target_model_id = model_id_override or config.model_id
    
    # If same model is already loaded, return it
    if _model is not None and _model_id == target_model_id:
        return _model, _processor

    _device = get_device()
    print(f"[DepthEstimation] Loading {target_model_id} on {_device}...")
    print(f"[DepthEstimation] Backend: {'ONNX Runtime' if USE_ONNX_RUNTIME else 'PyTorch'}")
    
    # ── ONNX Runtime Path (Phase 2+) ──────────────────────────
    # To enable:
    #   1. pip install optimum onnxruntime
    #   2. Export model: python export_onnx.py  (see export_onnx.py)
    #   3. Set ML_USE_ONNX=true
    if USE_ONNX_RUNTIME:
        try:
            from optimum.onnxruntime import ORTModelForDepthEstimation
            import onnxruntime as ort
            
            onnx_path = f"{ONNX_MODEL_DIR}/depth"
            print(f"[DepthEstimation] Loading ONNX model from {onnx_path}...")
            
            # Configure ONNX Runtime session
            sess_options = ort.SessionOptions()
            sess_options.intra_op_num_threads = CPU_THREADS
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            _processor = AutoImageProcessor.from_pretrained(target_model_id)
            _model = ORTModelForDepthEstimation.from_pretrained(
                onnx_path,
                session_options=sess_options,
            )
            _model_id = target_model_id
            print(f"[DepthEstimation] ONNX model loaded! (threads={CPU_THREADS})")
            return _model, _processor
            
        except ImportError:
            print("[DepthEstimation] WARNING: optimum/onnxruntime not installed.")
            print("[DepthEstimation] Falling back to PyTorch. Install with:")
            print("[DepthEstimation]   pip install optimum onnxruntime")
        except Exception as e:
            print(f"[DepthEstimation] WARNING: ONNX load failed: {e}")
            print("[DepthEstimation] Falling back to PyTorch.")
    
    # ── DA3 Native Path (Phase 3+) ────────────────────────────
    # TODO: Uncomment when DA3 CPU support is confirmed
    # if config.backend == "da3_native":
    #     from depth_anything_3.api import DepthAnything3
    #     _model = DepthAnything3.from_pretrained(target_model_id)
    #     _processor = None  # DA3 has its own preprocessing
    #     _model_id = target_model_id
    #     # DA3 metric depth formula: metric_depth = focal * net_output / 300.
    #     # DA3 also provides camera intrinsics estimation — can replace
    #     # the entire focal_length_from_exif / PHONE_SENSORS lookup!
    #     print(f"[DepthEstimation] DA3 model loaded!")
    #     return _model, _processor
    
    # ── MetricAnything Path (Phase 4+) ────────────────────────
    # TODO: Uncomment when MetricAnything integration is ready
    # if config.backend == "metric_anything":
    #     # MetricAnything outputs 3D point cloud directly (XYZ per pixel)
    #     # This fundamentally changes the measurement pipeline:
    #     #   Old: RGB → depth_map → focal_length → pixel_width → DBH
    #     #   New: RGB → point_cloud → trunk_points → fit_cylinder → DBH
    #     # The DBH calculator would need a new path for point cloud input.
    #     pass
    
    # ── Standard PyTorch Path (Phase 0-1) ─────────────────────
    if INPUT_SIZE_OVERRIDE > 0:
        _processor = AutoImageProcessor.from_pretrained(
            target_model_id,
            size={"height": INPUT_SIZE_OVERRIDE, "width": INPUT_SIZE_OVERRIDE},
        )
        print(f"[DepthEstimation] Input size overridden to {INPUT_SIZE_OVERRIDE}x{INPUT_SIZE_OVERRIDE}")
    else:
        _processor = AutoImageProcessor.from_pretrained(target_model_id)
    
    _model = AutoModelForDepthEstimation.from_pretrained(
        target_model_id,
        torch_dtype=torch.float32,
    )
    _model = _model.to(_device)
    _model.eval()

    # Configure thread count for CPU inference
    if _device == "cpu":
        torch.set_num_threads(CPU_THREADS)
        print(f"[DepthEstimation] CPU threads set to {CPU_THREADS}")
    
    _model_id = target_model_id
    print(f"[DepthEstimation] Model loaded successfully ({config.params_m}M params)")
    
    # ── Warmup inference (避免首次請求特別慢) ──────────────────
    try:
        with torch.no_grad():
            size = INPUT_SIZE_OVERRIDE if INPUT_SIZE_OVERRIDE > 0 else config.input_size
            dummy = torch.randn(1, 3, size, size).to(_device)
            _model(dummy)
        print("[DepthEstimation] Warmup complete.")
    except Exception as e:
        print(f"[DepthEstimation] Warmup skipped (non-critical): {e}")
    
    return _model, _processor


def estimate_depth(image: Image.Image) -> np.ndarray:
    """
    Estimate metric depth from a single RGB image.

    Args:
        image: PIL Image (RGB)

    Returns:
        np.ndarray of shape (H, W) with depth values in meters
    """
    model, processor = load_model()

    # Preprocess
    inputs = processor(images=image, return_tensors="pt")
    inputs = {k: v.to(_device) if hasattr(v, 'to') else v for k, v in inputs.items()}

    # Inference
    with torch.no_grad():
        outputs = model(**inputs)

    # Post-process: get depth map
    predicted_depth = outputs.predicted_depth

    # Interpolate to original image size
    prediction = torch.nn.functional.interpolate(
        predicted_depth.unsqueeze(1),
        size=image.size[::-1],  # (H, W)
        mode="bicubic",
        align_corners=False,
    ).squeeze()

    depth_map = prediction.cpu().numpy()
    return depth_map


def estimate_depth_with_info(image: Image.Image) -> dict:
    """
    Estimate depth and return comprehensive info.

    Returns:
        dict with keys:
          - depth_map: np.ndarray (H, W) in meters
          - min_depth: float
          - max_depth: float
          - mean_depth: float
          - image_size: (width, height)
          - model_id: str (which model was used)
    """
    depth_map = estimate_depth(image)
    config = get_depth_config()

    return {
        "depth_map": depth_map,
        "min_depth": float(np.min(depth_map)),
        "max_depth": float(np.max(depth_map)),
        "mean_depth": float(np.mean(depth_map)),
        "image_size": image.size,
        "model_id": config.model_id,
        "model_name": config.display_name,
    }
