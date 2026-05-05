"""Smoke-test the phone DBH upload path through the Express backend proxy.

This runner mirrors the Flutter app network boundary after removing the ML API
key from the phone:

1. Login to the Express API and receive an app JWT.
2. Re-encode Xiang RGB images like the V3 gallery/camera path.
3. Run the phone-side YOLO bbox simulator.
4. POST multipart/form-data to /api/ml-service/auto-measure-dbh.

The backend then injects ML_API_KEY server-side before calling FastAPI.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import ssl
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[3]
XIANG_ROOT = ROOT / "tree_Xiang"
CSV_PATH = XIANG_ROOT / "tree_log.csv"
RGB_DIR = XIANG_ROOT / "treeRGB"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent / "phone_flow_proxy_smoke_20260505"

_YOLO_SIM = None


@dataclass(frozen=True)
class UploadProfile:
    name: str
    upload_long_edge: int
    jpeg_quality: int


PROFILES = {
    "scanner": UploadProfile("scanner", 0, 95),
    "v3-autopilot": UploadProfile("v3-autopilot", 1080, 85),
}


def _env(name: str, fallback: str = "") -> str:
    return os.environ.get(name, fallback).strip()


def _load_rows(start: int, limit: int) -> list[dict]:
    rows = list(csv.DictReader(open(CSV_PATH, "r", encoding="utf-8-sig")))
    if start:
        rows = rows[start:]
    if limit:
        rows = rows[:limit]
    return rows


def _open_url(request: urllib.request.Request, timeout: float) -> tuple[int, str]:
    context = ssl._create_unverified_context() if request.full_url.startswith("https://") else None
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def _post_json(url: str, payload: dict, timeout: float) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Content-Length": str(len(data)),
        },
        method="POST",
    )
    status, text = _open_url(request, timeout)
    try:
        return status, json.loads(text)
    except Exception:
        return status, {"raw": text[:300]}


def _multipart_body(fields: dict, files: dict) -> tuple[str, bytes]:
    boundary = f"----treeproxy{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    def add_text(value: str) -> None:
        chunks.append(value.encode("utf-8"))

    for name, value in fields.items():
        add_text(f"--{boundary}\r\n")
        add_text(f'Content-Disposition: form-data; name="{name}"\r\n\r\n')
        add_text(f"{value}\r\n")

    for name, (filename, content, content_type) in files.items():
        safe_filename = str(filename).replace('"', "_")
        add_text(f"--{boundary}\r\n")
        add_text(
            f'Content-Disposition: form-data; name="{name}"; '
            f'filename="{safe_filename}"\r\n'
        )
        add_text(f"Content-Type: {content_type}\r\n\r\n")
        chunks.append(content)
        add_text("\r\n")

    add_text(f"--{boundary}--\r\n")
    return boundary, b"".join(chunks)


def _post_multipart(url: str, fields: dict, files: dict, headers: dict, timeout: float) -> tuple[int, dict]:
    boundary, body = _multipart_body(fields, files)
    request_headers = {
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
        **headers,
    }
    request = urllib.request.Request(url, data=body, headers=request_headers, method="POST")
    status, text = _open_url(request, timeout)
    try:
        return status, json.loads(text)
    except Exception:
        return status, {"raw": text[:300]}


def _login(base_url: str, account: str, password: str, login_type: str, timeout: float) -> str:
    status, body = _post_json(
        f"{base_url.rstrip('/')}/login",
        {"account": account, "password": password, "loginType": login_type},
        timeout=timeout,
    )
    if status != 200 or not isinstance(body, dict) or body.get("success") is False:
        raise RuntimeError(f"login failed HTTP {status}: {body}")
    token = body.get("token")
    if not token:
        raise RuntimeError(f"login response did not include token: {body}")
    return token


def _prepare_upload_jpeg(rgb_path: Path, upload_long_edge: int, jpeg_quality: int) -> tuple[bytes, float, tuple[int, int]]:
    from PIL import Image

    image = Image.open(rgb_path).convert("RGB")
    original_width, original_height = image.size
    scale = 1.0
    if upload_long_edge > 0:
        long_edge = max(original_width, original_height)
        if long_edge != upload_long_edge:
            scale = float(upload_long_edge) / float(long_edge)
            new_width = max(1, int(round(original_width * scale)))
            new_height = max(1, int(round(original_height * scale)))
            image = image.resize((new_width, new_height), Image.BILINEAR)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=jpeg_quality, optimize=True)
    return buffer.getvalue(), scale, image.size


def _phone_yolo_bbox(upload_bytes: bytes) -> dict | None:
    from PIL import Image

    global _YOLO_SIM
    if _YOLO_SIM is None:
        from yolo_simulator import YoloSimulator, get_default_model_path
        _YOLO_SIM = YoloSimulator(get_default_model_path())
    image = Image.open(io.BytesIO(upload_bytes)).convert("RGB")
    detection = _YOLO_SIM.detect(image, want_full_mask=False)
    if detection is None:
        return None
    return {
        "bbox_x1": detection.bbox_x1,
        "bbox_y1": detection.bbox_y1,
        "bbox_x2": detection.bbox_x2,
        "bbox_y2": detection.bbox_y2,
        "confidence": detection.confidence,
    }


def _build_fields(row: dict, upload_scale: float, bbox: dict, args: argparse.Namespace) -> dict:
    fields = {
        "fov_degrees": "70.0",
        "return_visualization": "false",
        "return_detection_visualization": "false",
        "focal_length_px": f"{float(row['FocalScale']) * upload_scale:.4f}",
        "phone_make": "Apple",
        "phone_model": "iPhone",
        "bbox_x1": f"{bbox['bbox_x1']:.2f}",
        "bbox_y1": f"{bbox['bbox_y1']:.2f}",
        "bbox_x2": f"{bbox['bbox_x2']:.2f}",
        "bbox_y2": f"{bbox['bbox_y2']:.2f}",
        "use_server_yolo_mask": "true",
        "server_yolo_conf": f"{args.server_yolo_conf:.4f}",
    }
    if args.use_ref_distance:
        fields["reference_distance"] = f"{float(row['CapDis']):.4f}"
        fields["distance_strategy"] = "external_override"
    return fields


def _parse_measurement_response(body: dict) -> dict:
    result = body.get("result", body)
    timing = result.get("timing") or {}
    processing_size = result.get("processing_size") or {}
    segmentation = result.get("segmentation") or {}
    server_yolo = segmentation.get("server_yolo") or {}
    return {
        "pred_dbh_cm": result.get("dbh_cm"),
        "pred_depth_m": result.get("trunk_depth_m") or result.get("depth_m") or result.get("distance_m"),
        "confidence": result.get("confidence"),
        "method": result.get("method"),
        "backend_used": result.get("backend_used"),
        "processing_width": processing_size.get("width"),
        "processing_height": processing_size.get("height"),
        "depth_estimation_ms": timing.get("depth_estimation_ms"),
        "detection_ms": timing.get("detection_ms"),
        "segmentation_ms": timing.get("segmentation_ms"),
        "dbh_calculation_ms": timing.get("dbh_calculation_ms"),
        "seg_source": segmentation.get("source"),
        "server_yolo_confidence": server_yolo.get("confidence"),
        "server_yolo_positive_px": server_yolo.get("positive_px"),
    }


def _run_one(base_url: str, token: str, rgb_path: Path, row: dict, profile: UploadProfile, args: argparse.Namespace) -> dict:
    upload_bytes, upload_scale, upload_size = _prepare_upload_jpeg(
        rgb_path,
        profile.upload_long_edge,
        profile.jpeg_quality,
    )
    bbox = _phone_yolo_bbox(upload_bytes)
    if bbox is None:
        return {"ok": False, "error": "PHONE_YOLO_BBOX_FAIL", "phone_yolo_bbox_sent": False}

    fields = _build_fields(row, upload_scale, bbox, args)
    files = {"image": (rgb_path.name, upload_bytes, "image/jpeg")}
    headers = {"Authorization": f"Bearer {token}"}

    start = time.time()
    try:
        status, body = _post_multipart(
            f"{base_url.rstrip('/')}/ml-service/auto-measure-dbh",
            fields,
            files,
            headers=headers,
            timeout=args.timeout,
        )
        elapsed_s = time.time() - start
    except Exception as exc:
        return {"ok": False, "error": f"POST_FAIL: {exc}", "elapsed_s": time.time() - start}

    if status != 200:
        return {
            "ok": False,
            "error": f"HTTP{status}: {body.get('detail', body)}",
            "elapsed_s": elapsed_s,
            "phone_yolo_bbox_sent": True,
            "phone_yolo_confidence": bbox.get("confidence"),
        }

    return {
        "ok": True,
        **_parse_measurement_response(body),
        "phone_yolo_bbox_sent": True,
        "phone_yolo_confidence": bbox.get("confidence"),
        "upload_scale": upload_scale,
        "upload_width": upload_size[0],
        "upload_height": upload_size[1],
        "jpeg_quality": profile.jpeg_quality,
        "elapsed_s": elapsed_s,
    }


def _summarize(records: list[dict], profile: UploadProfile) -> dict:
    ok = [record for record in records if record.get("ok") and record.get("pred_dbh_cm")]
    abs_errs = [record["abs_err_cm"] for record in ok if record.get("abs_err_cm") is not None]
    latencies = [record["elapsed_s"] for record in ok if record.get("elapsed_s") is not None]
    return {
        "profile": profile.name,
        "n_total": len(records),
        "n_ok": len(ok),
        "n_fail": len(records) - len(ok),
        "mae_cm": mean(abs_errs) if abs_errs else None,
        "medae_cm": median(abs_errs) if abs_errs else None,
        "avg_latency_s": mean(latencies) if latencies else None,
    }


def _write_outputs(records: list[dict], summary: dict, out_dir: Path, profile: UploadProfile) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = out_dir / f"backend_proxy_phone_smoke__{profile.name}.json"
    out_csv = out_json.with_suffix(".csv")
    keys = sorted({key for record in records for key in record.keys()})
    with out_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=keys)
        writer.writeheader()
        writer.writerows(records)
    out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"out_csv : {out_csv}")
    print(f"out_json: {out_json}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=_env("TEST_BASE_URL", "http://localhost:3001/api"),
                        help="Express API base URL, including /api")
    parser.add_argument("--token", default=_env("TEST_APP_JWT"),
                        help="Use an existing app JWT instead of logging in")
    parser.add_argument("--account", default=_env("TEST_SURVEY_USER", "survey"))
    parser.add_argument("--password", default=_env("TEST_SURVEY_PASS", "survey123"))
    parser.add_argument("--login-type", default=_env("TEST_LOGIN_TYPE", "survey"))
    parser.add_argument("--profile", choices=sorted(PROFILES), default="v3-autopilot")
    parser.add_argument("--limit", type=int, default=2)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=240.0)
    parser.add_argument("--server-yolo-conf", type=float, default=0.15)
    parser.add_argument("--use-ref-distance", action="store_true")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    args = parser.parse_args()

    profile = PROFILES[args.profile]
    rows = _load_rows(args.start, args.limit)
    if not rows:
        raise RuntimeError("No Xiang rows selected")

    token = args.token or _login(args.base_url, args.account, args.password, args.login_type, args.timeout)

    print("=== Backend proxy phone smoke ===")
    print(f"base_url={args.base_url.rstrip('/')}")
    print(f"profile={profile.name} upload_long_edge={profile.upload_long_edge or 'original'} jpeg_quality={profile.jpeg_quality}")
    print(f"samples={len(rows)} start={args.start}")

    records = []
    for index, row in enumerate(rows, start=1):
        name = row["Name"]
        rgb_path = RGB_DIR / f"rgb-{name}.jpg"
        gt_dbh_cm = float(row["TD"]) * 100.0
        if not rgb_path.exists():
            record = {"name": name, "ok": False, "error": f"missing image: {rgb_path}"}
            records.append(record)
            print(f"[{index}/{len(rows)}] FAIL {name}: missing image")
            continue

        record = _run_one(args.base_url, token, rgb_path, row, profile, args)
        pred = record.get("pred_dbh_cm")
        ok = bool(record.get("ok") and pred)
        record.update({"name": name, "gt_dbh_cm": gt_dbh_cm, "ok": ok})
        if ok:
            record["abs_err_cm"] = abs(float(pred) - gt_dbh_cm)
            print(f"[{index}/{len(rows)}] OK   {name} gt={gt_dbh_cm:.1f} pred={float(pred):.1f} err={record['abs_err_cm']:.1f}cm t={record.get('elapsed_s') or 0:.2f}s")
        else:
            print(f"[{index}/{len(rows)}] FAIL {name}: {record.get('error', 'no dbh')}")
        records.append(record)

    summary = _summarize(records, profile)
    print("\n=== Summary ===")
    for key, value in summary.items():
        print(f"{key:14s}: {value:.3f}" if isinstance(value, float) else f"{key:14s}: {value}")
    _write_outputs(records, summary, Path(args.out_dir), profile)
    return 0 if summary["n_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
