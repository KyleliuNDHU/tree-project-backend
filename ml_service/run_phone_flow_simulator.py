"""Simulate the production phone DBH upload flow on the Xiang dataset.

This is a smoke-test runner, not a full benchmark matrix. It exercises the
same backend HTTP endpoint used by the Flutter app:

1. Load an Xiang RGB image.
2. Re-encode it like a phone upload profile.
3. Run the phone-side YOLOv8n TFLite simulator to get bbox only.
4. POST multipart/form-data to /api/v1/auto-measure-dbh with:
   - image JPEG
   - bbox_x1/y1/x2/y2
   - use_server_yolo_mask=true
   - focal metadata from the Xiang calibration table
5. Summarize bbox success, endpoint success, server-YOLO usage, error, latency.

Profiles:
- scanner: mirrors ScannerPage takePicture more closely (original image size).
- v3-autopilot: mirrors TreeImageService/ImagePicker defaults more closely
  (compressed JPEG around 1080 long edge, quality 85).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median

import requests

from benchmark_xiang import CSV_PATH, RGB_DIR, load_analysis_map, run_one
from run_eval_matrix import (
    ServiceConfig,
    _start_service,
    _stop_service,
    _wait_health,
    _warm_up,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = ROOT / "phone_flow_sim_20260505"


@dataclass(frozen=True)
class UploadProfile:
    name: str
    upload_long_edge: int
    jpeg_quality: int
    description: str


PROFILES = {
    "scanner": UploadProfile(
        name="scanner",
        upload_long_edge=0,
        jpeg_quality=95,
        description="ScannerPage CameraController.takePicture-style upload",
    ),
    "v3-autopilot": UploadProfile(
        name="v3-autopilot",
        upload_long_edge=1080,
        jpeg_quality=85,
        description="V3 TreeImageService/ImagePicker-style compressed upload",
    ),
}


CSV_COLUMNS = [
    "name",
    "gt_dbh_cm",
    "pred_dbh_cm",
    "abs_err_cm",
    "rel_err_pct",
    "gt_dist_m",
    "pred_depth_m",
    "confidence",
    "seg_source",
    "server_yolo_confidence",
    "server_yolo_positive_px",
    "phone_yolo_bbox_sent",
    "phone_yolo_confidence",
    "upload_width",
    "upload_height",
    "upload_scale",
    "jpeg_quality",
    "processing_width",
    "processing_height",
    "depth_estimation_ms",
    "detection_ms",
    "segmentation_ms",
    "dbh_calculation_ms",
    "elapsed_s",
    "ok",
    "error",
]


def _load_rows(start: int, limit: int) -> list[dict]:
    rows = list(csv.DictReader(open(CSV_PATH, "r", encoding="utf-8-sig")))
    if start:
        rows = rows[start:]
    if limit:
        rows = rows[:limit]
    return rows


def _summarize(records: list[dict], profile: UploadProfile, args: argparse.Namespace) -> dict:
    ok = [r for r in records if r.get("ok") and r.get("pred_dbh_cm")]
    bbox_ok = [r for r in records if r.get("phone_yolo_bbox_sent")]
    server_yolo_ok = [r for r in ok if r.get("seg_source") == "server_yolo_seg"]
    abs_errs = [abs(r["pred_dbh_cm"] - r["gt_dbh_cm"]) for r in ok]
    signed_errs = [r["pred_dbh_cm"] - r["gt_dbh_cm"] for r in ok]
    rel_errs = [abs(r["pred_dbh_cm"] - r["gt_dbh_cm"]) / r["gt_dbh_cm"] for r in ok]
    latencies = [r["elapsed_s"] for r in ok if r.get("elapsed_s") is not None]
    rmse = math.sqrt(mean([e * e for e in signed_errs])) if signed_errs else None

    summary = {
        "profile": profile.name,
        "profile_description": profile.description,
        "n_total": len(records),
        "n_bbox_ok": len(bbox_ok),
        "n_ok": len(ok),
        "n_fail": len(records) - len(ok),
        "bbox_success_pct": (len(bbox_ok) / len(records) * 100.0) if records else 0.0,
        "endpoint_success_pct": (len(ok) / len(records) * 100.0) if records else 0.0,
        "server_yolo_seg_pct": (len(server_yolo_ok) / len(ok) * 100.0) if ok else 0.0,
        "mae_cm": mean(abs_errs) if abs_errs else None,
        "medae_cm": median(abs_errs) if abs_errs else None,
        "rmse_cm": rmse,
        "bias_cm": mean(signed_errs) if signed_errs else None,
        "within_20pct": (sum(1 for e in rel_errs if e <= 0.20) / len(rel_errs) * 100.0) if rel_errs else None,
        "avg_latency_s": mean(latencies) if latencies else None,
        "upload_long_edge": profile.upload_long_edge,
        "jpeg_quality": profile.jpeg_quality,
        "use_ref_distance": args.use_ref_distance,
        "service_device": args.da3_device,
        "service_ir_dir": args.da3_ir_dir,
        "server_yolo_conf": args.server_yolo_conf,
    }
    return summary


def _write_outputs(records: list[dict], summary: dict, out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for rec in records:
            writer.writerow({k: rec.get(k, "") for k in CSV_COLUMNS})

    out_json = out_csv.with_suffix(".json")
    out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def _run_samples(base_url: str, rows: list[dict], profile: UploadProfile,
                 args: argparse.Namespace) -> list[dict]:
    records: list[dict] = []
    analysis_map = load_analysis_map()
    t0_all = time.time()
    for index, row in enumerate(rows, start=1):
        name = row["Name"]
        rgb_path = RGB_DIR / f"rgb-{name}.jpg"
        gt_dbh_cm = float(row["TD"]) * 100.0
        gt_dist_m = float(row["CapDis"])
        if not rgb_path.exists():
            rec = {
                "name": name,
                "gt_dbh_cm": gt_dbh_cm,
                "gt_dist_m": gt_dist_m,
                "ok": False,
                "error": f"missing image: {rgb_path}",
            }
            records.append(rec)
            print(f"[{index}/{len(rows)}] FAIL {name}: missing image")
            continue

        res = run_one(
            base_url=base_url,
            rgb_path=rgb_path,
            row=row,
            use_ref_distance=args.use_ref_distance,
            use_gt_mask=False,
            use_yolo_mask=False,
            use_yolo_m_mask=False,
            use_server_yolo_mask=True,
            use_gt_bbox=False,
            use_yolo_bbox=True,
            server_yolo_conf=args.server_yolo_conf,
            analysis_row=analysis_map.get(name),
            upload_long_edge=profile.upload_long_edge,
            jpeg_quality=profile.jpeg_quality,
            timeout=args.timeout,
        )
        pred = res.get("pred_dbh_cm")
        ok = bool(res.get("ok") and pred)
        abs_err = abs(float(pred) - gt_dbh_cm) if ok else None
        rel_err = (abs_err / gt_dbh_cm * 100.0) if ok and gt_dbh_cm else None
        rec = {
            **res,
            "name": name,
            "gt_dbh_cm": gt_dbh_cm,
            "gt_dist_m": gt_dist_m,
            "abs_err_cm": abs_err,
            "rel_err_pct": rel_err,
            "ok": ok,
        }
        records.append(rec)

        if ok:
            print(
                f"[{index}/{len(rows)}] OK   {name} "
                f"gt={gt_dbh_cm:5.1f} pred={float(pred):5.1f} "
                f"Δ={abs_err:4.1f}cm rel={rel_err:4.1f}% "
                f"bbox={res.get('phone_yolo_confidence') or 0:.3f} "
                f"seg={res.get('seg_source')} t={res.get('elapsed_s') or 0:.2f}s"
            )
        else:
            print(f"[{index}/{len(rows)}] FAIL {name}: {res.get('error', 'no dbh')}")

    print(f"[phone-flow] sample wall time: {time.time() - t0_all:.1f}s")
    return records


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=sorted(PROFILES), default="v3-autopilot")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--port", type=int, default=8120)
    ap.add_argument("--url", default="", help="Use an already-running ML service instead of starting one")
    ap.add_argument("--limit", type=int, default=12)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--timeout", type=float, default=240.0)
    ap.add_argument("--server-yolo-conf", type=float, default=0.15)
    ap.add_argument("--use-ref-distance", action="store_true")
    ap.add_argument("--da3-device", default="NPU", choices=["CPU", "GPU", "NPU"])
    ap.add_argument("--da3-ir-dir", default="openvino_models/da3_metric_large")
    ap.add_argument("--skip-warmup", action="store_true")
    args = ap.parse_args()

    profile = PROFILES[args.profile]
    out_dir = Path(args.out_dir)
    out_csv = out_dir / f"phone_flow__{profile.name}.csv"
    rows = _load_rows(args.start, args.limit)
    if not rows:
        raise RuntimeError("No Xiang rows selected")

    base_url = args.url.rstrip("/") if args.url else f"http://127.0.0.1:{args.port}"
    print("=== Phone flow simulator ===")
    print(f"profile={profile.name}: {profile.description}")
    print(f"samples={len(rows)} start={args.start}")
    print(f"base_url={base_url}")
    print(f"upload_long_edge={profile.upload_long_edge or 'original'} jpeg_quality={profile.jpeg_quality}")

    proc = None
    if not args.url:
        service = ServiceConfig(
            name=f"phone_flow_{args.da3_device.lower()}",
            da3_device=args.da3_device,
            da3_ir_dir=args.da3_ir_dir,
        )
        log_path = out_dir / "logs" / f"service_{service.name}.log"
        print(f"[service] starting DA3 {args.da3_device} / {args.da3_ir_dir}")
        proc = _start_service(service, args.port, log_path)

    try:
        _wait_health(base_url, timeout_s=120.0)
        if not args.skip_warmup:
            print("[service] warm-up DA3 + server YOLO (excluded from sample metrics)")
            _warm_up(base_url)
        records = _run_samples(base_url, rows, profile, args)
        summary = _summarize(records, profile, args)
        _write_outputs(records, summary, out_csv)
    finally:
        if proc is not None:
            _stop_service(proc)

    print("\n=== Summary ===")
    for key, value in summary.items():
        if isinstance(value, float):
            print(f"{key:22s}: {value:.3f}")
        else:
            print(f"{key:22s}: {value}")
    print(f"out_csv               : {out_csv}")
    print(f"out_json              : {out_csv.with_suffix('.json')}")
    return 0 if summary["n_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())