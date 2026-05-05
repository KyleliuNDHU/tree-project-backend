# Benchmark Statistical Analysis

- Source dir: `C:\projects\tree_project\project_code\backend\ml_service\benchmark_matrix_eval_20260505`
- Configs analysed: **20**
- scipy available: **True**

## 1. Per-config summary (sorted by MAE asc)

| # | tag | model | mask | refdist | n_ok/n | MAE±std cm | RMSE cm | bias cm | MAPE % | ≤10% (95% CI) | ≤20% (95% CI) | latency s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `da3_504x378_npu__gtmask__refdist` | DA3 Metric Large | gt | Y | 294/294 | **4.17** ± 4.07 | 5.83 | +3.13 | 9.1 | 62.9% [57.3, 68.2] | 90.8% [87.0, 93.6] | 0.9 |
| 2 | `da3_504x378_gpu__gtmask__refdist` | DA3 Metric Large | gt | Y | 294/294 | **4.23** ± 4.05 | 5.86 | +3.16 | 9.3 | 61.2% [55.5, 66.6] | 91.5% [87.7, 94.2] | 1.1 |
| 3 | `da3_602x448_gpu__gtmask__refdist` | DA3 Metric Large | gt | Y | 294/294 | **4.38** ± 5.15 | 6.76 | +3.32 | 9.4 | 63.3% [57.6, 68.6] | 91.8% [88.1, 94.5] | 1.3 |
| 4 | `da3_602x448_npu__gtmask__refdist` | DA3 Metric Large | gt | Y | 294/294 | **4.39** ± 5.09 | 6.72 | +3.36 | 9.5 | 61.6% [55.9, 66.9] | 91.8% [88.1, 94.5] | 1.1 |
| 5 | `da3_504x378_gpu__gtmask__nodist` | DA3 Metric Large | gt | N | 294/294 | **8.90** ± 7.32 | 11.52 | -4.92 | 19.6 | 27.2% [22.4, 32.6] | 58.5% [52.8, 64.0] | 1.1 |
| 6 | `da3_504x378_npu__gtmask__nodist` | DA3 Metric Large | gt | N | 294/294 | **8.91** ± 7.30 | 11.52 | -4.86 | 19.6 | 27.2% [22.4, 32.6] | 58.2% [52.5, 63.7] | 0.9 |
| 7 | `da3_602x448_gpu__serveryolo_gtbbox__refdist` | DA3 Metric Large | server-yolo+gt-bbox | Y | 294/294 | **10.05** ± 4.68 | 11.08 | -10.05 | 22.8 | 1.4% [0.5, 3.4] | 32.7% [27.5, 38.2] | 1.2 |
| 8 | `da3_602x448_npu__serveryolo_gtbbox__refdist` | DA3 Metric Large | server-yolo+gt-bbox | Y | 294/294 | **10.06** ± 4.69 | 11.09 | -10.06 | 22.9 | 1.7% [0.7, 3.9] | 32.3% [27.2, 37.9] | 1.1 |
| 9 | `da3_504x378_npu__serveryolo_gtbbox__refdist` | DA3 Metric Large | server-yolo+gt-bbox | Y | 294/294 | **10.18** ± 4.63 | 11.18 | -10.18 | 23.1 | 1.4% [0.5, 3.4] | 30.6% [25.6, 36.1] | 0.9 |
| 10 | `da3_504x378_gpu__serveryolo_gtbbox__refdist` | DA3 Metric Large | server-yolo+gt-bbox | Y | 294/294 | **10.18** ± 4.62 | 11.18 | -10.18 | 23.2 | 1.4% [0.5, 3.4] | 30.3% [25.3, 35.8] | 1.0 |
| 11 | `da3_602x448_npu__gtmask__nodist` | DA3 Metric Large | gt | N | 294/294 | **12.65** ± 9.74 | 15.97 | -11.36 | 26.0 | 13.9% [10.4, 18.4] | 31.3% [26.3, 36.8] | 1.1 |
| 12 | `da3_602x448_gpu__gtmask__nodist` | DA3 Metric Large | gt | N | 294/294 | **12.69** ± 9.79 | 16.02 | -11.46 | 26.0 | 12.9% [9.6, 17.2] | 32.0% [26.9, 37.5] | 1.3 |
| 13 | `da3_504x378_npu__serveryolo_phonebbox__nodist` | DA3 Metric Large | server-yolo+phone-bbox | N | 294/294 | **16.46** ± 11.38 | 20.01 | -16.24 | 33.6 | 8.2% [5.5, 11.9] | 16.7% [12.8, 21.4] | 0.9 |
| 14 | `da3_504x378_gpu__serveryolo_phonebbox__nodist` | DA3 Metric Large | server-yolo+phone-bbox | N | 294/294 | **16.49** ± 11.38 | 20.04 | -16.28 | 33.7 | 7.8% [5.3, 11.5] | 16.3% [12.5, 21.0] | 1.0 |
| 15 | `da3_504x378_npu__serveryolo_gtbbox__nodist` | DA3 Metric Large | server-yolo+gt-bbox | N | 294/294 | **16.59** ± 11.48 | 20.18 | -16.37 | 33.8 | 7.8% [5.3, 11.5] | 16.7% [12.8, 21.4] | 0.9 |
| 16 | `da3_504x378_gpu__serveryolo_gtbbox__nodist` | DA3 Metric Large | server-yolo+gt-bbox | N | 294/294 | **16.63** ± 11.49 | 20.21 | -16.42 | 33.9 | 7.8% [5.3, 11.5] | 16.3% [12.5, 21.0] | 1.0 |
| 17 | `da3_602x448_npu__serveryolo_phonebbox__nodist` | DA3 Metric Large | server-yolo+phone-bbox | N | 294/294 | **21.00** ± 12.57 | 24.48 | -20.97 | 43.7 | 3.1% [1.6, 5.7] | 7.1% [4.7, 10.7] | 1.2 |
| 18 | `da3_602x448_gpu__serveryolo_phonebbox__nodist` | DA3 Metric Large | server-yolo+phone-bbox | N | 294/294 | **21.07** ± 12.57 | 24.54 | -21.04 | 43.9 | 2.7% [1.4, 5.3] | 6.8% [4.4, 10.3] | 1.2 |
| 19 | `da3_602x448_npu__serveryolo_gtbbox__nodist` | DA3 Metric Large | server-yolo+gt-bbox | N | 294/294 | **21.13** ± 12.67 | 24.63 | -21.09 | 44.0 | 3.1% [1.6, 5.7] | 6.5% [4.2, 9.9] | 1.1 |
| 20 | `da3_602x448_gpu__serveryolo_gtbbox__nodist` | DA3 Metric Large | server-yolo+gt-bbox | N | 294/294 | **21.19** ± 12.67 | 24.69 | -21.16 | 44.1 | 2.7% [1.4, 5.3] | 6.5% [4.2, 9.9] | 1.2 |

## 2. By depth model

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| DA3 Metric Large | 20 | 4.17 | `da3_504x378_npu__gtmask__refdist` |

## 3. By mask source

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| gt | 8 | 4.17 | `da3_504x378_npu__gtmask__refdist` |
| server-yolo+gt-bbox | 8 | 10.05 | `da3_602x448_gpu__serveryolo_gtbbox__refdist` |
| server-yolo+phone-bbox | 4 | 16.46 | `da3_504x378_npu__serveryolo_phonebbox__nodist` |

## 4. By reference distance

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| nodist | 12 | 8.90 | `da3_504x378_gpu__gtmask__nodist` |
| refdist | 8 | 4.17 | `da3_504x378_npu__gtmask__refdist` |

## 5. Paired Wilcoxon signed-rank tests

Null hypothesis: the two configs have the same per-sample absolute error distribution.

| A | B | n_paired | median |err_A| | median |err_B| | Δ MAE (A−B) | W | p | sig (p<0.05) |
|---|---|---|---|---|---|---|---|---|
| `da3_504x378_gpu__gtmask__nodist` | `da3_504x378_npu__gtmask__nodist` | 294 | 6.85 | 6.84 | -0.01 | 18120.0 | 0.1814 | — |
| `da3_504x378_gpu__gtmask__nodist` | `da3_602x448_npu__gtmask__nodist` | 294 | 6.85 | 10.49 | -3.76 | 7655.5 | 0.0000 | ✓ |
| `da3_504x378_gpu__gtmask__nodist` | `da3_602x448_gpu__gtmask__nodist` | 294 | 6.85 | 10.39 | -3.79 | 7753.5 | 0.0000 | ✓ |
| `da3_504x378_npu__gtmask__refdist` | `da3_504x378_gpu__gtmask__refdist` | 294 | 3.07 | 3.19 | -0.06 | 13736.5 | 0.4356 | — |
| `da3_504x378_npu__gtmask__refdist` | `da3_602x448_gpu__gtmask__refdist` | 294 | 3.07 | 3.05 | -0.21 | 18099.5 | 0.9638 | — |
| `da3_504x378_npu__gtmask__refdist` | `da3_602x448_npu__gtmask__refdist` | 294 | 3.07 | 3.13 | -0.22 | 17160.0 | 0.7110 | — |
| `da3_504x378_npu__serveryolo_gtbbox__nodist` | `da3_504x378_gpu__serveryolo_gtbbox__nodist` | 294 | 14.22 | 14.26 | -0.04 | 10214.5 | 0.0000 | ✓ |
| `da3_504x378_npu__serveryolo_gtbbox__nodist` | `da3_602x448_npu__serveryolo_gtbbox__nodist` | 294 | 14.22 | 18.59 | -4.54 | 443.5 | 0.0000 | ✓ |
| `da3_504x378_npu__serveryolo_gtbbox__nodist` | `da3_602x448_gpu__serveryolo_gtbbox__nodist` | 294 | 14.22 | 18.54 | -4.60 | 456.5 | 0.0000 | ✓ |
| `da3_602x448_gpu__serveryolo_gtbbox__refdist` | `da3_602x448_npu__serveryolo_gtbbox__refdist` | 294 | 9.11 | 9.17 | -0.01 | 13175.5 | 0.2760 | — |
| `da3_602x448_gpu__serveryolo_gtbbox__refdist` | `da3_504x378_npu__serveryolo_gtbbox__refdist` | 294 | 9.11 | 9.45 | -0.13 | 16346.0 | 0.4729 | — |
| `da3_602x448_gpu__serveryolo_gtbbox__refdist` | `da3_504x378_gpu__serveryolo_gtbbox__refdist` | 294 | 9.11 | 9.32 | -0.14 | 14463.5 | 0.1398 | — |
| `da3_504x378_npu__serveryolo_phonebbox__nodist` | `da3_504x378_gpu__serveryolo_phonebbox__nodist` | 294 | 14.23 | 14.32 | -0.04 | 11429.0 | 0.0000 | ✓ |
| `da3_504x378_npu__serveryolo_phonebbox__nodist` | `da3_602x448_npu__serveryolo_phonebbox__nodist` | 294 | 14.23 | 18.65 | -4.55 | 430.5 | 0.0000 | ✓ |
| `da3_504x378_npu__serveryolo_phonebbox__nodist` | `da3_602x448_gpu__serveryolo_phonebbox__nodist` | 294 | 14.23 | 18.55 | -4.61 | 442.5 | 0.0000 | ✓ |

## 6. Headline numbers (paper §伍)

Best configuration: **`da3_504x378_npu__gtmask__refdist`** (model=DA3 Metric Large, mask=gt, refdist=Y).

- Sample size: **n = 294** of 294 (failure rate 0.0%)
- MAE = **4.17 ± 4.07 cm**
- RMSE = **5.83 cm**
- Bias = **+3.13 cm** (over-estimating on average)
- 62.9% of samples within ±10% of true DBH (95% CI [57.3%, 68.2%])
- 90.8% of samples within ±20% of true DBH (95% CI [87.0%, 93.6%])

## 7. Deployment recommendation (for start.ps1)

Selection rule: require ≥98% successful samples, prefer lower MAE, and if MAE differs by ≤0.20 cm choose the lower-latency config. Old `yolomask`/`yolomaskm` rows and phone-YOLO bbox rows are optimistic if Xiang is in the YOLO training set. Rows with `refdist=Y` are benchmark-only external-distance upper bounds; production defaults must come from `refdist=N`.

| role | tag | MAE cm | RMSE cm | latency s | DA3 IR | DA3 device | note |
|---|---|---:|---:|---:|---|---|---|
| upper-bound-refdist | `da3_504x378_npu__gtmask__refdist` | 4.17 | 5.83 | 0.95 | 504x378 | NPU | GT mask + CapDis external override; benchmark-only, not production DBH semantics |
| upper-bound-nodist | `da3_504x378_npu__gtmask__nodist` | 8.91 | 11.52 | 0.94 | 504x378 | NPU | GT mask with depth-model distance; clean upper bound for current production distance semantics |
| server-yolo-refdist | `da3_504x378_npu__serveryolo_gtbbox__refdist` | 10.18 | 11.18 | 0.88 | 504x378 | NPU | server YOLO + CapDis external override; diagnostic only |
| server-yolo-gtbbox-nodist | `da3_504x378_npu__serveryolo_gtbbox__nodist` | 16.59 | 20.18 | 0.88 | 504x378 | NPU | clean bbox upper bound for detection-only phone path; not deployable by itself |
| phone-flow-nodist | `da3_504x378_npu__serveryolo_phonebbox__nodist` | 16.46 | 20.01 | 0.95 | 504x378 | NPU | actual phone YOLO bbox + server YOLO mask simulator; optimistic if YOLO saw Xiang during training |
| deployable | `da3_504x378_npu__serveryolo_phonebbox__nodist` | 16.46 | 20.01 | 0.95 | 504x378 | NPU | runtime candidate for default start.ps1 after matrix review; accuracy must carry the phone-YOLO leakage caveat |

Recommended default after confirmation:
- `start.ps1` `Da3Ir` → `504x378`
- `start.ps1` `Da3Device` → `NPU`
- Keep current defaults if the candidate is not clearly better than 504x378 GPU/AUTO.
