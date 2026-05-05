# Benchmark Statistical Analysis

- Source dir: `benchmark_matrix_full`
- Configs analysed: **48**
- scipy available: **False**

## 1. Per-config summary (sorted by MAE asc)

| # | tag | model | mask | refdist | n_ok/n | MAE±std cm | RMSE cm | bias cm | MAPE % | ≤10% (95% CI) | ≤20% (95% CI) | latency s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `da3_metric_large__gtmask__refdist` | DA3 Metric Large | gt | Y | 294/294 | **4.20** ± 4.08 | 5.85 | +3.14 | 9.3 | 62.2% [56.6, 67.6] | 90.1% [86.2, 93.0] | 25.0 |
| 2 | `unidepth_v2_l__gtmask__refdist` | UniDepth V2 ViT-L | gt | Y | 294/294 | **4.40** ± 5.89 | 7.35 | +3.49 | 9.2 | 65.6% [60.0, 70.8] | 92.5% [88.9, 95.0] | 14.2 |
| 3 | `da_v2_base__gtmask__refdist` | DA V2 Metric Outdoor Base | gt | Y | 294/294 | **4.46** ± 6.99 | 8.29 | +2.58 | 9.1 | 68.0% [62.5, 73.1] | 94.6% [91.3, 96.6] | 0.5 |
| 4 | `da_v2_large__gtmask__refdist` | DA V2 Metric Outdoor Large | gt | Y | 294/294 | **4.60** ± 7.78 | 9.04 | +2.29 | 9.4 | 68.0% [62.5, 73.1] | 94.2% [90.9, 96.4] | 1.1 |
| 5 | `depth_pro__gtmask__refdist` | Apple Depth Pro | gt | Y | 294/294 | **5.57** ± 9.73 | 11.21 | +2.53 | 11.0 | 61.2% [55.5, 66.6] | 89.5% [85.4, 92.5] | 11.2 |
| 6 | `da_v2_small__gtmask__refdist` | DA V2 Metric Outdoor Small | gt | Y | 294/294 | **5.69** ± 11.70 | 13.01 | +2.89 | 11.9 | 65.0% [59.4, 70.2] | 91.8% [88.1, 94.5] | 0.4 |
| 7 | `da3_metric_large__gtmask__nodist` | DA3 Metric Large | gt | N | 294/294 | **8.91** ± 7.30 | 11.52 | -4.89 | 19.6 | 27.2% [22.4, 32.6] | 58.8% [53.1, 64.3] | 26.0 |
| 8 | `depth_pro__gtmask__nodist` | Apple Depth Pro | gt | N | 294/294 | **11.91** ± 10.86 | 16.12 | -0.80 | 29.9 | 23.5% [19.0, 28.6] | 46.3% [40.6, 52.0] | 11.9 |
| 9 | `da3_metric_large__yolomaskm__nodist` | DA3 Metric Large | yolo-m | N | 294/294 | **12.20** ± 10.51 | 16.10 | +10.43 | 30.6 | 24.5% [19.9, 29.7] | 45.6% [40.0, 51.3] | 26.1 |
| 10 | `da3_metric_large__yolomask__nodist` | DA3 Metric Large | yolo-n | N | 294/294 | **12.69** ± 10.43 | 16.43 | +10.74 | 31.7 | 23.1% [18.7, 28.3] | 42.2% [36.7, 47.9] | 25.7 |
| 11 | `depth_pro__yolomaskm__nodist` | Apple Depth Pro | yolo-m | N | 294/294 | **17.06** ± 11.44 | 20.54 | +15.66 | 49.5 | 15.3% [11.6, 19.9] | 32.3% [27.2, 37.9] | 10.8 |
| 12 | `depth_pro__yolomask__nodist` | Apple Depth Pro | yolo-n | N | 294/294 | **17.51** ± 11.22 | 20.79 | +16.08 | 50.8 | 16.7% [12.8, 21.4] | 27.6% [22.8, 32.9] | 12.1 |
| 13 | `unidepth_v2_l__gtmask__nodist` | UniDepth V2 ViT-L | gt | N | 294/294 | **19.91** ± 15.54 | 25.26 | +19.14 | 59.1 | 18.7% [14.7, 23.6] | 32.7% [27.5, 38.2] | 14.2 |
| 14 | `depth_pro__nomask__refdist` | Apple Depth Pro | none | Y | 294/294 | **21.22** ± 19.33 | 28.71 | -18.46 | 46.4 | 9.9% [7.0, 13.8] | 18.0% [14.1, 22.8] | 12.4 |
| 15 | `unidepth_v2_l__nomask__nodist` | UniDepth V2 ViT-L | none | N | 294/294 | **21.34** ± 20.01 | 29.25 | -14.73 | 44.8 | 10.9% [7.8, 15.0] | 22.4% [18.1, 27.6] | 13.9 |

## 2. By depth model

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| Apple Depth Pro | 8 | 5.57 | `depth_pro__gtmask__refdist` |
| DA V2 Metric Outdoor Base | 8 | 4.46 | `da_v2_base__gtmask__refdist` |
| DA V2 Metric Outdoor Large | 8 | 4.60 | `da_v2_large__gtmask__refdist` |
| DA V2 Metric Outdoor Small | 8 | 5.69 | `da_v2_small__gtmask__refdist` |
| DA3 Metric Large | 8 | 4.20 | `da3_metric_large__gtmask__refdist` |
| UniDepth V2 ViT-L | 8 | 4.40 | `unidepth_v2_l__gtmask__refdist` |

## 3. By mask source

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| gt | 12 | 4.20 | `da3_metric_large__gtmask__refdist` |
| none | 12 | 21.22 | `depth_pro__nomask__refdist` |
| yolo-m | 12 | 12.20 | `da3_metric_large__yolomaskm__nodist` |
| yolo-n | 12 | 12.69 | `da3_metric_large__yolomask__nodist` |

## 4. By reference distance

| group | n_configs | best MAE cm | best tag |
|---|---|---|---|
| nodist | 24 | 8.91 | `da3_metric_large__gtmask__nodist` |
| refdist | 24 | 4.20 | `da3_metric_large__gtmask__refdist` |

## 5. Paired Wilcoxon signed-rank tests

Null hypothesis: the two configs have the same per-sample absolute error distribution.

| A | B | n_paired | median |err_A| | median |err_B| | Δ MAE (A−B) | W | p | sig (p<0.05) |
|---|---|---|---|---|---|---|---|---|
| `da3_metric_large__gtmask__nodist` | `depth_pro__gtmask__nodist` | 294 | 6.79 | 9.28 | -3.00 | 13601.0 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__nodist` | `unidepth_v2_l__gtmask__nodist` | 294 | 6.79 | 16.12 | -11.00 | 9252.5 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__nodist` | `da_v2_base__gtmask__nodist` | 294 | 6.79 | 184.15 | -187.12 | 1.0 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__nodist` | `da_v2_small__gtmask__nodist` | 294 | 6.79 | 188.96 | -194.36 | 8.0 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__nodist` | `da_v2_large__gtmask__nodist` | 294 | 6.79 | 193.09 | -200.19 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__refdist` | `unidepth_v2_l__gtmask__refdist` | 294 | 3.11 | 3.02 | -0.21 | 19799.5 | 0.0813 | — |
| `da3_metric_large__gtmask__refdist` | `da_v2_base__gtmask__refdist` | 294 | 3.11 | 2.92 | -0.27 | 21449.5 | 0.0609 | — |
| `da3_metric_large__gtmask__refdist` | `da_v2_large__gtmask__refdist` | 294 | 3.11 | 2.96 | -0.41 | 21992.0 | 0.0301 | ✓ |
| `da3_metric_large__gtmask__refdist` | `depth_pro__gtmask__refdist` | 294 | 3.11 | 2.97 | -1.38 | 20251.5 | 0.7694 | — |
| `da3_metric_large__gtmask__refdist` | `da_v2_small__gtmask__refdist` | 294 | 3.11 | 3.04 | -1.50 | 19865.0 | 0.8857 | — |
| `unidepth_v2_l__nomask__nodist` | `depth_pro__nomask__nodist` | 294 | 16.41 | 18.86 | -2.10 | 18403.0 | 0.0246 | ✓ |
| `unidepth_v2_l__nomask__nodist` | `da3_metric_large__nomask__nodist` | 294 | 16.41 | 23.84 | -5.71 | 8716.0 | 0.0000 | ✓ |
| `unidepth_v2_l__nomask__nodist` | `da_v2_small__nomask__nodist` | 294 | 16.41 | 49.45 | -47.24 | 6842.5 | 0.0000 | ✓ |
| `unidepth_v2_l__nomask__nodist` | `da_v2_base__nomask__nodist` | 294 | 16.41 | 58.24 | -52.87 | 4834.0 | 0.0000 | ✓ |
| `unidepth_v2_l__nomask__nodist` | `da_v2_large__nomask__nodist` | 294 | 16.41 | 63.25 | -56.09 | 4102.0 | 0.0000 | ✓ |
| `depth_pro__nomask__refdist` | `da3_metric_large__nomask__refdist` | 294 | 17.50 | 20.48 | -2.16 | 16798.5 | 0.0011 | ✓ |
| `depth_pro__nomask__refdist` | `unidepth_v2_l__nomask__refdist` | 294 | 17.50 | 20.42 | -2.29 | 15962.5 | 0.0001 | ✓ |
| `depth_pro__nomask__refdist` | `da_v2_base__nomask__refdist` | 294 | 17.50 | 21.05 | -2.35 | 16664.5 | 0.0006 | ✓ |
| `depth_pro__nomask__refdist` | `da_v2_large__nomask__refdist` | 294 | 17.50 | 19.87 | -2.80 | 15720.5 | 0.0000 | ✓ |
| `depth_pro__nomask__refdist` | `da_v2_small__nomask__refdist` | 294 | 17.50 | 22.98 | -4.53 | 12409.5 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__nodist` | `depth_pro__yolomask__nodist` | 294 | 10.67 | 16.46 | -4.81 | 9963.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__nodist` | `unidepth_v2_l__yolomask__nodist` | 294 | 10.67 | 39.49 | -30.04 | 1.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__nodist` | `da_v2_base__yolomask__nodist` | 294 | 10.67 | 277.68 | -273.02 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__nodist` | `da_v2_small__yolomask__nodist` | 294 | 10.67 | 289.78 | -285.30 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__nodist` | `da_v2_large__yolomask__nodist` | 294 | 10.67 | 301.20 | -293.25 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomask__refdist` | `depth_pro__yolomask__refdist` | 294 | 14.38 | 14.39 | -0.00 | 5337.0 | 0.5414 | — |
| `da3_metric_large__yolomask__refdist` | `da_v2_large__yolomask__refdist` | 294 | 14.38 | 14.39 | -0.00 | 4969.0 | 0.5231 | — |
| `da3_metric_large__yolomask__refdist` | `da_v2_small__yolomask__refdist` | 294 | 14.38 | 14.39 | -0.00 | 4748.5 | 0.4208 | — |
| `da3_metric_large__yolomask__refdist` | `da_v2_base__yolomask__refdist` | 294 | 14.38 | 14.39 | -0.00 | 4673.5 | 0.2218 | — |
| `da3_metric_large__yolomask__refdist` | `unidepth_v2_l__yolomask__refdist` | 294 | 14.38 | 14.39 | -0.00 | 4333.0 | 0.1300 | — |
| `da3_metric_large__yolomaskm__nodist` | `depth_pro__yolomaskm__nodist` | 294 | 9.37 | 16.19 | -4.86 | 9795.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomaskm__nodist` | `unidepth_v2_l__yolomaskm__nodist` | 294 | 9.37 | 38.86 | -29.75 | 2.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomaskm__nodist` | `da_v2_base__yolomaskm__nodist` | 294 | 9.37 | 267.60 | -269.86 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomaskm__nodist` | `da_v2_small__yolomaskm__nodist` | 294 | 9.37 | 277.38 | -281.97 | 0.0 | 0.0000 | ✓ |
| `da3_metric_large__yolomaskm__nodist` | `da_v2_large__yolomaskm__nodist` | 294 | 9.37 | 288.20 | -290.38 | 0.0 | 0.0000 | ✓ |
| `da_v2_large__yolomaskm__refdist` | `da_v2_small__yolomaskm__refdist` | 294 | 14.05 | 14.05 | -0.00 | 387.0 | 0.9666 | — |
| `da_v2_large__yolomaskm__refdist` | `depth_pro__yolomaskm__refdist` | 294 | 14.05 | 14.05 | -0.00 | 3705.5 | 0.9064 | — |
| `da_v2_large__yolomaskm__refdist` | `da3_metric_large__yolomaskm__refdist` | 294 | 14.05 | 14.05 | -0.00 | 3897.5 | 0.9553 | — |
| `da_v2_large__yolomaskm__refdist` | `da_v2_base__yolomaskm__refdist` | 294 | 14.05 | 14.05 | -0.00 | 234.5 | 0.4111 | — |
| `da_v2_large__yolomaskm__refdist` | `unidepth_v2_l__yolomaskm__refdist` | 294 | 14.05 | 14.05 | -0.00 | 2041.0 | 0.8369 | — |
| `da3_metric_large__gtmask__nodist` | `da3_metric_large__yolomask__nodist` | 294 | 6.79 | 10.67 | -3.78 | 13129.5 | 0.0000 | ✓ |
| `da3_metric_large__gtmask__refdist` | `da3_metric_large__yolomask__refdist` | 294 | 3.11 | 14.38 | -18.91 | 42.0 | 0.0000 | ✓ |
| `da_v2_base__gtmask__nodist` | `da_v2_base__yolomask__nodist` | 294 | 184.15 | 277.68 | -89.69 | 0.0 | 0.0000 | ✓ |
| `da_v2_base__gtmask__refdist` | `da_v2_base__yolomask__refdist` | 294 | 2.92 | 14.39 | -18.64 | 406.0 | 0.0000 | ✓ |
| `da_v2_large__gtmask__nodist` | `da_v2_large__yolomask__nodist` | 294 | 193.09 | 301.20 | -96.84 | 0.0 | 0.0000 | ✓ |
| `da_v2_large__gtmask__refdist` | `da_v2_large__yolomask__refdist` | 294 | 2.96 | 14.39 | -18.50 | 701.0 | 0.0000 | ✓ |
| `da_v2_small__gtmask__nodist` | `da_v2_small__yolomask__nodist` | 294 | 188.96 | 289.78 | -94.73 | 287.0 | 0.0000 | ✓ |
| `da_v2_small__gtmask__refdist` | `da_v2_small__yolomask__refdist` | 294 | 3.04 | 14.39 | -17.41 | 1813.0 | 0.0000 | ✓ |
| `depth_pro__gtmask__nodist` | `depth_pro__yolomask__nodist` | 294 | 9.28 | 16.46 | -5.60 | 10524.0 | 0.0000 | ✓ |
| `depth_pro__gtmask__refdist` | `depth_pro__yolomask__refdist` | 294 | 2.97 | 14.39 | -17.53 | 643.0 | 0.0000 | ✓ |
| `unidepth_v2_l__gtmask__nodist` | `unidepth_v2_l__yolomask__nodist` | 294 | 16.12 | 39.49 | -22.83 | 0.0 | 0.0000 | ✓ |
| `unidepth_v2_l__gtmask__refdist` | `unidepth_v2_l__yolomask__refdist` | 294 | 3.02 | 14.39 | -18.70 | 33.0 | 0.0000 | ✓ |

## 6. Headline numbers (paper §伍)

Best configuration: **`da3_metric_large__gtmask__refdist`** (model=DA3 Metric Large, mask=gt, refdist=Y).

- Sample size: **n = 294** of 294 (failure rate 0.0%)
- MAE = **4.20 ± 4.08 cm**
- RMSE = **5.85 cm**
- Bias = **+3.14 cm** (over-estimating on average)
- 62.2% of samples within ±10% of true DBH (95% CI [56.6%, 67.6%])
- 90.1% of samples within ±20% of true DBH (95% CI [86.2%, 93.0%])
