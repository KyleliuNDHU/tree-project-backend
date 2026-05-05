# Benchmark Statistical Analysis

- Source dir: `c:\projects\tree_project\project_code\backend\ml_service\benchmark_matrix_fixfull_20260505`
- Configs analysed: **3**
- scipy available: **True**

## 1. Per-config summary (sorted by MAE asc)

| # | tag | model | mask | refdist | n_ok/n | MAE±std cm | RMSE cm | bias cm | MAPE % | ≤10% (95% CI) | ≤20% (95% CI) | latency s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `da3_504x378_npu__serveryolo_gtbbox__refdist` | DA3 Metric Large | server-yolo+gt-bbox | Y | 294/294 | **4.36** ± 3.85 | 5.82 | +3.68 | 9.5 | 60.9% [55.2, 66.3] | 92.5% [88.9, 95.0] | 0.9 |
| 2 | `da3_504x378_npu__serveryolo_phonebbox__nodist` | DA3 Metric Large | server-yolo+phone-bbox | N | 294/294 | **8.53** ± 6.98 | 11.02 | -4.12 | 19.1 | 27.9% [23.1, 33.3] | 63.6% [58.0, 68.9] | 0.9 |
| 3 | `da3_504x378_npu__serveryolo_gtbbox__nodist` | DA3 Metric Large | server-yolo+gt-bbox | N | 294/294 | **8.68** ± 7.06 | 11.19 | -4.33 | 19.3 | 27.6% [22.8, 32.9] | 60.5% [54.9, 66.0] | 0.9 |

## 2. By depth model

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| DA3 Metric Large | 3 | 4.36 | `da3_504x378_npu__serveryolo_gtbbox__refdist` |

## 3. By mask source

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| server-yolo+gt-bbox | 2 | 4.36 | `da3_504x378_npu__serveryolo_gtbbox__refdist` |
| server-yolo+phone-bbox | 1 | 8.53 | `da3_504x378_npu__serveryolo_phonebbox__nodist` |

## 4. By reference distance

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| nodist | 2 | 8.53 | `da3_504x378_npu__serveryolo_phonebbox__nodist` |
| refdist | 1 | 4.36 | `da3_504x378_npu__serveryolo_gtbbox__refdist` |

## 6. Headline numbers (paper §伍)

Best configuration: **`da3_504x378_npu__serveryolo_gtbbox__refdist`** (model=DA3 Metric Large, mask=server-yolo+gt-bbox, refdist=Y).

- Sample size: **n = 294** of 294 (failure rate 0.0%)
- MAE = **4.36 ± 3.85 cm**
- RMSE = **5.82 cm**
- Bias = **+3.68 cm** (over-estimating on average)
- 60.9% of samples within ±10% of true DBH (95% CI [55.2%, 66.3%])
- 92.5% of samples within ±20% of true DBH (95% CI [88.9%, 95.0%])

## 7. Deployment recommendation (for start.ps1)

Selection rule: require ≥98% successful samples, prefer lower MAE, and if MAE differs by ≤0.20 cm choose the lower-latency config. Old `yolomask`/`yolomaskm` rows and phone-YOLO bbox rows are optimistic if Xiang is in the YOLO training set. Rows with `refdist=Y` are benchmark-only external-distance upper bounds; production defaults must come from `refdist=N`.

| role | tag | MAE cm | RMSE cm | latency s | DA3 IR | DA3 device | note |
|---|---|---:|---:|---:|---|---|---|
| upper-bound-refdist | (no eligible config) | | | | | | GT mask + CapDis external override; benchmark-only, not production DBH semantics |
| upper-bound-nodist | (no eligible config) | | | | | | GT mask with depth-model distance; clean upper bound for current production distance semantics |
| server-yolo-refdist | `da3_504x378_npu__serveryolo_gtbbox__refdist` | 4.36 | 5.82 | 0.89 | 504x378 | NPU | server YOLO + CapDis external override; diagnostic only |
| server-yolo-gtbbox-nodist | `da3_504x378_npu__serveryolo_gtbbox__nodist` | 8.68 | 11.19 | 0.89 | 504x378 | NPU | clean bbox upper bound for detection-only phone path; not deployable by itself |
| phone-flow-nodist | `da3_504x378_npu__serveryolo_phonebbox__nodist` | 8.53 | 11.02 | 0.94 | 504x378 | NPU | actual phone YOLO bbox + server YOLO mask simulator; optimistic if YOLO saw Xiang during training |
| deployable | `da3_504x378_npu__serveryolo_phonebbox__nodist` | 8.53 | 11.02 | 0.94 | 504x378 | NPU | runtime candidate for default start.ps1 after matrix review; accuracy must carry the phone-YOLO leakage caveat |

Recommended default after confirmation:
- `start.ps1` `Da3Ir` → `504x378`
- `start.ps1` `Da3Device` → `NPU`
- Keep current defaults if the candidate is not clearly better than 504x378 GPU/AUTO.
