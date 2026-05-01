"""Production smoke test: estimate_depth_rich() with DA3 OV path."""
import os, sys, time
from pathlib import Path
from PIL import Image

# Force DA3 metric large
os.environ["ML_DEPTH_MODEL"] = "da3_metric_large"

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "third_party" / "depth-anything-3" / "src"))

from depth_estimation import estimate_depth_rich

XIANG = Path(r"C:\projects\tree_project\trunk_training_data\xiang_zenodo\data and code\tree\treeRGB")
files = sorted([f for f in XIANG.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png")])[:3]

for p in files:
    img = Image.open(p).convert("RGB")
    t0 = time.time()
    res = estimate_depth_rich(img)
    dt = time.time() - t0
    d = res.depth_map
    print(f"{p.name}: {dt*1000:.0f}ms  backend={res.backend_used}  "
          f"shape={d.shape} range=[{d.min():.2f},{d.max():.2f}m]  notes={res.notes}")
