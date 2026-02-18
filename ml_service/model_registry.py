"""
Model Registry & Configuration
================================
Central configuration for all ML models used in the DBH measurement pipeline.

This file serves as a single source of truth for model selection and upgrade.
When upgrading models, update MODEL_CONFIGS and DEFAULT_DEPTH_MODEL / DEFAULT_SEG_MODEL.

Architecture:
  depth_estimation.py  ← reads from here to pick the depth model
  tree_segmentation.py ← reads from here to pick the segmentation model
  app.py               ← reads from here for health/status info

UPGRADE GUIDE:
  Phase 1: Change DEFAULT_DEPTH_MODEL to "da_v2_base"
  Phase 2: Set ENABLE_SAM_SEGMENTATION = True
  Phase 3: Change DEFAULT_DEPTH_MODEL to "da3_metric_large" (requires testing)
  Phase 4: Enable ONNX by setting USE_ONNX_RUNTIME = True (after exporting)
"""

import os
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

# ============================================================
# Model Definitions
# ============================================================

@dataclass
class DepthModelConfig:
    """Configuration for a depth estimation model."""
    model_id: str                    # HuggingFace model ID or local path
    display_name: str                # Human-readable name
    params_m: float                  # Parameter count in millions
    license: str                     # License type
    expected_cpu_time_s: float       # Estimated CPU inference time (seconds)
    input_size: int                  # Default input resolution (px)
    output_type: str                 # "metric" or "relative"
    backend: str                     # "transformers", "da3_native", "onnx"
    requires_cuda: bool = False      # Whether CUDA is required
    notes: str = ""                  # Additional notes


# All available depth models — add new models here when upgrading
DEPTH_MODELS: Dict[str, DepthModelConfig] = {
    
    # ── Current (Phase 0) ──────────────────────────────────────
    "da_v2_small": DepthModelConfig(
        model_id="depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf",
        display_name="DA V2 Metric Outdoor Small",
        params_m=24.8,
        license="Apache-2.0",
        expected_cpu_time_s=1.5,
        input_size=518,
        output_type="metric",
        backend="transformers",
        notes="Current production model. Smallest, fastest.",
    ),
    
    # ── Phase 1: Upgrade ───────────────────────────────────────
    "da_v2_base": DepthModelConfig(
        model_id="depth-anything/Depth-Anything-V2-Metric-Outdoor-Base-hf",
        display_name="DA V2 Metric Outdoor Base",
        params_m=97.5,
        license="CC-BY-NC-4.0",
        expected_cpu_time_s=5.0,
        input_size=518,
        output_type="metric",
        backend="transformers",
        notes="Phase 1 upgrade. ~15% better depth accuracy. CC-BY-NC (學術OK).",
    ),
    
    # ── Phase 2: Further Upgrade ───────────────────────────────
    "da_v2_large": DepthModelConfig(
        model_id="depth-anything/Depth-Anything-V2-Metric-Outdoor-Large-hf",
        display_name="DA V2 Metric Outdoor Large",
        params_m=335.3,
        license="CC-BY-NC-4.0",
        expected_cpu_time_s=15.0,
        input_size=518,
        output_type="metric",
        backend="transformers",
        notes="Largest DA V2. Very slow on CPU. Only use with ONNX optimization.",
    ),
    
    # ── Apple Depth Pro (SOTA) ────────────────────────────────
    "depth_pro": DepthModelConfig(
        model_id="apple/DepthPro-hf",
        display_name="Apple Depth Pro",
        params_m=350.0,
        license="Apple Sample Code License",
        expected_cpu_time_s=25.0,
        input_size=1536,
        output_type="metric",
        backend="depth_pro",
        notes=(
            "ICLR 2025 SOTA. Sharp boundaries (+40% vs DA V2). "
            "Auto focal length + FOV estimation. "
            "0.3s on GPU, ~5-8s on Intel Arc iGPU via OpenVINO, ~25s on CPU. "
            "Uses DepthProForDepthEstimation + DepthProImageProcessorFast."
        ),
    ),
    
    # ── Phase 3: Next Generation ───────────────────────────────
    # TODO: Uncomment when DA3 is tested on this hardware
    # "da3_metric_large": DepthModelConfig(
    #     model_id="depth-anything/DA3METRIC-LARGE",
    #     display_name="DA3 Metric Large",
    #     params_m=350,
    #     license="Apache-2.0",
    #     expected_cpu_time_s=18.0,       # WARNING: Untested on CPU
    #     input_size=518,
    #     output_type="metric",
    #     backend="da3_native",           # Uses DA3's own API, not transformers
    #     requires_cuda=True,             # WARNING: Official DA3 requires CUDA
    #     notes=(
    #         "Phase 3. 自帶焦距估計, 大幅超越 DA V2. "
    #         "但官方要求 CUDA+xformers. 需要測試 CPU fallback. "
    #         "公式: metric_depth = focal * net_output / 300."
    #     ),
    # ),
    
    # ── Phase 4: Latest SOTA ───────────────────────────────────
    # TODO: Uncomment when MetricAnything is mature enough
    # "metric_anything": DepthModelConfig(
    #     model_id="yjh001/metricanything_student_pointmap",
    #     display_name="MetricAnything Student-PointMap",
    #     params_m=300,                   # Approximate, ViT-L based
    #     license="Apache-2.0",
    #     expected_cpu_time_s=20.0,       # WARNING: Untested
    #     input_size=518,
    #     output_type="metric",
    #     backend="metric_anything",
    #     notes=(
    #         "Phase 4. 直接輸出 3D 點雲 (XYZ). 不需要額外焦距估計. "
    #         "SOTA on 7 tasks. 但 2026-01 才發佈，生態尚未成熟. "
    #         "需要大幅修改 DBH 計算流程 (點雲 → DBH 而非 深度圖 → DBH)."
    #     ),
    # ),
}


@dataclass
class SegmentationModelConfig:
    """Configuration for a segmentation model."""
    model_id: str
    display_name: str
    params_m: float
    license: str
    expected_cpu_time_s: float
    backend: str                     # "heuristic", "sam2", "grounded_sam"
    needs_prompt: bool = False       # Whether user tap point is needed
    notes: str = ""


# All available segmentation approaches
SEGMENTATION_MODELS: Dict[str, SegmentationModelConfig] = {
    
    # ── Current: No ML model, depth-based only ─────────────────
    "depth_heuristic": SegmentationModelConfig(
        model_id="none",
        display_name="Depth-based Heuristic",
        params_m=0,
        license="N/A",
        expected_cpu_time_s=0.3,
        backend="heuristic",
        notes="Current method. Fast but inaccurate boundaries. No ML model needed.",
    ),
    
    # ── Phase 2: SAM 2.1 ──────────────────────────────────────
    "sam2_tiny": SegmentationModelConfig(
        model_id="facebook/sam2.1-hiera-tiny",
        display_name="SAM 2.1 Hiera Tiny",
        params_m=38.9,
        license="Apache-2.0",
        expected_cpu_time_s=3.0,
        backend="sam2",
        needs_prompt=False,       # Can use auto-prompt from depth center
        notes=(
            "Phase 2 upgrade. Pixel-perfect segmentation. "
            "Uses depth map to auto-generate point prompt. "
            "pip install sam2  # Requires Python>=3.10, PyTorch>=2.5.1"
        ),
    ),
    
    "sam2_small": SegmentationModelConfig(
        model_id="facebook/sam2.1-hiera-small",
        display_name="SAM 2.1 Hiera Small",
        params_m=46.0,
        license="Apache-2.0",
        expected_cpu_time_s=4.5,
        backend="sam2",
        needs_prompt=False,
        notes="Slightly better than tiny. Use if tiny isn't accurate enough.",
    ),
    
    # ── Phase 3: Grounded SAM ──────────────────────────────────
    # TODO: Uncomment when ready to test
    # "grounded_sam": SegmentationModelConfig(
    #     model_id="IDEA-Research/grounding-dino-tiny",
    #     display_name="Grounded SAM (DINO + SAM 2.1)",
    #     params_m=85.0,        # DINO tiny + SAM tiny combined
    #     license="Apache-2.0",
    #     expected_cpu_time_s=8.0,
    #     backend="grounded_sam",
    #     needs_prompt=False,
    #     notes=(
    #         "Phase 3. Zero-shot: auto-finds 'tree trunk' via text. "
    #         "No training data needed. But slower (2 models)."
    #     ),
    # ),
}


# ============================================================
# Active Configuration — CHANGE THESE TO UPGRADE
# ============================================================

# 👇 Phase 1: Change to "da_v2_base" for better accuracy (~5s instead of ~1.5s)
# 👇 Phase 3: Change to "da3_metric_large" after testing (need CUDA workaround)
DEFAULT_DEPTH_MODEL = os.environ.get("ML_DEPTH_MODEL", "da_v2_small")

# 👇 Phase 2: Change to "sam2_tiny" for pixel-perfect segmentation
# 👇 Phase 3: Change to "grounded_sam" for zero-shot tree detection
DEFAULT_SEG_MODEL = os.environ.get("ML_SEG_MODEL", "depth_heuristic")

# 👇 Phase 1+: Set to True after converting models to ONNX
#    ONNX Runtime gives 1.5-2.5x speedup on Intel CPU, zero accuracy loss.
#    Steps: pip install optimum onnxruntime
#           python -c "from optimum.onnxruntime import ORTModelForDepthEstimation; \
#               m = ORTModelForDepthEstimation.from_pretrained('MODEL_ID', export=True); \
#               m.save_pretrained('./onnx_models/depth')"
USE_ONNX_RUNTIME = os.environ.get("ML_USE_ONNX", "false").lower() == "true"

# 👇 ONNX 模型路徑 (export 後存放的目錄)
ONNX_MODEL_DIR = os.environ.get("ML_ONNX_DIR", "./onnx_models")

# 👇 CPU Thread count — set to physical core count for best throughput
#    i7-3615QM has 4 physical cores. Using all 4 for inference.
#    (Old setting was 2 because Render free had 1 core)
CPU_THREADS = int(os.environ.get("ML_CPU_THREADS", "4"))

# 👇 Input resolution override — lower = faster, slightly less accurate
#    518 = DA V2 default. 384 = ~45% less computation for ~2% accuracy loss.
#    Set via env var for quick testing: ML_INPUT_SIZE=384
INPUT_SIZE_OVERRIDE = int(os.environ.get("ML_INPUT_SIZE", "0"))  # 0 = use model default

# 👇 Phase 2: Enable SAM segmentation (requires sam2 to be installed)
ENABLE_SAM_SEGMENTATION = os.environ.get("ML_ENABLE_SAM", "false").lower() == "true"

# 👇 OpenVINO acceleration for Intel Arc iGPU / NPU / CPU
#    Gives 2-3x speedup on Intel hardware. Auto-detects best device.
#    Steps: pip install optimum[openvino] openvino
ENABLE_OPENVINO = os.environ.get("ML_USE_OPENVINO", "false").lower() == "true"


# ============================================================
# Accuracy Mode Presets
# ============================================================

@dataclass
class AccuracyPreset:
    """Predefined accuracy/speed tradeoff."""
    depth_model: str
    seg_model: str
    input_size: int          # 0 = model default
    use_multi_row: bool
    use_subpixel: bool       # TODO Phase 3: 亞像素邊緣偵測
    use_ellipse_fit: bool    # TODO Phase 3: 橢圓擬合修正
    description: str


# 使用者可透過 API 參數 mode=fast/balanced/accurate 選擇
ACCURACY_PRESETS: Dict[str, AccuracyPreset] = {
    "fast": AccuracyPreset(
        depth_model="da_v2_small",
        seg_model="depth_heuristic",
        input_size=384,       # Reduced resolution for speed
        use_multi_row=False,
        use_subpixel=False,
        use_ellipse_fit=False,
        description="快速模式 (~1.5s): 野外大量調查快速篩檢",
    ),
    "balanced": AccuracyPreset(
        depth_model="depth_pro",
        seg_model="sam2_tiny",
        input_size=0,
        use_multi_row=True,
        use_subpixel=True,
        use_ellipse_fit=False,
        description="平衡模式 (~8-11s): Depth Pro + SAM 2.1 + 亞像素邊緣",
    ),
    "accurate": AccuracyPreset(
        depth_model="depth_pro",
        seg_model="sam2_tiny",
        input_size=0,
        use_multi_row=True,
        use_subpixel=True,
        use_ellipse_fit=True,
        description="精確模式 (~10-15s): Depth Pro + SAM 2.1 + 亞像素 + 橢圓擬合",
    ),
}


# ============================================================
# Helper Functions
# ============================================================

def get_depth_config() -> DepthModelConfig:
    """Get the currently active depth model configuration."""
    model_key = DEFAULT_DEPTH_MODEL
    if model_key not in DEPTH_MODELS:
        print(f"[ModelRegistry] WARNING: Unknown depth model '{model_key}', falling back to da_v2_small")
        model_key = "da_v2_small"
    return DEPTH_MODELS[model_key]


def get_seg_config() -> SegmentationModelConfig:
    """Get the currently active segmentation model configuration."""
    model_key = DEFAULT_SEG_MODEL
    if model_key not in SEGMENTATION_MODELS:
        print(f"[ModelRegistry] WARNING: Unknown seg model '{model_key}', falling back to depth_heuristic")
        model_key = "depth_heuristic"
    return SEGMENTATION_MODELS[model_key]


def get_preset(mode: str) -> AccuracyPreset:
    """Get accuracy preset by mode name."""
    if mode not in ACCURACY_PRESETS:
        print(f"[ModelRegistry] WARNING: Unknown mode '{mode}', using 'balanced'")
        mode = "balanced"
    return ACCURACY_PRESETS[mode]


def print_config_summary():
    """Print current configuration to console on startup."""
    depth = get_depth_config()
    seg = get_seg_config()
    
    print("=" * 60)
    print("  ML Service Configuration Summary")
    print("=" * 60)
    print(f"  Depth Model:  {depth.display_name} ({depth.params_m}M params)")
    print(f"  Model ID:     {depth.model_id}")
    print(f"  License:      {depth.license}")
    print(f"  Est. Time:    ~{depth.expected_cpu_time_s}s on CPU")
    print(f"  Segmentation: {seg.display_name}")
    print(f"  ONNX Runtime: {'Enabled' if USE_ONNX_RUNTIME else 'Disabled'}")
    print(f"  OpenVINO:     {'Enabled' if ENABLE_OPENVINO else 'Disabled'}")
    print(f"  CPU Threads:  {CPU_THREADS}")
    print(f"  Input Size:   {INPUT_SIZE_OVERRIDE if INPUT_SIZE_OVERRIDE else 'model default'}")
    print(f"  SAM Enabled:  {ENABLE_SAM_SEGMENTATION}")
    print("=" * 60)
