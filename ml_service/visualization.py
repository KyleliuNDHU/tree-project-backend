"""
Depth Map Visualization
=======================
Utilities to create visual depth map overlays and annotated result images.
"""

import io
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def depth_to_colormap(depth_map: np.ndarray,
                      min_depth: float = None,
                      max_depth: float = None) -> np.ndarray:
    """
    Convert depth map to a color-mapped RGB image (Turbo colormap style).

    Closer = warm (red/yellow), farther = cool (blue/purple).

    Returns:
        np.ndarray of shape (H, W, 3) with uint8 values
    """
    if min_depth is None:
        min_depth = np.min(depth_map)
    if max_depth is None:
        max_depth = np.max(depth_map)

    depth_range = max_depth - min_depth
    if depth_range < 0.01:
        depth_range = 1.0

    # Normalize to 0-1
    normalized = np.clip((depth_map - min_depth) / depth_range, 0, 1)

    # Simple turbo-like colormap (warm close, cool far)
    r = np.clip(1.5 - abs(normalized * 4 - 1.0), 0, 1)
    g = np.clip(1.5 - abs(normalized * 4 - 2.0), 0, 1)
    b = np.clip(1.5 - abs(normalized * 4 - 3.0), 0, 1)

    # Invert so close = red, far = blue
    rgb = np.stack([
        np.clip(2.0 * (1 - normalized), 0, 1),           # R: high for close
        np.clip(2.0 * (0.5 - abs(normalized - 0.5)), 0, 1),  # G: peak at mid
        np.clip(2.0 * normalized, 0, 1),                  # B: high for far
    ], axis=-1)

    return (rgb * 255).astype(np.uint8)


def create_result_image(original: Image.Image,
                        depth_map: np.ndarray,
                        bbox: tuple,
                        dbh_cm: float,
                        trunk_depth_m: float,
                        confidence: float,
                        measurement_row: int) -> Image.Image:
    """
    Create a side-by-side visualization:
    Left: original with bbox and measurement line
    Right: depth map with annotations

    Args:
        original: Original RGB image
        depth_map: (H, W) depth array
        bbox: (x1, y1, x2, y2)
        dbh_cm: Measured DBH in cm
        trunk_depth_m: Depth to trunk in meters
        confidence: Confidence score 0-1
        measurement_row: Row where measurement was taken
    """
    W, H = original.size

    # Create depth visualization
    depth_rgb = depth_to_colormap(depth_map)
    depth_img = Image.fromarray(depth_rgb).resize((W, H))

    # Create canvas (side by side)
    canvas = Image.new("RGB", (W * 2 + 20, H + 80), (30, 30, 30))

    # Paste images
    canvas.paste(original, (0, 0))
    canvas.paste(depth_img, (W + 20, 0))

    draw = ImageDraw.Draw(canvas)

    # Draw bounding box on original
    x1, y1, x2, y2 = bbox
    draw.rectangle([x1, y1, x2, y2], outline=(0, 255, 0), width=3)

    # Draw measurement line
    draw.line([(x1, measurement_row), (x2, measurement_row)],
              fill=(255, 255, 0), width=2)

    # Draw bbox on depth map too
    draw.rectangle([x1 + W + 20, y1, x2 + W + 20, y2],
                   outline=(0, 255, 0), width=3)
    draw.line([(x1 + W + 20, measurement_row), (x2 + W + 20, measurement_row)],
              fill=(255, 255, 0), width=2)

    # Add text annotations at bottom
    # Try multiple font paths (Linux/Render, macOS, Windows)
    font = None
    font_small = None
    for font_path in [
        "/opt/render/project/src/../Noto_Sans_TC/static/NotoSansTC-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "arial.ttf",
    ]:
        try:
            font = ImageFont.truetype(font_path, 20)
            font_small = ImageFont.truetype(font_path, 16)
            break
        except (IOError, OSError):
            continue
    if font is None:
        font = ImageFont.load_default()
        font_small = font

    y_text = H + 10
    draw.text((10, y_text),
              f"DBH: {dbh_cm:.1f} cm",
              fill=(0, 255, 0), font=font)
    draw.text((250, y_text),
              f"Depth: {trunk_depth_m:.2f} m",
              fill=(255, 255, 0), font=font)
    draw.text((500, y_text),
              f"Confidence: {confidence:.0%}",
              fill=(200, 200, 200), font=font)

    draw.text((10, y_text + 30),
              "Original + BBox",
              fill=(150, 150, 150), font=font_small)
    draw.text((W + 30, y_text + 30),
              "Depth Map (red=close, blue=far)",
              fill=(150, 150, 150), font=font_small)

    return canvas


def image_to_bytes(image: Image.Image, format: str = "PNG") -> bytes:
    """Convert PIL Image to bytes."""
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    return buffer.getvalue()
