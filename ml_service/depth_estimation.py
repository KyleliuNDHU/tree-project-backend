"""
Depth Estimation Service
========================
Uses Depth Anything V2 Metric Outdoor Small to predict per-pixel metric depth
from a single RGB image.

Model: depth-anything/Depth-Anything-V2-Metric-Outdoor-Small
  - 24.8M parameters
  - Trained on Virtual KITTI (outdoor scenes)
  - Outputs metric depth in meters
  - Apache-2.0 license
"""

import torch
import numpy as np
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

# Singleton model holder
_model = None
_processor = None
_device = None

MODEL_ID = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf"


def get_device() -> str:
    """Determine the best available device."""
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    """Load Depth Anything V2 Metric Outdoor Small model (lazy singleton)."""
    global _model, _processor, _device

    if _model is not None:
        return _model, _processor

    _device = get_device()
    print(f"[DepthEstimation] Loading {MODEL_ID} on {_device}...")

    _processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    _model = AutoModelForDepthEstimation.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,  # Explicit, CPU cannot use float16
    )
    _model = _model.to(_device)
    _model.eval()

    # Reduce memory usage on CPU
    if _device == "cpu":
        torch.set_num_threads(2)  # Limit threads on Render free (single core)

    print(f"[DepthEstimation] Model loaded successfully.")
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
    inputs = {k: v.to(_device) for k, v in inputs.items()}

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
    """
    depth_map = estimate_depth(image)

    return {
        "depth_map": depth_map,
        "min_depth": float(np.min(depth_map)),
        "max_depth": float(np.max(depth_map)),
        "mean_depth": float(np.mean(depth_map)),
        "image_size": image.size,  # (W, H)
    }
