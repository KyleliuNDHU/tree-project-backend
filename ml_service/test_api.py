"""
Test the measure-dbh API endpoint with a synthetic tree-trunk-like image.
"""
import requests
import io
import json
import numpy as np
from PIL import Image, ImageDraw

# Create a synthetic image with a "trunk" (dark vertical stripe on lighter background)
W, H = 640, 480
img = Image.new("RGB", (W, H), (120, 160, 100))  # greenish background
draw = ImageDraw.Draw(img)

# Draw a vertical "trunk" in the center (brown-ish)
trunk_x1, trunk_x2 = 280, 360  # 80px wide trunk
draw.rectangle([trunk_x1, 50, trunk_x2, 450], fill=(80, 50, 30))

# Save to bytes
buf = io.BytesIO()
img.save(buf, format="JPEG")
buf.seek(0)

# Define bounding box around the trunk with some margin
bbox = {
    "bbox_x1": 260,
    "bbox_y1": 100,
    "bbox_x2": 380,
    "bbox_y2": 400,
}

print("Sending measure-dbh request...")
resp = requests.post(
    "http://localhost:8100/api/v1/measure-dbh",
    files={"image": ("test_tree.jpg", buf, "image/jpeg")},
    data={
        **bbox,
        "fov_degrees": 70.0,
        "use_multi_row": True,
        "return_visualization": False,  # skip viz for speed
    },
)

print(f"Status: {resp.status_code}")
result = resp.json()

if result.get("success"):
    print(f"DBH: {result['dbh_cm']:.1f} cm")
    print(f"Confidence: {result['confidence']:.2f}")
    print(f"Trunk depth: {result['trunk_depth_m']:.2f} m")
    print(f"Trunk pixel width: {result['trunk_pixel_width']}")
    print(f"Chord length: {result['chord_length_m']:.4f} m")
    print(f"Focal length: {result['focal_length_px']:.1f} px")
    print(f"Method: {result['method']}")
    print(f"Timing: {result['timing']}")
    print(f"Notes: {result.get('notes', '')}")
else:
    print(f"Error: {result}")

print("\nFull response (without viz):")
print(json.dumps({k: v for k, v in result.items() if k != "visualization_base64"}, indent=2))
