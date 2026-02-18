"""
DBH Pure Vision ML Service
===========================
FastAPI server providing DBH measurement from a single RGB image.

Endpoints:
  POST /api/v1/measure-dbh       - Full DBH measurement pipeline
  POST /api/v1/estimate-depth    - Depth estimation only
  GET  /api/v1/health            - Health check

Usage:
  uvicorn app:app --host 0.0.0.0 --port 8100 --reload
"""

import io
import os
import math
import time
import hmac
import base64
import hashlib
import traceback
from typing import Optional
from collections import defaultdict

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from PIL import Image
import numpy as np

# ============================================================
# Security: API Key Authentication
# ============================================================

ML_API_KEY = os.environ.get("ML_API_KEY", "")

# Allowed origins (restrict CORS)
# Add your frontend domains, ngrok domains, and localhost for dev
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        "ML_CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8080,https://tree-app-backend-prod.onrender.com"
    ).split(",") if o.strip()
]


def verify_api_key(request: Request):
    """Dependency that verifies the ML API key on protected endpoints."""
    if not ML_API_KEY:
        # If no API key is configured, skip auth (dev mode)
        return
    
    # Check X-ML-API-Key header
    provided_key = request.headers.get("X-ML-API-Key", "")
    if not provided_key:
        # Also check Authorization: Bearer <key>
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            provided_key = auth_header[7:].strip()
    
    if not provided_key or not hmac.compare_digest(provided_key, ML_API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing ML API key"
        )


# ============================================================
# Security: Simple In-Memory Rate Limiter
# ============================================================

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple IP-based rate limiter for ML endpoints."""
    
    def __init__(self, app, max_requests: int = 30, window_seconds: int = 3600):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health check
        if request.url.path.endswith("/health"):
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Clean old entries
        self.requests[client_ip] = [
            t for t in self.requests[client_ip]
            if now - t < self.window_seconds
        ]
        
        if len(self.requests[client_ip]) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."}
            )
        
        self.requests[client_ip].append(now)
        response = await call_next(request)
        return response

from depth_estimation import estimate_depth, estimate_depth_with_info, load_model
from dbh_calculator import (
    BoundingBox, DBHResult, measure_dbh, measure_dbh_multi_row,
    estimate_focal_length_from_fov, focal_length_from_exif,
    pixel_width_to_metric, cylindrical_correction,
    PHONE_SENSORS, match_phone_sensor
)
from visualization import create_result_image, depth_to_colormap, image_to_bytes
from tree_trunk_detector import detect_trunks, create_detection_visualization
from model_registry import (
    get_depth_config, get_seg_config, get_preset,
    print_config_summary, ACCURACY_PRESETS, DEPTH_MODELS,
    USE_ONNX_RUNTIME, ENABLE_SAM_SEGMENTATION,
)

# Max processing dimension — larger images are resized to save memory & time.
# Depth Anything V2 internally resizes to ~518px anyway; full-resolution is wasteful.
# On Render free (1 CPU, 512 MB), a 12 MP photo can cause 502 timeout.
MAX_PROCESSING_DIM = 800


def _resize_for_processing(image: Image.Image) -> tuple:
    """Resize image if it exceeds MAX_PROCESSING_DIM on its longest side.

    Returns:
        (resized_image, scale_factor)  where scale_factor = new_size / old_size.
        If no resize needed, scale_factor = 1.0.
    """
    W, H = image.size
    longest = max(W, H)
    if longest <= MAX_PROCESSING_DIM:
        return image, 1.0

    scale = MAX_PROCESSING_DIM / longest
    new_w = int(W * scale)
    new_h = int(H * scale)
    resized = image.resize((new_w, new_h), Image.LANCZOS)
    print(f"[Resize] {W}x{H} → {new_w}x{new_h} (scale={scale:.3f})")
    return resized, scale


app = FastAPI(
    title="TreeAI DBH Measurement Service",
    description="Pure vision DBH measurement using Depth Anything V2",
    version="0.2.0",
    docs_url="/docs" if os.environ.get("ML_DEBUG", "").lower() == "true" else None,
    redoc_url=None,
)

# Rate limiting middleware (30 requests per hour per IP)
app.add_middleware(
    RateLimitMiddleware,
    max_requests=int(os.environ.get("ML_RATE_LIMIT", "30")),
    window_seconds=3600,
)

# CORS — restricted to known origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-ML-API-Key", "Authorization"],
)


# ============================================================
# Startup
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Pre-load model on startup."""
    print_config_summary()
    print("[Startup] Pre-loading depth model...")
    try:
        load_model()
        print("[Startup] Model ready!")
    except Exception as e:
        print(f"[Startup] Warning: Could not pre-load model: {e}")
        print("[Startup] Model will be loaded on first request.")


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint (no auth required)."""
    depth_config = get_depth_config()
    seg_config = get_seg_config()
    return {
        "status": "ok",
        "service": "dbh-measurement",
        "model": depth_config.display_name,
        "model_params_m": depth_config.params_m,
        "segmentation": seg_config.display_name,
        "onnx_enabled": USE_ONNX_RUNTIME,
        "sam_enabled": ENABLE_SAM_SEGMENTATION,
        "auth_required": bool(ML_API_KEY),
        "available_modes": list(ACCURACY_PRESETS.keys()),
    }


# ============================================================
# Depth Estimation
# ============================================================

@app.post("/api/v1/estimate-depth", dependencies=[Depends(verify_api_key)])
async def estimate_depth_endpoint(
    image: UploadFile = File(...),
    return_visualization: bool = Form(default=True),
):
    """
    Estimate depth from a single RGB image.

    Returns depth statistics and optionally a colorized depth map.
    """
    try:
        # Read image and resize for performance
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        pil_image, _ = _resize_for_processing(pil_image)

        # Run depth estimation
        t0 = time.time()
        result = estimate_depth_with_info(pil_image)
        inference_time = time.time() - t0

        response = {
            "success": True,
            "inference_time_ms": round(inference_time * 1000, 1),
            "image_size": {"width": result["image_size"][0],
                          "height": result["image_size"][1]},
            "depth_stats": {
                "min_m": round(result["min_depth"], 3),
                "max_m": round(result["max_depth"], 3),
                "mean_m": round(result["mean_depth"], 3),
            },
        }

        if return_visualization:
            # Create colorized depth map
            depth_rgb = depth_to_colormap(result["depth_map"])
            depth_img = Image.fromarray(depth_rgb)
            depth_bytes = image_to_bytes(depth_img, "PNG")
            response["depth_map_base64"] = base64.b64encode(depth_bytes).decode()

        return JSONResponse(content=response)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# DBH Measurement
# ============================================================

@app.post("/api/v1/measure-dbh", dependencies=[Depends(verify_api_key)])
async def measure_dbh_endpoint(
    image: UploadFile = File(...),
    bbox_x1: int = Form(..., description="Bounding box left x"),
    bbox_y1: int = Form(..., description="Bounding box top y"),
    bbox_x2: int = Form(..., description="Bounding box right x"),
    bbox_y2: int = Form(..., description="Bounding box bottom y"),
    focal_length_px: Optional[float] = Form(default=None,
        description="Focal length in pixels. Auto-estimated if not provided."),
    focal_length_mm: Optional[float] = Form(default=None,
        description="EXIF focal length in mm (from phone camera)"),
    focal_length_35mm: Optional[float] = Form(default=None,
        description="35mm equivalent focal length (from EXIF)"),
    fov_degrees: float = Form(default=70.0,
        description="Horizontal FOV in degrees (used if focal_length not provided)"),
    phone_make: Optional[str] = Form(default=None,
        description="EXIF Make (e.g. 'Apple', 'samsung', 'Xiaomi')"),
    phone_model: Optional[str] = Form(default=None,
        description="EXIF Model (e.g. 'iPhone 15 Pro', 'SM-S928B', 'Mi A1')"),
    use_multi_row: bool = Form(default=True,
        description="Use multi-row median measurement for robustness"),
    return_visualization: bool = Form(default=True,
        description="Return annotated result image"),
):
    """
    Measure tree DBH from a single RGB image.

    Workflow:
    1. Upload image + trunk bounding box coordinates
    2. Server runs Depth Anything V2 for metric depth estimation
    3. Calculates DBH using depth + focal length + cylindrical correction
    4. Returns DBH in cm with confidence score

    The bounding box should tightly surround the tree trunk.
    """
    try:
        # Read image and resize for performance
        img_bytes = await image.read()
        pil_image_orig = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        W_orig, H_orig = pil_image_orig.size
        pil_image, scale = _resize_for_processing(pil_image_orig)
        W, H = pil_image.size

        # Normalize bbox (auto-swap if drawn right-to-left or bottom-to-top)
        nx1, nx2 = sorted([bbox_x1, bbox_x2])
        ny1, ny2 = sorted([bbox_y1, bbox_y2])

        # Scale bbox to resized coordinates and clamp to image bounds
        sx1 = max(0, int(nx1 * scale))
        sy1 = max(0, int(ny1 * scale))
        sx2 = min(W, int(nx2 * scale))
        sy2 = min(H, int(ny2 * scale))

        # Ensure minimum bbox size (at least 5px after scaling)
        if sx2 - sx1 < 5 or sy2 - sy1 < 5:
            raise HTTPException(
                status_code=400,
                detail="框選範圍太小，請框選更大的樹幹區域"
            )

        bbox = BoundingBox(x1=sx1, y1=sy1, x2=sx2, y2=sy2)

        # Compute focal length from EXIF if available
        effective_focal_px = focal_length_px
        effective_fov = fov_degrees
        focal_source = "default"

        if effective_focal_px is None and focal_length_mm is not None:
            # Use EXIF focal length + sensor width to compute focal_length_px
            # f_px = f_mm * W_px / sensor_width_mm
            sensor_w, sensor_match = match_phone_sensor(
                phone_make or "", phone_model or ""
            )
            effective_focal_px = focal_length_from_exif(
                focal_length_mm, sensor_w, W
            )
            focal_source = f"exif_mm ({focal_length_mm}mm, sensor={sensor_w}mm [{sensor_match}])"

        if effective_focal_px is None and focal_length_35mm is not None:
            # Compute FOV from 35mm equivalent focal length
            # FOV = 2 * atan(36 / (2 * f_35)) in degrees
            effective_fov = 2 * math.atan(36.0 / (2 * focal_length_35mm)) * 180.0 / math.pi
            focal_source = f"35mm_equiv ({focal_length_35mm}mm → FOV={effective_fov:.1f}°)"

        # Run depth estimation
        t0 = time.time()
        depth_map = estimate_depth(pil_image)
        depth_time = time.time() - t0

        # Measure DBH
        t1 = time.time()
        if use_multi_row:
            result = measure_dbh_multi_row(
                depth_map, bbox,
                focal_length_px=effective_focal_px,
                image_width_px=W,
                fov_degrees=effective_fov,
            )
        else:
            result = measure_dbh(
                depth_map, bbox,
                focal_length_px=effective_focal_px,
                image_width_px=W,
                fov_degrees=effective_fov,
            )
        calc_time = time.time() - t1

        # Add focal source to notes
        if focal_source != "default":
            result.notes.append(f"Focal source: {focal_source}")

        response = {
            "success": True,
            "dbh_cm": result.dbh_cm,
            "confidence": result.confidence,
            "trunk_depth_m": result.trunk_depth_m,
            "trunk_pixel_width": result.trunk_pixel_width,
            "chord_length_m": result.chord_length_m,
            "focal_length_px": result.focal_length_px,
            "measurement_row": result.measurement_row,
            "method": result.method,
            "notes": result.notes,
            "timing": {
                "depth_estimation_ms": round(depth_time * 1000, 1),
                "dbh_calculation_ms": round(calc_time * 1000, 1),
                "total_ms": round((depth_time + calc_time) * 1000, 1),
            },
            "image_size": {"width": W_orig, "height": H_orig},
            "processing_size": {"width": W, "height": H},
            "bbox": {"x1": bbox.x1, "y1": bbox.y1,
                     "x2": bbox.x2, "y2": bbox.y2},
        }

        if return_visualization:
            viz = create_result_image(
                pil_image, depth_map,
                (bbox.x1, bbox.y1, bbox.x2, bbox.y2),
                result.dbh_cm, result.trunk_depth_m,
                result.confidence, result.measurement_row,
            )
            viz_bytes = image_to_bytes(viz, "JPEG")
            response["visualization_base64"] = base64.b64encode(viz_bytes).decode()

        return JSONResponse(content=response)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Auto DBH Measurement (No Manual Bbox)
# ============================================================

@app.post("/api/v1/auto-measure-dbh", dependencies=[Depends(verify_api_key)])
async def auto_measure_dbh_endpoint(
    image: UploadFile = File(...),
    focal_length_px: Optional[float] = Form(default=None,
        description="Focal length in pixels. Auto-estimated if not provided."),
    focal_length_mm: Optional[float] = Form(default=None,
        description="EXIF focal length in mm"),
    focal_length_35mm: Optional[float] = Form(default=None,
        description="35mm equivalent focal length"),
    fov_degrees: float = Form(default=70.0,
        description="Horizontal FOV in degrees"),
    phone_make: Optional[str] = Form(default=None,
        description="EXIF Make (e.g. 'Apple', 'samsung', 'Xiaomi')"),
    phone_model: Optional[str] = Form(default=None,
        description="EXIF Model (e.g. 'iPhone 15 Pro', 'SM-S928B', 'Mi A1')"),
    # ── 新增: 精度模式選擇 (Phase 1+) ────────────────────────
    # mode=fast    → ~1.5s, 快速篩選
    # mode=balanced → ~3-6s, 日常使用 (預設)
    # mode=accurate → ~5-10s, 研究級精密量測
    mode: Optional[str] = Form(default=None,
        description="Accuracy mode: 'fast', 'balanced', or 'accurate'. "
                    "Controls model selection & processing detail."),
    # ── 新增: GPS 參考距離 (Phase 2: 手機到樹距離校正) ────────
    # 前端透過手機 GPS 到推算樹位的距離，作為絕對深度錨點
    # 比單目視覺深度估計準確得多（誤差從 ~5-10% 降到 ~1-2%）
    reference_distance: Optional[float] = Form(default=None,
        description="Known distance from phone to tree (meters), from GPS. "
                    "Overrides monocular depth estimation for higher accuracy."),
    # ── 新增: 使用者觸碰點 (Phase 2: SAM prompt) ──────────────
    # 使用者在手機上點擊目標樹幹 → 送出座標作為 SAM 分割的 prompt
    tap_x: Optional[int] = Form(default=None,
        description="User tap X coordinate on the tree trunk (for SAM segmentation)"),
    tap_y: Optional[int] = Form(default=None,
        description="User tap Y coordinate on the tree trunk (for SAM segmentation)"),
    return_visualization: bool = Form(default=True,
        description="Return annotated visualization image"),
    return_detection_visualization: bool = Form(default=True,
        description="Return Tesla-style detection overlay"),
):
    """
    Fully automatic DBH measurement — no manual bounding box needed.

    Workflow:
    1. Upload image (just take a photo of the tree)
    2. Server runs depth estimation + automatic trunk detection
    3. Auto-generates bounding box around detected trunk
    4. Measures DBH automatically
    5. Returns result with distance validation feedback

    Like Tesla's vision system: point the camera, AI does everything.
    """
    try:
        # Read image and resize for performance
        img_bytes = await image.read()
        pil_image_orig = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        W_orig, H_orig = pil_image_orig.size
        pil_image, scale = _resize_for_processing(pil_image_orig)
        W, H = pil_image.size

        # Compute focal length
        effective_focal_px = focal_length_px
        effective_fov = fov_degrees
        focal_source = "default"

        if effective_focal_px is None and focal_length_mm is not None:
            sensor_w, sensor_match = match_phone_sensor(
                phone_make or "", phone_model or ""
            )
            effective_focal_px = focal_length_from_exif(
                focal_length_mm, sensor_w, W
            )
            focal_source = f"exif_mm ({focal_length_mm}mm, sensor={sensor_w}mm [{sensor_match}])"

        if effective_focal_px is None and focal_length_35mm is not None:
            effective_fov = 2 * math.atan(36.0 / (2 * focal_length_35mm)) * 180.0 / math.pi
            focal_source = f"35mm_equiv ({focal_length_35mm}mm → FOV={effective_fov:.1f}°)"

        # Step 1: Depth estimation
        t0 = time.time()
        depth_map = estimate_depth(pil_image)
        depth_time = time.time() - t0

        # Step 2: Auto trunk detection
        t1 = time.time()
        detection = detect_trunks(depth_map)
        detect_time = time.time() - t1

        # Check if any trunk was found
        if not detection.trunks or detection.best_trunk_index < 0:
            response = {
                "success": False,
                "error": "no_trunk_detected",
                "message": "未偵測到樹幹 — 請對準樹幹拍攝，保持 1-3 公尺距離",
                "detection_notes": detection.notes,
                "depth_stats": detection.depth_stats,
                "timing": {
                    "depth_estimation_ms": round(depth_time * 1000, 1),
                    "detection_ms": round(detect_time * 1000, 1),
                    "total_ms": round((depth_time + detect_time) * 1000, 1),
                },
            }

            if return_detection_visualization:
                det_viz = create_detection_visualization(
                    pil_image, depth_map, detection
                )
                det_viz_bytes = image_to_bytes(det_viz, "JPEG")
                response["detection_visualization_base64"] = base64.b64encode(det_viz_bytes).decode()

            return JSONResponse(content=response)

        # Step 3: Use the best detected trunk for DBH measurement
        best_trunk = detection.trunks[detection.best_trunk_index]
        bbox = BoundingBox(
            x1=best_trunk.bbox_x1,
            y1=best_trunk.bbox_y1,
            x2=best_trunk.bbox_x2,
            y2=best_trunk.bbox_y2,
        )

        # Step 4: Measure DBH using auto-detected bbox
        t2 = time.time()
        result = measure_dbh_multi_row(
            depth_map, bbox,
            focal_length_px=effective_focal_px,
            image_width_px=W,
            fov_degrees=effective_fov,
        )
        calc_time = time.time() - t2

        # ── Phase 2: GPS reference distance override ──────────────
        # If the frontend provides a known phone-to-tree distance (from GPS),
        # use it as the absolute depth instead of the monocular estimate.
        # This dramatically improves accuracy: monocular depth has ~20-50% error,
        # while GPS distance at 1-5m range has ~2-5m error (still better for
        # relative scale calibration).
        depth_source = "monocular"
        if reference_distance is not None and reference_distance > 0:
            original_depth = result.trunk_depth_m
            # Scale factor: ratio of GPS distance to monocular depth
            if original_depth > 0:
                scale_factor = reference_distance / original_depth
                # Recalculate DBH with corrected depth
                corrected_chord = result.chord_length_m * scale_factor
                # Re-apply cylindrical correction with new distance
                corrected_dbh_m = cylindrical_correction(corrected_chord, reference_distance)
                corrected_dbh_cm = corrected_dbh_m * 100.0
                
                result = DBHResult(
                    dbh_cm=round(corrected_dbh_cm, 2),
                    confidence=min(1.0, round(result.confidence + 0.1, 3)),  # Boost confidence
                    trunk_depth_m=round(reference_distance, 3),
                    trunk_pixel_width=result.trunk_pixel_width,
                    chord_length_m=round(corrected_chord, 4),
                    focal_length_px=result.focal_length_px,
                    measurement_row=result.measurement_row,
                    method=f"{result.method}+gps_corrected",
                    notes=result.notes + [
                        f"GPS reference distance: {reference_distance:.2f}m",
                        f"Monocular depth was: {original_depth:.2f}m (scale: {scale_factor:.2f}x)",
                        f"Depth source: GPS (phone-to-tree distance)",
                    ],
                )
                depth_source = "gps_reference"
            else:
                # Monocular depth failed but we have GPS distance — use it directly
                # Recalculate from pixel width
                chord_m = pixel_width_to_metric(
                    result.trunk_pixel_width, reference_distance, result.focal_length_px
                )
                dbh_m = cylindrical_correction(chord_m, reference_distance)
                result = DBHResult(
                    dbh_cm=round(dbh_m * 100.0, 2),
                    confidence=round(0.6, 3),  # Moderate confidence
                    trunk_depth_m=round(reference_distance, 3),
                    trunk_pixel_width=result.trunk_pixel_width,
                    chord_length_m=round(chord_m, 4),
                    focal_length_px=result.focal_length_px,
                    measurement_row=result.measurement_row,
                    method="gps_only",
                    notes=[
                        f"GPS reference distance: {reference_distance:.2f}m",
                        "Monocular depth failed, using GPS distance directly",
                    ],
                )
                depth_source = "gps_fallback"

        if focal_source != "default":
            result.notes.append(f"Focal source: {focal_source}")
        result.notes.append(f"Auto-detected trunk (confidence: {best_trunk.confidence:.0%})")

        # Build response
        response = {
            "success": True,
            "auto_detected": True,
            "dbh_cm": result.dbh_cm,
            "confidence": result.confidence,
            "trunk_depth_m": result.trunk_depth_m,
            "trunk_pixel_width": result.trunk_pixel_width,
            "chord_length_m": result.chord_length_m,
            "focal_length_px": result.focal_length_px,
            "measurement_row": result.measurement_row,
            "method": result.method,
            "notes": result.notes,
            # Distance validation
            "distance_status": best_trunk.distance_status,
            "distance_message": best_trunk.distance_message,
            # Auto-detected bbox
            "detected_bbox": {
                "x1": best_trunk.bbox_x1,
                "y1": best_trunk.bbox_y1,
                "x2": best_trunk.bbox_x2,
                "y2": best_trunk.bbox_y2,
            },
            "detection_confidence": best_trunk.confidence,
            # All detected trunks info
            "all_trunks": [
                {
                    "bbox": {"x1": t.bbox_x1, "y1": t.bbox_y1,
                             "x2": t.bbox_x2, "y2": t.bbox_y2},
                    "confidence": t.confidence,
                    "depth_m": t.depth_m,
                    "distance_status": t.distance_status,
                    "distance_message": t.distance_message,
                }
                for t in detection.trunks
            ],
            "depth_source": depth_source,
            "reference_distance_m": reference_distance,
            "timing": {
                "depth_estimation_ms": round(depth_time * 1000, 1),
                "detection_ms": round(detect_time * 1000, 1),
                "dbh_calculation_ms": round(calc_time * 1000, 1),
                "total_ms": round((depth_time + detect_time + calc_time) * 1000, 1),
            },
            "image_size": {"width": W_orig, "height": H_orig},
            "processing_size": {"width": W, "height": H},
        }

        if return_visualization:
            viz = create_result_image(
                pil_image, depth_map,
                (bbox.x1, bbox.y1, bbox.x2, bbox.y2),
                result.dbh_cm, result.trunk_depth_m,
                result.confidence, result.measurement_row,
            )
            viz_bytes = image_to_bytes(viz, "JPEG")
            response["visualization_base64"] = base64.b64encode(viz_bytes).decode()

        if return_detection_visualization:
            det_viz = create_detection_visualization(
                pil_image, depth_map, detection
            )
            det_viz_bytes = image_to_bytes(det_viz, "JPEG")
            response["detection_visualization_base64"] = base64.b64encode(det_viz_bytes).decode()

        return JSONResponse(content=response)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# ML Service Configuration Endpoint
# ============================================================

@app.get("/api/v1/config")
async def get_ml_config():
    """
    Return current ML service configuration and available options.
    
    Frontend can use this to:
    - Show available accuracy modes in the UI
    - Display which model is active
    - Show estimated processing times
    """
    depth_config = get_depth_config()
    seg_config = get_seg_config()
    
    modes_info = {}
    for name, preset in ACCURACY_PRESETS.items():
        depth_m = DEPTH_MODELS.get(preset.depth_model)
        modes_info[name] = {
            "description": preset.description,
            "depth_model": preset.depth_model,
            "segmentation": preset.seg_model,
            "estimated_time_s": depth_m.expected_cpu_time_s if depth_m else 0,
            "features": {
                "multi_row": preset.use_multi_row,
                "subpixel": preset.use_subpixel,
                "ellipse_fit": preset.use_ellipse_fit,
            },
        }
    
    return {
        "active_depth_model": {
            "key": os.environ.get("ML_DEPTH_MODEL", "da_v2_small"),
            "name": depth_config.display_name,
            "params_m": depth_config.params_m,
            "license": depth_config.license,
        },
        "active_segmentation": {
            "key": os.environ.get("ML_SEG_MODEL", "depth_heuristic"),
            "name": seg_config.display_name,
        },
        "onnx_enabled": USE_ONNX_RUNTIME,
        "sam_enabled": ENABLE_SAM_SEGMENTATION,
        "available_modes": modes_info,
    }


# ============================================================
# Batch / Debug Endpoints
# ============================================================

@app.post("/api/v1/debug/depth-at-point", dependencies=[Depends(verify_api_key)])
async def depth_at_point(
    image: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
):
    """Get depth value at a specific pixel coordinate. Useful for debugging."""
    try:
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        depth_map = estimate_depth(pil_image)
        H, W = depth_map.shape

        if not (0 <= x < W and 0 <= y < H):
            raise HTTPException(status_code=400, detail=f"Point ({x},{y}) outside image ({W}x{H})")

        depth_value = float(depth_map[y, x])

        # Also get average in a small neighborhood
        r = 5
        x1, y1 = max(0, x-r), max(0, y-r)
        x2, y2 = min(W, x+r+1), min(H, y+r+1)
        neighborhood = depth_map[y1:y2, x1:x2]

        return {
            "depth_m": round(depth_value, 4),
            "neighborhood_mean_m": round(float(np.mean(neighborhood)), 4),
            "neighborhood_std_m": round(float(np.std(neighborhood)), 4),
            "point": {"x": x, "y": y},
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8100))
    uvicorn.run(app, host="0.0.0.0", port=port)
