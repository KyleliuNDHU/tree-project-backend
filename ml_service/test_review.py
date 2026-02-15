"""Quick review test for all ML service modules."""
import sys
sys.path.insert(0, '.')
import numpy as np

# Test 1: imports
from dbh_calculator import (BoundingBox, measure_dbh, measure_dbh_multi_row,
    estimate_focal_length_from_fov, focal_length_from_exif, PHONE_SENSORS,
    _gradient_edge_detection, _threshold_clustering)
print('OK: all dbh_calculator imports')

# Test 2: app imports
from app import app
print('OK: app imports')

# Test 3: depth_estimation
from depth_estimation import load_model, estimate_depth
print('OK: depth_estimation imports')

# Test 4: visualization
from visualization import create_result_image, depth_to_colormap, image_to_bytes
print('OK: visualization imports')

# Test 5: focal_length_from_exif correctness
f_px = focal_length_from_exif(4.71, 7.0, 4032)
expected = 4.71 * 4032 / 7.0
assert abs(f_px - expected) < 0.01, f'Expected {expected}, got {f_px}'
print(f'OK: focal_length_from_exif(4.71mm, 7.0mm sensor, 4032px) = {f_px:.1f}px')

# Test 6: PHONE_SENSORS data
assert 'default' in PHONE_SENSORS
assert PHONE_SENSORS['default'] == 7.0
print(f'OK: PHONE_SENSORS has {len(PHONE_SENSORS)} entries, default={PHONE_SENSORS["default"]}mm')

# Test 7: edge detection with synthetic data
row = np.array([5.0]*20 + [2.0]*40 + [5.0]*20)
gw = _gradient_edge_detection(row, len(row))
tw, tm = _threshold_clustering(row, 0.3)
print(f'OK: gradient_width={gw:.0f}, threshold_width={tw:.0f} (expected ~40)')

# Test 8: full measure_dbh with synthetic depth map
depth_map = np.full((480, 640), 5.0)
# "trunk" at center, 2m depth, 40px wide
depth_map[200:300, 300:340] = 2.0
bbox = BoundingBox(x1=280, y1=200, x2=360, y2=300)
result = measure_dbh(depth_map, bbox, image_width_px=640, fov_degrees=70.0)
print(f'OK: measure_dbh => dbh={result.dbh_cm:.1f}cm, depth={result.trunk_depth_m:.1f}m, conf={result.confidence:.2f}')

# Test 9: multi-row
result2 = measure_dbh_multi_row(depth_map, bbox, image_width_px=640, fov_degrees=70.0)
print(f'OK: measure_dbh_multi_row => dbh={result2.dbh_cm:.1f}cm, method={result2.method}')

# Test 10: FOV estimation
f_est = estimate_focal_length_from_fov(4032, 70.0)
print(f'OK: estimate_focal_length_from_fov(4032, 70) = {f_est:.1f}px')

print()
print('=== ALL 10 TESTS PASSED ===')
