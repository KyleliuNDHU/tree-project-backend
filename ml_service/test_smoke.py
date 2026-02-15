"""Quick smoke test for depth estimation pipeline."""
import sys
sys.path.insert(0, r"c:\Users\aaari\OneDrive\Desktop\project_management_tree-app\20_\tree_project\project_code\backend\ml_service")

import numpy as np
from PIL import Image
from depth_estimation import estimate_depth_with_info

# Create a synthetic 640x480 test image (gradient)
arr = np.zeros((480, 640, 3), dtype=np.uint8)
arr[:, :, 0] = 100
arr[:, :, 1] = np.linspace(50, 200, 640).astype(np.uint8)
arr[:, :, 2] = 150
img = Image.fromarray(arr)

print("Running depth estimation on 640x480 synthetic image...")
result = estimate_depth_with_info(img)
dm = result["depth_map"]
print(f"Depth map shape: {dm.shape}")
print(f"Min depth: {result['min_depth']:.3f} m")
print(f"Max depth: {result['max_depth']:.3f} m")
print(f"Mean depth: {result['mean_depth']:.3f} m")
print("SUCCESS - depth estimation pipeline works!")
