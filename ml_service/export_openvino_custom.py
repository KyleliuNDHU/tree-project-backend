"""
OpenVINO Export: Depth Pro & SAM 2.1
=====================================
Exports apple/DepthPro-hf and facebook/sam2.1-hiera-tiny to FP16 OpenVINO IR.
Uses aggressive memory management and CPU-only tracing for reliability.

Depth Pro: Full model export (single openvino_model.xml). Optimum can load directly.

SAM 2.1: Image encoder only (ov_image_encoder.xml). The mask decoder is lightweight
and kept in PyTorch. model_registry uses "Hybrid Mode": OpenVINO encoder +
PyTorch decoder — a common optimization (~95% of compute is in the encoder).

Usage:
  python export_openvino_custom.py --depth   # Export Depth Pro
  python export_openvino_custom.py --sam     # Export SAM 2.1 image encoder
  python export_openvino_custom.py --depth --sam  # Export both
"""

import argparse
import gc
import os
import sys
import warnings
from pathlib import Path

# Ensure sam2 can be imported (when sam2_src is used as local clone)
_ML_SERVICE = Path(__file__).resolve().parent
_SAM2_SRC = _ML_SERVICE / "sam2_src"
if _SAM2_SRC.exists() and str(_SAM2_SRC) not in sys.path:
    sys.path.insert(0, str(_SAM2_SRC))

# Output directory (matches model_registry OPENVINO_MODEL_DIR)
OUTPUT_DIR = Path(os.environ.get("ML_OPENVINO_DIR", "openvino_models"))


def _gc_collect():
    """Aggressive memory cleanup."""
    gc.collect()
    if hasattr(gc, "collect"):
        gc.collect(generation=2)


def export_depth_pro():
    """Export apple/DepthPro-hf to FP16 OpenVINO IR on CPU."""
    import torch
    import openvino as ov
    from transformers import DepthProForDepthEstimation

    torch.set_grad_enabled(False)
    # Explicit CPU for tracing (model + dummy_input on CPU)
    out_dir = OUTPUT_DIR / "depth_pro"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Exporting Depth Pro (apple/DepthPro-hf) to OpenVINO FP16")
    print("=" * 60)

    _gc_collect()

    print("[1/4] Loading model on CPU...")
    model = DepthProForDepthEstimation.from_pretrained(
        "apple/DepthPro-hf",
        torch_dtype=torch.float32,
    )
    model = model.to("cpu")
    model.eval()
    _gc_collect()

    print("[2/4] Creating dummy input (1, 3, 1536, 1536)...")
    dummy_input = torch.zeros(1, 3, 1536, 1536, device="cpu")

    print("[3/4] Converting to OpenVINO (tracing on CPU)...")
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)
        warnings.filterwarnings("ignore", category=UserWarning)
        ov_model = ov.convert_model(
            model,
            example_input={"pixel_values": dummy_input},
        )

    print("[4/4] Saving FP16 IR + config...")
    ov.save_model(ov_model, out_dir / "openvino_model.xml", compress_to_fp16=True)
    # Optimum expects config.json for from_pretrained(local_path); save from loaded model
    try:
        import json
        cfg = model.config.to_dict()
        with open(out_dir / "config.json", "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception:
        pass  # Optional; model may load without it
    print(f"Saved to {out_dir}")

    del model
    del ov_model
    del dummy_input
    _gc_collect()
    print("Depth Pro export complete.\n")


def export_sam():
    """Export facebook/sam2.1-hiera-tiny image encoder to FP16 OpenVINO IR on CPU."""
    import torch
    import openvino as ov
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    torch.set_grad_enabled(False)
    # Explicit CPU for tracing (model + dummy_input on CPU)

    class SamImageEncoderModel(torch.nn.Module):
        """Minimal wrapper for SAM 2 image encoder export."""

        def __init__(self, predictor):
            super().__init__()
            self.image_encoder = predictor.model.image_encoder
            self.base_model = predictor.model
            self._bb_feat_sizes = predictor._bb_feat_sizes

        @torch.no_grad()
        def forward(self, image: torch.Tensor):
            backbone_out = self.base_model.forward_image(image)
            _, vision_feats, _, _ = self.base_model._prepare_backbone_features(backbone_out)
            if self.base_model.directly_add_no_mem_embed:
                vision_feats[-1] = vision_feats[-1] + self.base_model.no_mem_embed
            feats = [
                feat.permute(1, 2, 0).view(1, -1, *feat_size)
                for feat, feat_size in zip(vision_feats[::-1], self._bb_feat_sizes[::-1])
            ][::-1]
            return (feats[-1], feats[0], feats[1])

    out_dir = OUTPUT_DIR / "sam2_tiny"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Exporting SAM 2.1 (facebook/sam2.1-hiera-tiny) to OpenVINO FP16")
    print("=" * 60)

    _gc_collect()

    print("[1/4] Loading predictor on CPU...")
    predictor = SAM2ImagePredictor.from_pretrained(
        "facebook/sam2.1-hiera-tiny",
        device="cpu",
    )
    encoder_model = SamImageEncoderModel(predictor)
    encoder_model.eval()
    _gc_collect()

    print("[2/4] Creating dummy input (1, 3, 1024, 1024)...")
    dummy_input = torch.zeros(1, 3, 1024, 1024, device="cpu")

    print("[3/4] Converting to OpenVINO (tracing on CPU)...")
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=torch.jit.TracerWarning)
        warnings.filterwarnings("ignore", category=UserWarning)
        ov_encoder = ov.convert_model(
            encoder_model,
            example_input=dummy_input,
            input=([1, 3, 1024, 1024],),
        )

    print("[4/4] Saving FP16 IR...")
    ov.save_model(
        ov_encoder,
        out_dir / "ov_image_encoder.xml",
        compress_to_fp16=True,
    )
    print(f"Saved to {out_dir}")

    del predictor
    del encoder_model
    del ov_encoder
    del dummy_input
    _gc_collect()
    print("SAM 2.1 export complete.\n")


def main():
    parser = argparse.ArgumentParser(description="Export models to OpenVINO FP16")
    parser.add_argument("--depth", action="store_true", help="Export Depth Pro")
    parser.add_argument("--sam", action="store_true", help="Export SAM 2.1 image encoder")
    args = parser.parse_args()

    if not args.depth and not args.sam:
        parser.print_help()
        print("\nSpecify at least one of --depth or --sam")
        sys.exit(1)

    if args.depth:
        export_depth_pro()

    if args.sam:
        export_sam()

    print("All exports finished successfully.")


if __name__ == "__main__":
    main()
