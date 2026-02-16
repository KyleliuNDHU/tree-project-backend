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
import math
import time
import base64
import traceback
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np

from depth_estimation import estimate_depth, estimate_depth_with_info, load_model
from dbh_calculator import (
    BoundingBox, measure_dbh, measure_dbh_multi_row,
    estimate_focal_length_from_fov, focal_length_from_exif,
    PHONE_SENSORS, match_phone_sensor
)
from visualization import create_result_image, depth_to_colormap, image_to_bytes
from tree_trunk_detector import detect_trunks, create_detection_visualization

app = FastAPI(
    title="TreeAI DBH Measurement Service",
    description="Pure vision DBH measurement using Depth Anything V2",
    version="0.1.0",
)

# CORS for Flutter web / dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Startup
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Pre-load model on startup."""
    print("[Startup] Pre-loading Depth Anything V2 model...")
    try:
        load_model()
        print("[Startup] Model ready!")
    except Exception as e:
        print(f"[Startup] Warning: Could not pre-load model: {e}")
        print("[Startup] Model will be loaded on first request.")


# ============================================================
# Health Check
# ============================================================

@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "dbh-measurement",
        "model": "Depth-Anything-V2-Metric-Outdoor-Small",
    }


# ============================================================
# Depth Estimation
# ============================================================

@app.post("/api/v1/estimate-depth")
async def estimate_depth_endpoint(
    image: UploadFile = File(...),
    return_visualization: bool = Form(default=True),
):
    """
    Estimate depth from a single RGB image.

    Returns depth statistics and optionally a colorized depth map.
    """
    try:
        # Read image
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

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

@app.post("/api/v1/measure-dbh")
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
        # Validate bbox
        if bbox_x1 >= bbox_x2 or bbox_y1 >= bbox_y2:
            raise HTTPException(
                status_code=400,
                detail="Invalid bounding box: x1 must < x2, y1 must < y2"
            )

        # Read image
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        W, H = pil_image.size

        # Clamp bbox to image bounds
        bbox = BoundingBox(
            x1=max(0, bbox_x1),
            y1=max(0, bbox_y1),
            x2=min(W, bbox_x2),
            y2=min(H, bbox_y2),
        )

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
            "image_size": {"width": W, "height": H},
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

@app.post("/api/v1/auto-measure-dbh")
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
        # Read image
        img_bytes = await image.read()
        pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
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
            "timing": {
                "depth_estimation_ms": round(depth_time * 1000, 1),
                "detection_ms": round(detect_time * 1000, 1),
                "dbh_calculation_ms": round(calc_time * 1000, 1),
                "total_ms": round((depth_time + detect_time + calc_time) * 1000, 1),
            },
            "image_size": {"width": W, "height": H},
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
# Batch / Debug Endpoints
# ============================================================

@app.post("/api/v1/debug/depth-at-point")
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
