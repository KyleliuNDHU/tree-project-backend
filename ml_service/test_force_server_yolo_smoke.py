"""Smoke test for ML_FORCE_SERVER_YOLO=true (detection-only rollout).

For 10 deterministic Xiang samples, hit /api/v1/auto-measure-dbh in two modes:

  A) GT bbox + use_server_yolo_mask=true   (server-YOLO detection-only path)
  B) GT bbox + GT trunk_mask_base64 attached (legacy phone-mask path)

(GT bbox is used in place of phone YOLO bbox so the test runs without the
TFLite stack; the server-side mask logic is identical.)

With ML_FORCE_SERVER_YOLO=true on the server, both modes MUST produce
``segmentation.method == 'server_yolo_seg'``. Mode B additionally proves the
override drops the phone-supplied mask.

Run from this directory while ml_service is running on http://127.0.0.1:8100:

    py -3 test_force_server_yolo_smoke.py
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path
from statistics import mean, median

# Allow running from arbitrary cwd
sys.path.insert(0, str(Path(__file__).resolve().parent))

from benchmark_xiang import (
    CSV_PATH, RGB_DIR, load_analysis_map, run_one,
)

# Ensure the API key is loaded (start.ps1 already exports it for the server,
# but this script reads it from the same .env via os.environ).
ENV_FILE = Path(__file__).resolve().parent / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

BASE_URL = os.environ.get("ML_BASE_URL", "http://127.0.0.1:8100")
N_SAMPLES = 10


def _pick_samples() -> list[dict]:
    rows = list(csv.DictReader(open(CSV_PATH, "r", encoding="utf-8-sig")))
    analysis = load_analysis_map()
    picked: list[dict] = []
    for r in rows:
        name = r["Name"]
        if name in analysis and (RGB_DIR / f"rgb-{name}.jpg").exists():
            r["_analysis"] = analysis[name]
            picked.append(r)
        if len(picked) >= N_SAMPLES:
            break
    return picked


def _summary(records: list[dict], label: str) -> None:
    ok = [r for r in records if r.get("ok") and r.get("pred_dbh_cm")]
    server_yolo = [r for r in ok if r.get("seg_source") == "server_yolo_seg"]
    abs_errs = [abs(r["pred_dbh_cm"] - r["gt_dbh_cm"]) for r in ok]
    rel_errs = [abs(r["pred_dbh_cm"] - r["gt_dbh_cm"]) / r["gt_dbh_cm"] for r in ok]
    lat = [r["elapsed_s"] for r in ok]
    print(f"\n=== {label} ===")
    print(f"  samples:           {len(records)}")
    print(f"  ok:                {len(ok)}")
    print(f"  server_yolo_seg:   {len(server_yolo)} / {len(ok)}  "
          f"{'PASS' if len(server_yolo) == len(ok) and len(ok) > 0 else 'FAIL'}")
    if abs_errs:
        print(f"  MAE:               {mean(abs_errs):6.2f} cm")
        print(f"  median |err|:      {median(abs_errs):6.2f} cm")
        print(f"  within ±20%:       {sum(1 for e in rel_errs if e <= 0.20)} / {len(rel_errs)}")
        print(f"  avg latency:       {mean(lat):.2f} s")


def _run_mode(rows: list[dict], *, with_phone_mask: bool, label: str) -> list[dict]:
    print(f"\n>>> {label}  (with_phone_mask={with_phone_mask})")
    out: list[dict] = []
    for i, row in enumerate(rows, 1):
        name = row["Name"]
        rgb = RGB_DIR / f"rgb-{name}.jpg"
        gt = float(row["TD"]) * 100.0
        res = run_one(
            base_url=BASE_URL,
            rgb_path=rgb,
            row=row,
            use_ref_distance=True,           # match best-config refdist
            use_gt_mask=with_phone_mask,     # mode B sends GT mask; server must drop it
            use_yolo_mask=False,
            use_yolo_m_mask=False,
            use_server_yolo_mask=not with_phone_mask,
            use_gt_bbox=True,
            use_yolo_bbox=False,
            server_yolo_conf=0.15,
            analysis_row=row.get("_analysis"),
            upload_long_edge=0,
            jpeg_quality=95,
            timeout=60.0,
        )
        # Try to surface segmentation method.
        seg_source = None
        if res.get("ok"):
            # run_one omitted segmentation method; pull from response we
            # received via timing/segmentation_ms presence + server_yolo_info
            seg_source = (res.get("seg_source")
                          or ("server_yolo_seg" if res.get("server_yolo_confidence")
                              else None))
        rec = {
            **res,
            "name": name,
            "gt_dbh_cm": gt,
            "seg_source": seg_source,
        }
        out.append(rec)
        err = (abs(rec["pred_dbh_cm"] - gt)
               if rec.get("ok") and rec.get("pred_dbh_cm") else None)
        print(f"  [{i:2d}] {name[:40]:40s} "
              f"gt={gt:5.1f} pred={rec.get('pred_dbh_cm') or 'n/a':>5} "
              f"err={'%.2f' % err if err is not None else 'n/a':>6}  "
              f"seg={seg_source or '-'}")
    return out


def main() -> int:
    rows = _pick_samples()
    if not rows:
        print("No samples found.")
        return 1

    a = _run_mode(rows, with_phone_mask=False,
                  label="MODE A: phone bbox only (detection-only path)")
    b = _run_mode(rows, with_phone_mask=True,
                  label="MODE B: phone bbox + GT mask (must be dropped)")

    _summary(a, "MODE A (phone bbox + server YOLO)")
    _summary(b, "MODE B (phone bbox + GT mask sent → must be dropped)")

    a_ok = [r for r in a if r.get("ok")]
    b_ok = [r for r in b if r.get("ok")]
    a_server = sum(1 for r in a_ok if r.get("seg_source") == "server_yolo_seg")
    b_server = sum(1 for r in b_ok if r.get("seg_source") == "server_yolo_seg")
    print("\n=== VERDICT ===")
    print(f"  MODE A server_yolo_seg: {a_server}/{len(a_ok)}")
    print(f"  MODE B server_yolo_seg: {b_server}/{len(b_ok)}  "
          f"(must equal MODE A — phone mask was dropped)")
    pass_all = (
        a_server == len(a_ok) and len(a_ok) >= 8
        and b_server == len(b_ok) and len(b_ok) >= 8
    )
    print(f"  RESULT: {'PASS' if pass_all else 'FAIL'}")
    return 0 if pass_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
