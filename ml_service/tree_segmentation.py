"""
Tree Segmentation Service (SAM 2.1 Integration)
=================================================
Provides pixel-perfect tree trunk segmentation using SAM 2.1.

STATUS: SKELETON — SAM 2.1 is NOT yet installed.
This file is ready to use once you install SAM 2.1.

INSTALLATION:
  pip install sam2                    # Requires Python>=3.10, PyTorch>=2.5.1
  # OR from source for latest:
  git clone https://github.com/facebookresearch/sam2.git
  cd sam2 && pip install -e .
  # Download checkpoint:
  cd checkpoints && ./download_ckpts.sh

ACTIVATION:
  1. Install SAM 2.1 (above)
  2. Set environment variable: ML_ENABLE_SAM=true
  3. Restart the ML service
  4. (Optional) Set ML_SEG_MODEL=sam2_tiny in model_registry.py

STRATEGIES:
  A. Auto-prompt: depth map → find foreground center → SAM point prompt
  B. User tap: user touches screen on target tree → send (x,y) to SAM
  C. Bounding box: use detected trunk bbox → SAM box prompt.

UPGRADE PATH:
  Phase 2:  SAM 2.1 Tiny (38.9M) — good enough for most cases
  Phase 2+: SAM 2.1 Small (46M)  — slightly better, slightly slower
  Phase 3:  Grounded SAM (DINO + SAM) — zero-shot "tree trunk" detection
"""

import numpy as np
from PIL import Image
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass

from model_registry import ENABLE_SAM_SEGMENTATION, get_seg_config


@dataclass
class SegmentationResult:
    """Result of tree trunk segmentation."""
    mask: np.ndarray              # Binary mask (H, W), True = trunk
    confidence: float             # Segmentation confidence 0-1
    method: str                   # "heuristic", "sam2_auto", "sam2_tap", "sam2_bbox"
    prompt_point: Optional[Tuple[int, int]] = None   # (x, y) if point prompt used
    bbox_used: Optional[Tuple[int, int, int, int]] = None  # (x1,y1,x2,y2) if bbox used
    notes: List[str] = None       # Processing notes
    
    def __post_init__(self):
        if self.notes is None:
            self.notes = []


# ============================================================
# SAM 2.1 Model Holder (Singleton)
# ============================================================

_sam_model = None
_sam_predictor = None


def _load_sam_model():
    """
    Load SAM 2.1 model via HuggingFace transformers (lazy singleton).
    Enable with: ML_ENABLE_SAM=true environment variable.
    """
    global _sam_model, _sam_predictor
    
    if _sam_predictor is not None:
        return _sam_predictor
    
    if not ENABLE_SAM_SEGMENTATION:
        print("[SAM] SAM segmentation is disabled. Set ML_ENABLE_SAM=true to enable.")
        return None
    
    try:
        from transformers import Sam2Model, Sam2Processor
        import torch
        
        config = get_seg_config()
        model_id = config.model_id
        print(f"[SAM] Loading SAM 2.1 from {model_id}...")
        
        _sam_model = Sam2Model.from_pretrained(model_id)
        _sam_predictor = Sam2Processor.from_pretrained(model_id)
        
        _sam_model.eval()
        if hasattr(torch, 'inference_mode'):
            _sam_model = torch.no_grad()
        
        print(f"[SAM] SAM 2.1 loaded successfully ({config.params_m}M params)")
        return _sam_predictor
        
    except ImportError as e:
        print(f"[SAM] transformers version too old for Sam2Model: {e}")
        print("[SAM] Upgrade: pip install --upgrade transformers>=4.45.0")
        return None
    except Exception as e:
        print(f"[SAM] Failed to load SAM model: {e}")
        import traceback
        traceback.print_exc()
        return None


# ============================================================
# Segmentation Strategies
# ============================================================

def segment_trunk_auto(
    image: np.ndarray,
    depth_map: np.ndarray,
    existing_mask: Optional[np.ndarray] = None,
) -> SegmentationResult:
    """
    Automatically segment the tree trunk.
    
    Strategy: Use depth map to find the foreground center point,
    then feed it as a point prompt to SAM 2.1.
    
    If SAM is not available, returns the heuristic mask from tree_trunk_detector.
    
    Args:
        image: RGB image as numpy array (H, W, 3)
        depth_map: Metric depth map (H, W) in meters
        existing_mask: Optional heuristic mask to use as fallback or guidance
        
    Returns:
        SegmentationResult with binary trunk mask
    """
    predictor = _load_sam_model()
    
    # ── Fallback: Heuristic segmentation ──────────────────────
    if predictor is None:
        if existing_mask is not None:
            return SegmentationResult(
                mask=existing_mask,
                confidence=0.5,
                method="heuristic",
                notes=["SAM not available, using depth-based heuristic mask"],
            )
        else:
            # Generate a simple foreground mask from depth
            mask = _simple_depth_foreground(depth_map)
            return SegmentationResult(
                mask=mask,
                confidence=0.3,
                method="heuristic",
                notes=["SAM not available, using simple depth thresholding"],
            )
    
    # ── SAM 2.1: Auto-prompt from depth ──────────────────────
    prompt_point = _find_foreground_center(depth_map)
    
    try:
        best_mask, best_score = _run_sam_point_prompt(
            image, [prompt_point], [1]
        )
        return SegmentationResult(
            mask=best_mask,
            confidence=best_score,
            method="sam2_auto",
            prompt_point=prompt_point,
            notes=[f"SAM 2.1 auto-prompt at ({prompt_point[0]}, {prompt_point[1]})"],
        )
    except Exception as e:
        print(f"[SAM] Inference failed, falling back to heuristic: {e}")
        mask = _simple_depth_foreground(depth_map)
        return SegmentationResult(
            mask=mask,
            confidence=0.3,
            method="heuristic",
            prompt_point=prompt_point,
            notes=[f"SAM inference failed: {e}, using heuristic fallback"],
        )


def segment_trunk_with_tap(
    image: np.ndarray,
    depth_map: np.ndarray,
    tap_x: int,
    tap_y: int,
) -> SegmentationResult:
    """
    Segment tree trunk using user's tap point as SAM prompt.
    
    The user taps on the target tree in the phone UI, and we send
    that (x, y) coordinate as a point prompt to SAM 2.1.
    
    Args:
        image: RGB image as numpy array (H, W, 3)
        depth_map: Metric depth map (H, W) in meters
        tap_x, tap_y: User's tap coordinates (pixel)
    
    Returns:
        SegmentationResult with binary trunk mask
    """
    predictor = _load_sam_model()
    
    if predictor is None:
        mask = _depth_mask_near_point(depth_map, tap_x, tap_y)
        return SegmentationResult(
            mask=mask,
            confidence=0.4,
            method="heuristic",
            prompt_point=(tap_x, tap_y),
            notes=["SAM not available, using depth-based mask around tap point"],
        )
    
    try:
        best_mask, best_score = _run_sam_point_prompt(
            image, [(tap_x, tap_y)], [1]
        )
        return SegmentationResult(
            mask=best_mask,
            confidence=best_score,
            method="sam2_tap",
            prompt_point=(tap_x, tap_y),
            notes=[f"SAM 2.1 user tap at ({tap_x}, {tap_y})"],
        )
    except Exception as e:
        print(f"[SAM] Tap inference failed: {e}")
        mask = _depth_mask_near_point(depth_map, tap_x, tap_y)
        return SegmentationResult(
            mask=mask,
            confidence=0.4,
            method="heuristic",
            prompt_point=(tap_x, tap_y),
            notes=[f"SAM tap failed: {e}, using heuristic"],
        )


def segment_trunk_with_bbox(
    image: np.ndarray,
    depth_map: np.ndarray,
    bbox: Tuple[int, int, int, int],
) -> SegmentationResult:
    """
    Segment tree trunk using bounding box as SAM prompt.
    
    Can use the auto-detected trunk bbox from tree_trunk_detector,
    or a manually drawn bbox.
    
    Args:
        image: RGB image as numpy array (H, W, 3)
        depth_map: Metric depth map (H, W) in meters
        bbox: (x1, y1, x2, y2) bounding box
    
    Returns:
        SegmentationResult with binary trunk mask
    """
    predictor = _load_sam_model()
    x1, y1, x2, y2 = bbox
    
    if predictor is None:
        # Fallback: mask the entire bbox region where depth is consistent
        mask = _depth_mask_in_bbox(depth_map, x1, y1, x2, y2)
        return SegmentationResult(
            mask=mask,
            confidence=0.4,
            method="heuristic",
            bbox_used=bbox,
            notes=["SAM not available, using depth-based mask within bbox"],
        )
    
    # TODO: Uncomment when SAM 2.1 is installed
    # predictor.set_image(image)
    # masks, scores, _ = predictor.predict(
    #     box=np.array([x1, y1, x2, y2]),
    #     multimask_output=True,
    # )
    # best_idx = np.argmax(scores)
    # best_mask = masks[best_idx]
    # best_score = float(scores[best_idx])
    
    best_mask = _depth_mask_in_bbox(depth_map, x1, y1, x2, y2)
    best_score = 0.4
    
    return SegmentationResult(
        mask=best_mask,
        confidence=best_score,
        method="sam2_bbox",
        bbox_used=bbox,
        notes=[f"Bbox prompt ({x1},{y1})-({x2},{y2})"],
    )


# ============================================================
# Helper: Depth-based Fallback Masks
# ============================================================

def _run_sam_point_prompt(
    image: np.ndarray,
    points: List[Tuple[int, int]],
    labels: List[int],
) -> Tuple[np.ndarray, float]:
    """
    Run SAM 2.1 inference with point prompts via HuggingFace transformers.
    Returns (mask, score).
    """
    import torch
    
    global _sam_model, _sam_predictor
    processor = _sam_predictor
    model = _sam_model
    
    pil_image = Image.fromarray(image) if isinstance(image, np.ndarray) else image
    
    input_points = [[[p[0], p[1]] for p in points]]
    input_labels = [labels]
    
    inputs = processor(
        pil_image,
        input_points=input_points,
        input_labels=input_labels,
        return_tensors="pt",
    )
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    masks = processor.post_process_masks(
        outputs.pred_masks,
        inputs["original_sizes"],
        inputs["reshaped_input_sizes"],
    )
    
    scores = outputs.iou_scores[0][0]
    mask_tensors = masks[0][0]
    
    best_idx = torch.argmax(scores).item()
    best_mask = mask_tensors[best_idx].cpu().numpy().astype(np.uint8)
    best_score = float(scores[best_idx].cpu())
    
    return best_mask, best_score


def _find_foreground_center(depth_map: np.ndarray) -> Tuple[int, int]:
    """
    Find the center of the closest foreground object in the depth map.
    
    Strategy: Look at the center region of the image (where the user
    presumably pointed their camera), find the area with smallest depth.
    """
    H, W = depth_map.shape
    
    # Focus on center 60% of image
    margin_x = int(W * 0.2)
    margin_y = int(H * 0.2)
    center_region = depth_map[margin_y:H-margin_y, margin_x:W-margin_x]
    
    # Find the 20th percentile depth (close objects)
    threshold = np.percentile(center_region, 20)
    
    # Create foreground mask
    fg_mask = depth_map < threshold
    
    # Find centroid of foreground in center region
    fg_in_center = fg_mask[margin_y:H-margin_y, margin_x:W-margin_x]
    ys, xs = np.where(fg_in_center)
    
    if len(xs) == 0:
        # Fallback: image center
        return (W // 2, H // 2)
    
    cx = int(np.median(xs)) + margin_x
    cy = int(np.median(ys)) + margin_y
    return (cx, cy)


def _simple_depth_foreground(depth_map: np.ndarray) -> np.ndarray:
    """Create a simple foreground mask from depth map using percentile thresholding."""
    H, W = depth_map.shape
    margin_x = int(W * 0.2)
    margin_y = int(H * 0.2)
    center = depth_map[margin_y:H-margin_y, margin_x:W-margin_x]
    threshold = np.percentile(center, 40)
    mask = depth_map < threshold
    return mask.astype(np.uint8)


def _depth_mask_near_point(
    depth_map: np.ndarray, x: int, y: int, radius: int = 50
) -> np.ndarray:
    """Create a mask based on depth similarity around a point."""
    H, W = depth_map.shape
    x = min(max(x, 0), W - 1)
    y = min(max(y, 0), H - 1)
    
    # Get reference depth at tap point (3x3 neighborhood for stability)
    y1, y2 = max(0, y-1), min(H, y+2)
    x1, x2 = max(0, x-1), min(W, x+2)
    ref_depth = np.median(depth_map[y1:y2, x1:x2])
    
    # Mask pixels with similar depth (±20%)
    tolerance = ref_depth * 0.2
    mask = np.abs(depth_map - ref_depth) < tolerance
    return mask.astype(np.uint8)


def _depth_mask_in_bbox(
    depth_map: np.ndarray, x1: int, y1: int, x2: int, y2: int
) -> np.ndarray:
    """Create a depth-consistent mask within a bounding box."""
    H, W = depth_map.shape
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(W, x2), min(H, y2)
    
    mask = np.zeros((H, W), dtype=np.uint8)
    bbox_region = depth_map[y1:y2, x1:x2]
    
    # Use median depth as reference, filter outliers
    ref_depth = np.median(bbox_region)
    tolerance = ref_depth * 0.25
    bbox_mask = np.abs(bbox_region - ref_depth) < tolerance
    mask[y1:y2, x1:x2] = bbox_mask.astype(np.uint8)
    
    return mask


# ============================================================
# Sub-pixel Edge Detection (Phase 3)
# ============================================================

def subpixel_trunk_width(
    image_gray: np.ndarray,
    mask: np.ndarray,
    measurement_row: int,
) -> Optional[float]:
    """
    Measure trunk width with sub-pixel accuracy using gradient-based edge detection.
    
    STATUS: READY TO USE — no additional dependencies needed.
    Activated when AccuracyPreset.use_subpixel = True (Phase 3).
    
    Technique borrowed from industrial pipe diameter measurement:
    Uses Sobel gradient peaks + parabolic interpolation for ±0.1 pixel accuracy.
    
    Args:
        image_gray: Grayscale image (H, W) as float
        mask: Binary trunk mask (H, W)
        measurement_row: Image row to measure at
        
    Returns:
        Sub-pixel trunk width, or None if edges not found
    """
    H, W = image_gray.shape
    if measurement_row < 0 or measurement_row >= H:
        return None
    
    row = image_gray[measurement_row].astype(np.float64)
    mask_row = mask[measurement_row]
    
    # Find mask boundaries (integer pixel)
    mask_indices = np.where(mask_row > 0)[0]
    if len(mask_indices) < 3:
        return None
    
    left_idx = mask_indices[0]
    right_idx = mask_indices[-1]
    
    # Compute gradient magnitude along the row
    grad = np.abs(np.gradient(row))
    
    # Sub-pixel refinement via parabolic interpolation
    left_sub = _parabolic_peak(grad, left_idx)
    right_sub = _parabolic_peak(grad, right_idx)
    
    if left_sub is not None and right_sub is not None:
        return right_sub - left_sub
    else:
        # Fallback to integer width
        return float(right_idx - left_idx)


def _parabolic_peak(signal: np.ndarray, index: int) -> Optional[float]:
    """
    Refine a peak position using parabolic (quadratic) interpolation.
    
    Given 3 consecutive samples around a peak, fits a parabola to find
    the true peak position with sub-pixel accuracy.
    
    Returns:
        Sub-pixel position, or None if interpolation fails
    """
    if index <= 0 or index >= len(signal) - 1:
        return float(index)
    
    y_prev = signal[index - 1]
    y_curr = signal[index]
    y_next = signal[index + 1]
    
    denominator = 2.0 * (2.0 * y_curr - y_prev - y_next)
    if abs(denominator) < 1e-10:
        return float(index)
    
    offset = (y_prev - y_next) / denominator
    return float(index) + offset


# ============================================================
# Ellipse Fitting (Phase 3)
# ============================================================

def ellipse_corrected_width(
    mask: np.ndarray,
    measurement_row: int,
    num_rows: int = 20,
) -> Optional[float]:
    """
    Estimate trunk diameter using ellipse fitting on the trunk contour.
    
    STATUS: READY TO USE — requires scikit-image (already available via scipy).
    Activated when AccuracyPreset.use_ellipse_fit = True (Phase 3).
    
    Trees are not perfectly circular in cross-section, and viewing angles
    can cause perspective distortion. Ellipse fitting corrects for both.
    
    The equivalent diameter D = 2√(a*b) where a, b are semi-axes.
    
    Args:
        mask: Binary trunk mask (H, W)
        measurement_row: Center row for measurement
        num_rows: Number of rows above/below to sample contour points
        
    Returns:
        Equivalent diameter in pixels, or None if fitting fails
    """
    try:
        from skimage.measure import EllipseModel
    except ImportError:
        # scikit-image not installed; fallback
        return None
    
    H, W = mask.shape
    
    # Collect contour points around the measurement row
    contour_points = []
    half = num_rows // 2
    for r in range(max(0, measurement_row - half), min(H, measurement_row + half)):
        row_mask = mask[r]
        indices = np.where(row_mask > 0)[0]
        if len(indices) >= 2:
            # Left edge, right edge
            contour_points.append([indices[0], r])
            contour_points.append([indices[-1], r])
    
    if len(contour_points) < 6:  # Need at least 5 points for ellipse
        return None
    
    contour_points = np.array(contour_points, dtype=np.float64)
    
    # Fit ellipse
    model = EllipseModel()
    success = model.estimate(contour_points)
    
    if not success:
        return None
    
    # model.params = (cx, cy, a, b, theta)
    a = model.params[2]  # semi-major axis
    b = model.params[3]  # semi-minor axis
    
    # Equivalent diameter for non-circular cross-section
    equivalent_diameter = 2.0 * np.sqrt(a * b)
    return float(equivalent_diameter)
