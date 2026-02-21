import os
import sys
import subprocess
import argparse
from pathlib import Path

def setup_models(depth_only=False, sam_only=False, download_only=False):
    print("=" * 60)
    print("SOTA Model Setup for Intel Core Ultra (OpenVINO)")
    print("=" * 60)

    # Base directory for models (inside project for write access)
    base_dir = Path(__file__).parent / "models"
    base_dir.mkdir(exist_ok=True)
    # Use project-local cache to avoid ~/.cache permission issues
    cache_dir = base_dir / "hf_cache"
    cache_dir.mkdir(exist_ok=True)

    def _download_pytorch(model_id: str, local_dir: Path) -> bool:
        """Download model via huggingface_hub into project (fallback when export fails)."""
        try:
            from huggingface_hub import snapshot_download
            path = snapshot_download(repo_id=model_id, local_dir=str(local_dir))
            print(f"  - Saved to {path}")
            return True
        except Exception as e:
            print(f"  [ERROR] Download failed: {e}")
            return False

    # 1. Depth Pro (Depth Anything V2 as proxy)
    if not sam_only:
        print("\n[Depth Pro] Setting up...")
        model_id = "depth-anything/Depth-Anything-V2-Small-hf"
        depth_pt = base_dir / "depth_pro_pt"
        try:
            if download_only:
                print(f"  - Downloading PyTorch model: {model_id}...")
                _download_pytorch(model_id, depth_pt)
            else:
                print(f"  - Downloading {model_id}...")
                print("  - Converting to OpenVINO IR (FP16)...")
                env = {**os.environ, "HF_HOME": str(cache_dir)}
                cmd = ["optimum-cli", "export", "openvino", "--model", model_id, "--task", "depth-estimation",
                       "--weight-format", "fp16", str(base_dir / "depth_pro_ov")]
                ret = subprocess.run(cmd, env=env).returncode
                if ret != 0:
                    print(f"  [WARN] OpenVINO export failed (exit {ret}). Falling back to PyTorch download...")
                    _download_pytorch(model_id, depth_pt)
        except Exception as e:
            print(f"  [ERROR] Depth Pro setup failed: {e}")
            if not download_only:
                print("  - Attempting PyTorch fallback download...")
                _download_pytorch(model_id, depth_pt)

    # 2. SAM 2.1
    if not depth_only:
        print("\n[SAM 2.1] Setting up...")
        model_id = "facebook/sam2.1-hiera-tiny"
        sam_pt = base_dir / "sam2_tiny_pt"
        try:
            if download_only:
                print(f"  - Downloading PyTorch model: {model_id}...")
                _download_pytorch(model_id, sam_pt)
            else:
                print(f"  - Downloading {model_id}...")
                print("  - Converting to OpenVINO IR (FP16)...")
                env = {**os.environ, "HF_HOME": str(cache_dir)}
                cmd = ["optimum-cli", "export", "openvino", "--model", model_id, "--task", "feature-extraction",
                       "--weight-format", "fp16", str(base_dir / "sam2_tiny_ov")]
                ret = subprocess.run(cmd, env=env).returncode
                if ret != 0:
                    print(f"  [WARN] OpenVINO export failed (exit {ret}). Falling back to PyTorch download...")
                    _download_pytorch(model_id, sam_pt)
        except Exception as e:
            print(f"  [ERROR] SAM 2 setup failed: {e}")
            if not download_only:
                print("  - Attempting PyTorch fallback download...")
                _download_pytorch(model_id, sam_pt)

    print("\n" + "=" * 60)
    print("Setup Complete!")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--depth-only", action="store_true")
    parser.add_argument("--sam-only", action="store_true")
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()
    
    setup_models(args.depth_only, args.sam_only, args.download_only)
