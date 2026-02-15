"""
Automatic Tree Trunk Detector
==============================
Detects tree trunks from a depth map without any manual input.

Approach: Depth-based auto-segmentation
- No additional ML model required (uses existing depth map from Depth Anything V2)
- Detects vertical foreground structures (tree trunks)
- Returns bounding boxes with confidence and distance

Algorithm:
  1. Foreground extraction: trunk is closer than background
  2. Vertical structure detection: trunk is vertically continuous
  3. Connected component analysis: find contiguous trunk regions
  4. Scoring: rank candidates by size, shape, centrality, depth consistency

References:
  - Depth-based segmentation is a classical approach, no ML model overhead
  - Tesla-inspired: leverage existing depth estimation, no extra hardware
  - Holcomb et al. (2023): foreground extraction for tree measurement
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from scipy.ndimage import (
    uniform_filter1d, label as ndimage_label,
    binary_dilation, binary_erosion, binary_fill_holes
)


@dataclass
class DetectedTrunk:
    """A detected tree trunk with bounding box and metadata."""
    bbox_x1: int
    bbox_y1: int
    bbox_x2: int
    bbox_y2: int
    confidence: float          # 0-1 detection confidence
    depth_m: float             # Median depth to trunk (meters)
    pixel_width: float         # Estimated pixel width at center
    pixel_height: float        # Pixel height of detected region
    center_x: int              # Center x in image coordinates
    center_y: int              # Center y in image coordinates
    distance_status: str       # "ok", "too_close", "too_far", "warning"
    distance_message: str      # Human-readable distance feedback
    mask: Optional[np.ndarray] = field(default=None, repr=False)  # Binary mask


@dataclass
class DetectionResult:
    """Result of automatic trunk detection."""
    trunks: List[DetectedTrunk]
    best_trunk_index: int      # Index of the recommended trunk (-1 if none)
    depth_stats: dict          # Overall depth statistics
    detection_method: str      # Method used for detection
    notes: List[str]           # Processing notes


def detect_trunks(depth_map: np.ndarray,
                  min_trunk_width_ratio: float = 0.02,
                  max_trunk_width_ratio: float = 0.5,
                  min_trunk_height_ratio: float = 0.15,
                  center_bias: float = 0.3,
                  max_trunks: int = 5) -> DetectionResult:
    """
    Automatically detect tree trunks from a depth map.

    The algorithm assumes:
    - The user is pointing their phone at a tree
    - The trunk is a vertical structure closer than the background
    - The trunk is somewhere near the center of the frame

    Args:
        depth_map: (H, W) array with metric depth in meters
        min_trunk_width_ratio: Minimum trunk width as ratio of image width
        max_trunk_width_ratio: Maximum trunk width as ratio of image width
        min_trunk_height_ratio: Minimum trunk height as ratio of image height
        center_bias: How much to prefer centrally-located trunks (0-1)
        max_trunks: Maximum number of trunks to return

    Returns:
        DetectionResult with detected trunks sorted by confidence
    """
    H, W = depth_map.shape
    notes = []

    # Step 1: Compute depth statistics
    depth_stats = {
        "min_m": float(np.min(depth_map)),
        "max_m": float(np.max(depth_map)),
        "mean_m": float(np.mean(depth_map)),
        "median_m": float(np.median(depth_map)),
    }

    # Step 2: Foreground extraction
    # Tree trunk should be in the foreground (closer to camera)
    foreground_mask = _extract_foreground(depth_map)
    notes.append(f"Foreground pixels: {np.sum(foreground_mask)}/{H*W}")

    # Step 3: Vertical structure enhancement
    # Tree trunks are vertically continuous
    vertical_mask = _enhance_vertical_structures(foreground_mask, depth_map, H, W)
    notes.append(f"Vertical structure pixels: {np.sum(vertical_mask)}")

    # Step 4: Connected component analysis
    components = _find_trunk_candidates(vertical_mask, depth_map, H, W,
                                        min_trunk_width_ratio,
                                        max_trunk_width_ratio,
                                        min_trunk_height_ratio)
    notes.append(f"Trunk candidates found: {len(components)}")

    if not components:
        # Fallback: try with relaxed parameters
        notes.append("Retrying with relaxed parameters...")
        components = _find_trunk_candidates(
            foreground_mask, depth_map, H, W,
            min_trunk_width_ratio * 0.5,
            max_trunk_width_ratio * 1.5,
            min_trunk_height_ratio * 0.5
        )
        notes.append(f"Relaxed search found: {len(components)}")

    # Step 5: Score and rank candidates
    trunks = []
    for comp in components:
        trunk = _score_candidate(comp, depth_map, H, W, center_bias)
        trunks.append(trunk)

    # Sort by confidence (descending)
    trunks.sort(key=lambda t: t.confidence, reverse=True)
    trunks = trunks[:max_trunks]

    # Select best trunk
    best_index = 0 if trunks else -1

    return DetectionResult(
        trunks=trunks,
        best_trunk_index=best_index,
        depth_stats=depth_stats,
        detection_method="depth_based_auto",
        notes=notes,
    )


def _extract_foreground(depth_map: np.ndarray,
                        percentile_threshold: float = 40.0) -> np.ndarray:
    """
    Extract foreground pixels using depth-based thresholding.

    Tree trunks are typically in the foreground (lower depth values).
    Uses adaptive thresholding with percentile-based cutoff.
    """
    H, W = depth_map.shape

    # Use the center region to determine foreground depth
    # (user is likely pointing at the tree)
    center_region = depth_map[H//4:3*H//4, W//4:3*W//4]
    if center_region.size == 0:
        center_region = depth_map

    # Foreground threshold: objects closer than the percentile threshold
    fg_threshold = np.percentile(center_region, percentile_threshold)

    # Also consider: trunk depth should be within a reasonable range
    # Add a small margin to catch trunk edges
    margin = max(0.3, fg_threshold * 0.15)
    fg_mask = depth_map <= (fg_threshold + margin)

    # Clean up noise with morphological operations
    struct = np.ones((5, 3))  # Vertically-biased structuring element
    fg_mask = binary_erosion(fg_mask, structure=struct, iterations=1)
    fg_mask = binary_dilation(fg_mask, structure=struct, iterations=2)
    fg_mask = binary_fill_holes(fg_mask)

    return fg_mask


def _enhance_vertical_structures(fg_mask: np.ndarray,
                                  depth_map: np.ndarray,
                                  H: int, W: int) -> np.ndarray:
    """
    Enhance vertically-continuous structures (tree trunks).

    Uses column-wise analysis to find vertically consistent foreground regions.
    Tree trunks have high vertical continuity and relatively uniform depth.
    """
    # Column-wise: count consecutive foreground pixels
    vertical_score = np.zeros((H, W), dtype=float)

    for col in range(W):
        fg_col = fg_mask[:, col].astype(float)

        # Count vertical continuity: how many consecutive foreground pixels
        # above and below each pixel
        for i in range(H):
            if fg_col[i] <= 0:
                continue

            # Count consecutive True values above
            up = 0
            for j in range(i - 1, -1, -1):
                if fg_col[j] > 0:
                    up += 1
                else:
                    break

            # Count consecutive True values below
            down = 0
            for j in range(i + 1, H):
                if fg_col[j] > 0:
                    down += 1
                else:
                    break

            vertical_score[i, col] = up + down + 1

    # Threshold: pixels with strong vertical continuity
    min_vertical_run = max(H * 0.1, 20)  # At least 10% of image height
    enhanced = vertical_score >= min_vertical_run

    # Depth consistency filter: within each column, check depth variance
    # of the enhanced pixels (trunk should have consistent depth)
    for col in range(W):
        col_mask = enhanced[:, col]
        if np.sum(col_mask) < min_vertical_run:
            continue

        col_depths = depth_map[col_mask, col]
        if len(col_depths) > 0:
            cv = np.std(col_depths) / max(np.mean(col_depths), 0.01)
            if cv > 0.3:  # Too much depth variation → probably not a trunk
                enhanced[:, col] = False

    return enhanced


def _find_trunk_candidates(mask: np.ndarray,
                           depth_map: np.ndarray,
                           H: int, W: int,
                           min_w_ratio: float,
                           max_w_ratio: float,
                           min_h_ratio: float) -> list:
    """
    Find connected components that look like tree trunks.

    Filters by:
    - Aspect ratio (trunks are taller than wide)
    - Size constraints (not too thin, not too thick)
    - Minimum height (must span a reasonable portion of image)
    """
    labeled, num_features = ndimage_label(mask)
    candidates = []

    min_w = max(int(W * min_w_ratio), 5)
    max_w = int(W * max_w_ratio)
    min_h = max(int(H * min_h_ratio), 20)

    for i in range(1, num_features + 1):
        component_mask = labeled == i
        ys, xs = np.where(component_mask)

        if len(ys) == 0:
            continue

        # Bounding box
        x1, x2 = int(np.min(xs)), int(np.max(xs))
        y1, y2 = int(np.min(ys)), int(np.max(ys))
        w = x2 - x1
        h = y2 - y1

        # Filter by size
        if w < min_w or w > max_w:
            continue
        if h < min_h:
            continue

        # Filter by aspect ratio (trunk should be taller than wide)
        aspect_ratio = h / max(w, 1)
        if aspect_ratio < 1.2:  # Trunk should be at least 1.2x taller than wide
            continue

        # Compute fill ratio (how much of bbox is filled by mask)
        bbox_area = w * h
        filled_pixels = np.sum(component_mask[y1:y2+1, x1:x2+1])
        fill_ratio = filled_pixels / max(bbox_area, 1)

        # Trunk should have reasonable fill ratio (not too sparse)
        if fill_ratio < 0.2:
            continue

        # Compute depth statistics within the trunk
        trunk_depths = depth_map[component_mask]
        median_depth = float(np.median(trunk_depths))

        candidates.append({
            "mask": component_mask,
            "bbox": (x1, y1, x2 + 1, y2 + 1),
            "width": w,
            "height": h,
            "aspect_ratio": aspect_ratio,
            "fill_ratio": fill_ratio,
            "median_depth": median_depth,
            "center_x": (x1 + x2) // 2,
            "center_y": (y1 + y2) // 2,
            "pixel_count": int(filled_pixels),
        })

    return candidates


def _score_candidate(candidate: dict,
                     depth_map: np.ndarray,
                     H: int, W: int,
                     center_bias: float) -> DetectedTrunk:
    """
    Score a trunk candidate and create a DetectedTrunk object.

    Scoring factors:
    - Centrality: prefer trunks near image center
    - Size: larger trunks are more reliable
    - Aspect ratio: more vertical = more trunk-like
    - Depth distance: ideal 1-3m range
    - Fill ratio: how solid is the detection
    """
    x1, y1, x2, y2 = candidate["bbox"]
    depth = candidate["median_depth"]

    scores = []

    # 1. Centrality score (0-1)
    cx_ratio = abs(candidate["center_x"] - W / 2) / (W / 2)
    cy_ratio = abs(candidate["center_y"] - H / 2) / (H / 2)
    centrality = 1.0 - (cx_ratio * 0.7 + cy_ratio * 0.3)  # X matters more
    centrality = max(0, centrality)
    scores.append(centrality * center_bias)

    # 2. Size score (0-1)
    area_ratio = (candidate["width"] * candidate["height"]) / (W * H)
    size_score = min(area_ratio * 20, 1.0)  # Cap at 5% image area
    scores.append(size_score * 0.2)

    # 3. Aspect ratio score (0-1)
    ar = candidate["aspect_ratio"]
    if 2.0 <= ar <= 8.0:
        ar_score = 1.0
    elif 1.5 <= ar < 2.0 or 8.0 < ar <= 12.0:
        ar_score = 0.7
    elif 1.2 <= ar < 1.5:
        ar_score = 0.4
    else:
        ar_score = 0.2
    scores.append(ar_score * 0.2)

    # 4. Distance score (0-1)
    dist_score, dist_status, dist_msg = _evaluate_distance(depth)
    scores.append(dist_score * 0.2)

    # 5. Fill ratio score (0-1)
    fill_score = min(candidate["fill_ratio"] * 2, 1.0)
    scores.append(fill_score * 0.1)

    confidence = sum(scores)

    # Estimate trunk pixel width at center row
    center_row = candidate["center_y"]
    row_mask = candidate["mask"][center_row, x1:x2+1] if center_row < H else np.array([])
    if len(row_mask) > 0 and np.any(row_mask):
        true_positions = np.where(row_mask)[0]
        pixel_width = float(true_positions[-1] - true_positions[0] + 1) if len(true_positions) > 1 else float(candidate["width"])
    else:
        pixel_width = float(candidate["width"])

    return DetectedTrunk(
        bbox_x1=x1,
        bbox_y1=y1,
        bbox_x2=x2,
        bbox_y2=y2,
        confidence=round(min(confidence, 1.0), 3),
        depth_m=round(depth, 3),
        pixel_width=round(pixel_width, 1),
        pixel_height=float(candidate["height"]),
        center_x=candidate["center_x"],
        center_y=candidate["center_y"],
        distance_status=dist_status,
        distance_message=dist_msg,
        mask=candidate["mask"],
    )


def _evaluate_distance(depth_m: float) -> Tuple[float, str, str]:
    """
    Evaluate if the shooting distance is appropriate for DBH measurement.

    Ideal: 1-3m (high pixel density, good depth accuracy)
    Acceptable: 0.5-5m
    Warning: 0.3-0.5m or 5-8m
    Bad: <0.3m or >8m

    Returns:
        (score, status, message)
    """
    if depth_m < 0.3:
        return 0.1, "too_close", "太近了 (< 0.3m)！請後退以拍攝完整樹幹"
    elif depth_m < 0.5:
        return 0.5, "warning", f"距離偏近 ({depth_m:.1f}m)，建議後退至 1-3m"
    elif depth_m < 1.0:
        return 0.8, "ok", f"距離可接受 ({depth_m:.1f}m)，建議 1-3m 最佳"
    elif depth_m <= 3.0:
        return 1.0, "ok", f"距離理想 ({depth_m:.1f}m) ✓"
    elif depth_m <= 5.0:
        return 0.7, "ok", f"距離可接受 ({depth_m:.1f}m)，建議靠近至 1-3m"
    elif depth_m <= 8.0:
        return 0.4, "warning", f"距離偏遠 ({depth_m:.1f}m)，精度可能降低，建議靠近"
    else:
        return 0.1, "too_far", f"太遠了 ({depth_m:.1f}m)！請靠近至 1-3m 範圍"


def create_detection_visualization(image: 'Image.Image',
                                   depth_map: np.ndarray,
                                   result: DetectionResult) -> 'Image.Image':
    """
    Create a Tesla-style visualization showing detected trunks,
    depth map overlay, and distance information.

    Shows all detected trunks with bounding boxes and the best one highlighted.
    """
    from PIL import Image, ImageDraw, ImageFont

    W, H = image.size

    # Create depth overlay (semi-transparent)
    from visualization import depth_to_colormap
    depth_rgb = depth_to_colormap(depth_map)
    depth_overlay = Image.fromarray(depth_rgb).resize((W, H))

    # Blend original with depth (30% depth overlay)
    blended = Image.blend(image, depth_overlay, alpha=0.25)
    draw = ImageDraw.Draw(blended)

    # Load font
    font = None
    font_large = None
    for font_path in [
        "/opt/render/project/src/../Noto_Sans_TC/static/NotoSansTC-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "arial.ttf",
    ]:
        try:
            font = ImageFont.truetype(font_path, 18)
            font_large = ImageFont.truetype(font_path, 24)
            break
        except (IOError, OSError):
            continue
    if font is None:
        font = ImageFont.load_default()
        font_large = font

    # Draw all detected trunks
    for i, trunk in enumerate(result.trunks):
        is_best = (i == result.best_trunk_index)

        # Color: green for best, yellow for others
        if is_best:
            box_color = (0, 255, 0)
            text_color = (0, 255, 0)
            line_width = 4
        else:
            box_color = (255, 255, 0)
            text_color = (255, 255, 0)
            line_width = 2

        # Draw bounding box
        draw.rectangle(
            [trunk.bbox_x1, trunk.bbox_y1, trunk.bbox_x2, trunk.bbox_y2],
            outline=box_color, width=line_width
        )

        # Draw center crosshair
        cx, cy = trunk.center_x, trunk.center_y
        cross_size = 15
        draw.line([(cx - cross_size, cy), (cx + cross_size, cy)],
                  fill=box_color, width=2)
        draw.line([(cx, cy - cross_size), (cx, cy + cross_size)],
                  fill=box_color, width=2)

        # Draw measurement row line (at center)
        draw.line(
            [(trunk.bbox_x1, cy), (trunk.bbox_x2, cy)],
            fill=(255, 100, 100), width=2
        )

        # Label
        label = f"{'★ ' if is_best else ''}樹幹 {i+1}"
        depth_label = f"{trunk.depth_m:.1f}m"
        conf_label = f"{trunk.confidence:.0%}"

        # Draw label background
        label_y = max(trunk.bbox_y1 - 28, 0)
        draw.rectangle(
            [trunk.bbox_x1, label_y, trunk.bbox_x1 + 180, label_y + 26],
            fill=(0, 0, 0, 180)
        )
        draw.text((trunk.bbox_x1 + 4, label_y + 2),
                  f"{label} | {depth_label} | {conf_label}",
                  fill=text_color, font=font)

        # Distance status indicator
        status_colors = {
            "ok": (0, 200, 0),
            "warning": (255, 200, 0),
            "too_close": (255, 50, 50),
            "too_far": (255, 50, 50),
        }
        status_color = status_colors.get(trunk.distance_status, (200, 200, 200))

        # Draw distance message at bottom of bbox
        msg_y = min(trunk.bbox_y2 + 4, H - 22)
        draw.rectangle(
            [trunk.bbox_x1, msg_y, trunk.bbox_x1 + len(trunk.distance_message) * 11, msg_y + 22],
            fill=(0, 0, 0, 200)
        )
        draw.text((trunk.bbox_x1 + 4, msg_y + 2),
                  trunk.distance_message,
                  fill=status_color, font=font)

    # If no trunks found, show message
    if not result.trunks:
        msg = "未偵測到樹幹 — 請對準樹幹拍攝，距離 1-3m"
        draw.rectangle([W//4, H//2 - 20, 3*W//4, H//2 + 20], fill=(0, 0, 0, 200))
        draw.text((W//4 + 10, H//2 - 12), msg, fill=(255, 100, 100), font=font)

    return blended
