# Paper Experiment Tables Plan

This file lays out the three benchmark tables and one figure that will replace
the current paper numbers (3.96 / 8.09 / 3.02 cm). All sources live in
`tree_project/`; no external data is needed.

Generated: 2026-04-28 (sleep-launch session).

---

## Inputs available

| Resource | Path | What it gives |
|---|---|---|
| Xiang RGB images | `tree_Xiang/treeRGB/rgb-<id>.jpg` | 294 portrait JPGs, 1440x1920 |
| Xiang LiDAR depth | `tree_Xiang/treePNG/combine-<id>..png` | 294 uint16, decode `arr[4:]*6/65536` -> meters |
| Xiang GT trunk mask | `tree_Xiang/treeSeg/rgb-<id>-tm.jpg` | 294 binary masks, 1440x1920 |
| Xiang full GT log | `tree_Xiang/tree_log.csv` | DBH (TD), focal (FocalScale), principal point (PrinU,V), tilt vector (ori_x,y,z), laser dist (CapDis), Xiang's own prediction (EstD) |
| Xiang per-sample analysis | `tree_Xiang/_analysis_per_sample.csv` | bbox + 5 heights x 4 formulas DBH baselines |
| Our YOLOv8n-seg (deploy) | `frontend/assets/ml/tree_trunk_seg.tflite` | 3.4M params |
| Our YOLOv8m-seg (server) | `backend/ml_service/trunk_detector_training/tree_trunk_seg_best.pt` | 27.24M params |
| 6 depth models | OpenVINO + PyTorch (DA-V2 S/B/L, Depth Pro, UniDepth-v2-L, DA3-metric-L) | |

---

## Table A - Main DBH benchmark (will replace 3.96 / 8.09 / 3.02 cm)

* Rows: 6 depth models
* Columns: 8 = (4 mask sources) x (2 distance modes)
  * mask: `none` (depth heuristic) / `gt` (Xiang GT mask, oracle) / `yolo_n` (deploy model) / `yolo_m` (server model)
  * dist: `nodist` (depth-model absolute scale) / `refdist` (laser GT scale)
* Cell: MAE (cm) / median AE (cm) / within-20% (%)
* Source: `benchmark_matrix_full/_matrix_summary.csv` produced by overnight run.
* Talking points for paper:
  - oracle (`gt + refdist`) lower bound vs. production (`yolo_n + refdist`) gap
  - server vs deploy YOLO trade-off (size 8x, MAE drop expected ~17%)
  - depth model independence: mask quality dominates
  - DA-V2 metric models can run nodist; UniDepth/DA3 need refdist

## Table B - DBH formula ablation (no extra inference required)

* Rows: 5 measurement heights (top-third / middle / bottom-third / bottom / tap)
* Columns: 4 formulas (pinhole / cylinder / tangent / Xiang LUT)
* Cell: MAE (cm) over 294 samples
* Source: `tree_Xiang/_analysis_per_sample.csv` already has 20 baseline columns
  (`*_pinhole_cm`, `*_cyl_cm`, `*_tangent_cm`, `*_xiang_cm`).
* Goal: justify our chosen height/formula choice; show Xiang's tangent-pinhole
  family is a reasonable backbone.

## Table C - Per-pixel depth quality vs iPhone LiDAR

* Rows: 6 depth models
* Columns: MAE (m), RMSE (m), MARE, bias (m), avg latency (s)
* Cell: aggregate across 294 samples, restricted to trunk-mask pixels with
  valid LiDAR (0 < |z| <= 4.8 m, the Xiang threshold).
* Source: `lidar_eval/<model>.csv` produced by `run_lidar_eval_all.ps1`.
* Goal: separate the question "is the depth model good?" from
  "is the DBH pipeline good?" - a model with low LiDAR-MAE but high DBH-MAE
  reveals failure of the geometric stage, not the depth stage.

## Figure - DBH error vs trunk tilt angle

* X-axis: angle between `(ori_x, ori_y, ori_z)` and (0, -1, 0) in degrees.
  (0 deg = perfectly vertical; >15 deg = significantly leaning).
* Y-axis: |Delta DBH| (cm) for the production setting (`yolo_n + refdist`,
  best depth model from Table A).
* Output: scatter + linear fit.
* Source: `tree_log.csv` (ori_xyz) joined with the production case CSV.
* Goal: empirical evidence for a "Limitations: tilted trunks" paragraph.

---

## Tomorrow morning checklist (in order)

1. `Get-Content benchmark_matrix_full_run.log -Tail 50` -> confirm completion.
2. Inspect `benchmark_matrix_full/_matrix_summary.csv` -> Table A.
3. `.\run_lidar_eval_all.ps1 -Limit 5` smoke (~5 min).
4. `.\run_lidar_eval_all.ps1` full (~6 hours, can run during the day) -> Table C.
5. Write `paper_tables.py` (matplotlib + pandas) that:
   - reads `_matrix_summary.csv` and `lidar_eval/*.json` and `_analysis_per_sample.csv`,
   - emits Table A/B/C as LaTeX,
   - emits the tilt-error scatter PNG.
6. Update `口試準備/論文重寫_工作區.md` with the new numbers.

## Notes

* GPU is OpenVINO Intel Arc iGPU. UniDepth + DA3 fall back to PyTorch CPU
  because we don't have OpenVINO conversions for them.
* `ML_RATE_LIMIT='1000000'` is required - the default 30/hour middleware will
  silently kill any 294-sample run.
* `benchmark_xiang.py` is gitignored on purpose (research script, contains
  hardcoded API key); only `yolo_simulator.py` and `run_benchmark_matrix.ps1`
  are in git.
