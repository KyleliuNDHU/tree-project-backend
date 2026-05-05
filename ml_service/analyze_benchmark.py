"""
analyze_benchmark.py — Statistical analysis of benchmark results
=================================================================

Reads benchmark_matrix_full/ (or any compatible directory of
benchmark_xiang.py outputs) and produces:

  • Per-config summary with mean ± std MAE, RMSE, bias, 95% Wilson CI
    for within±10% / ±20%
  • Cross-config paired Wilcoxon signed-rank tests (same Xiang sample
    set across two configs → significance of MAE difference)
  • Markdown report ready to paste into the paper §伍 結果章節

Usage
-----
  python analyze_benchmark.py                                    # default dir
  python analyze_benchmark.py --dir benchmark_matrix_full
  python analyze_benchmark.py --dir benchmark_matrix_full --out report.md
  python analyze_benchmark.py --pair da3_metric_large__gtmask__refdist da_v2_base__gtmask__refdist
  python analyze_benchmark.py --top 10                           # show top-10 by MAE

This script reads ONLY the existing CSV / JSON outputs — it does not
re-run any inference. Stats are computed using scipy when available
(falls back to pure-numpy implementations).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from statistics import mean, median, stdev
from typing import Dict, List, Optional, Tuple

import numpy as np

try:
    from scipy import stats as _sp_stats
    HAVE_SCIPY = True
except Exception:
    HAVE_SCIPY = False


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class ConfigStats:
    tag: str
    depth_model: str
    use_gt_mask: bool
    use_yolo_mask: bool
    use_yolo_mask_m: bool
    use_server_yolo_mask: bool
    use_gt_bbox: bool
    use_yolo_bbox: bool
    use_ref_distance: bool
    upload_long_edge: int
    jpeg_quality: int

    n_total: int
    n_ok: int
    n_fail: int
    mae_cm: float
    mae_std_cm: float
    medae_cm: float
    rmse_cm: float
    bias_cm: float
    mape_pct: float

    within_10pct: float
    within_10pct_ci_lo: float
    within_10pct_ci_hi: float
    within_20pct: float
    within_20pct_ci_lo: float
    within_20pct_ci_hi: float

    avg_latency_s: float

    # not exported, used for paired tests
    _per_sample_abs_err: List[float] = None
    _per_sample_names: List[str] = None
    _per_sample_pred: List[float] = None
    _per_sample_gt: List[float] = None


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------
def wilson_ci(k: int, n: int, z: float = 1.96) -> Tuple[float, float]:
    """Wilson score interval for a binomial proportion (95% by default).

    More accurate than the normal approximation, especially when p is near
    0 or 1, or when n is small. Returns (lo, hi) as percentages 0..100.
    """
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    lo = (centre - margin) / denom
    hi = (centre + margin) / denom
    return (max(0.0, lo) * 100.0, min(1.0, hi) * 100.0)


def paired_wilcoxon(
    a: List[float], b: List[float]
) -> Tuple[float, float, str]:
    """Paired Wilcoxon signed-rank test on two equal-length sequences.

    Returns (statistic, p_value, method_name). Falls back to a manual
    implementation when scipy is unavailable.
    """
    if len(a) != len(b):
        raise ValueError(f"length mismatch a={len(a)} b={len(b)}")
    if HAVE_SCIPY:
        try:
            res = _sp_stats.wilcoxon(a, b, zero_method="wilcox",
                                     alternative="two-sided")
            return float(res.statistic), float(res.pvalue), "scipy.wilcoxon"
        except ValueError:
            # all-zero-diff edge case
            return 0.0, 1.0, "scipy.wilcoxon (all zero diff)"
    # Fallback: simplified rank-sum (large-sample normal approximation)
    diffs = [x - y for x, y in zip(a, b) if (x - y) != 0]
    if not diffs:
        return 0.0, 1.0, "manual (all zero diff)"
    abs_diffs = [abs(d) for d in diffs]
    order = sorted(range(len(diffs)), key=lambda i: abs_diffs[i])
    ranks = [0] * len(diffs)
    i = 0
    while i < len(diffs):
        j = i
        while j + 1 < len(diffs) and abs_diffs[order[j + 1]] == abs_diffs[order[i]]:
            j += 1
        avg_rank = (i + j) / 2 + 1  # 1-based
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    w_pos = sum(r for r, d in zip(ranks, diffs) if d > 0)
    n = len(diffs)
    mean_w = n * (n + 1) / 4
    var_w = n * (n + 1) * (2 * n + 1) / 24
    if var_w <= 0:
        return float(w_pos), 1.0, "manual (zero variance)"
    z = (w_pos - mean_w) / math.sqrt(var_w)
    # two-sided p via normal approximation
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))
    return float(w_pos), float(p), "manual normal-approx"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def _load_per_sample(csv_path: Path) -> Tuple[List[float], List[str], List[float], List[float]]:
    abs_errs: List[float] = []
    names: List[str] = []
    preds: List[float] = []
    gts: List[float] = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("ok") != "1":
                continue
            try:
                pred = float(row["pred_dbh_cm"])
                gt = float(row["gt_dbh_cm"])
                if pred <= 0 or gt <= 0:
                    continue
            except (KeyError, ValueError):
                continue
            abs_errs.append(abs(pred - gt))
            names.append(row.get("name", ""))
            preds.append(pred)
            gts.append(gt)
    return abs_errs, names, preds, gts


def load_configs(directory: Path) -> Dict[str, ConfigStats]:
    """Load every <tag>.json + <tag>.csv pair from `directory`."""
    out: Dict[str, ConfigStats] = {}
    for json_path in sorted(directory.glob("*.json")):
        if json_path.name.startswith("_"):
            continue
        try:
            j = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            print(f"[skip] could not parse {json_path.name}")
            continue
        tag = j.get("tag") or json_path.stem
        csv_path = directory / f"{tag}.csv"
        abs_errs, names, preds, gts = ([], [], [], [])
        if csv_path.exists():
            abs_errs, names, preds, gts = _load_per_sample(csv_path)
        n_ok = j.get("n_ok") or len(abs_errs)
        n_total = j.get("n_total") or n_ok
        within10 = j.get("within_10pct", 0.0)
        within20 = j.get("within_20pct", 0.0)
        # Reconstruct counts for Wilson CI
        if abs_errs:
            rel_errs = [a / g for a, g in zip(abs_errs, gts) if g > 0]
            k10 = sum(1 for r in rel_errs if r <= 0.10)
            k20 = sum(1 for r in rel_errs if r <= 0.20)
            n = len(rel_errs)
        else:
            k10 = round(within10 / 100.0 * n_ok)
            k20 = round(within20 / 100.0 * n_ok)
            n = n_ok
        ci10 = wilson_ci(k10, n) if n else (0.0, 0.0)
        ci20 = wilson_ci(k20, n) if n else (0.0, 0.0)

        mae_std = float(np.std(abs_errs)) if abs_errs else 0.0

        out[tag] = ConfigStats(
            tag=tag,
            depth_model=j.get("depth_model", ""),
            use_gt_mask=bool(j.get("use_gt_mask", False)),
            use_yolo_mask=bool(j.get("use_yolo_mask", False)),
            use_yolo_mask_m=bool(j.get("use_yolo_mask_m", False)),
            use_server_yolo_mask=bool(j.get("use_server_yolo_mask", False)),
            use_gt_bbox=bool(j.get("use_gt_bbox", False)),
            use_yolo_bbox=bool(j.get("use_yolo_bbox", False)),
            use_ref_distance=bool(j.get("use_ref_distance", False)),
            upload_long_edge=int(j.get("upload_long_edge", 0) or 0),
            jpeg_quality=int(j.get("jpeg_quality", 0) or 0),
            n_total=n_total,
            n_ok=n_ok,
            n_fail=j.get("n_fail", n_total - n_ok),
            mae_cm=float(j.get("mae_cm", 0.0)),
            mae_std_cm=mae_std,
            medae_cm=float(j.get("medae_cm", 0.0)),
            rmse_cm=float(j.get("rmse_cm", 0.0)),
            bias_cm=float(j.get("bias_cm", 0.0)),
            mape_pct=float(j.get("mape_pct", 0.0)),
            within_10pct=float(within10),
            within_10pct_ci_lo=ci10[0],
            within_10pct_ci_hi=ci10[1],
            within_20pct=float(within20),
            within_20pct_ci_lo=ci20[0],
            within_20pct_ci_hi=ci20[1],
            avg_latency_s=float(j.get("avg_latency_s", 0.0)),
            _per_sample_abs_err=abs_errs,
            _per_sample_names=names,
            _per_sample_pred=preds,
            _per_sample_gt=gts,
        )
    return out


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def _fmt_mask(c: ConfigStats) -> str:
    if c.use_gt_mask:
        return "gt"
    if c.use_yolo_mask:
        return "yolo-n"
    if c.use_yolo_mask_m:
        return "yolo-m"
    if c.use_server_yolo_mask and c.use_yolo_bbox:
        return "server-yolo+phone-bbox"
    if c.use_server_yolo_mask and c.use_gt_bbox:
        return "server-yolo+gt-bbox"
    if c.use_server_yolo_mask:
        return "server-yolo"
    return "none"


def _is_old_yolo_leakage(c: ConfigStats) -> bool:
    """YOLO rows are Xiang-leakage-tainted when Xiang was in training."""
    return c.use_yolo_mask or c.use_yolo_mask_m or c.use_yolo_bbox


def _shape_hint(c: ConfigStats) -> str:
    tag = c.tag.lower()
    if "602x448" in tag or "602" in tag:
        return "602x448"
    if "504x378" in tag or "504" in tag:
        return "504x378"
    return "(tag/CSV needed)"


def _device_hint(c: ConfigStats) -> str:
    tag = c.tag.lower()
    if "npu" in tag:
        return "NPU"
    if "gpu" in tag:
        return "GPU"
    if "cpu" in tag:
        return "CPU"
    return "AUTO/unknown"


def _best_accuracy_then_latency(candidates: List[ConfigStats],
                                mae_eps_cm: float = 0.20) -> Optional[ConfigStats]:
    """Pick lowest MAE; if within epsilon, pick lower latency."""
    if not candidates:
        return None
    best_mae = min(c.mae_cm for c in candidates)
    near_best = [c for c in candidates if c.mae_cm <= best_mae + mae_eps_cm]
    return min(near_best, key=lambda c: (c.avg_latency_s, c.rmse_cm, c.tag))


def write_report(configs: Dict[str, ConfigStats], out_path: Path,
                 top: int = 0, pairs: List[Tuple[str, str]] = None,
                 source_dir: Path | None = None) -> None:
    pairs = pairs or []

    sorted_by_mae = sorted(configs.values(), key=lambda c: c.mae_cm)
    if top > 0:
        sorted_by_mae = sorted_by_mae[:top]

    lines: List[str] = []
    lines.append("# Benchmark Statistical Analysis\n")
    lines.append(f"- Source dir: `{source_dir or out_path.parent}`")
    lines.append(f"- Configs analysed: **{len(configs)}**")
    lines.append(f"- scipy available: **{HAVE_SCIPY}**\n")

    # ---- Main table --------------------------------------------------------
    lines.append("## 1. Per-config summary (sorted by MAE asc)\n")
    lines.append("| # | tag | model | mask | refdist | n_ok/n | "
                 "MAE±std cm | RMSE cm | bias cm | MAPE % | "
                 "≤10% (95% CI) | ≤20% (95% CI) | latency s |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i, c in enumerate(sorted_by_mae, 1):
        lines.append(
            f"| {i} | `{c.tag}` | {c.depth_model} | {_fmt_mask(c)} | "
            f"{'Y' if c.use_ref_distance else 'N'} | "
            f"{c.n_ok}/{c.n_total} | "
            f"**{c.mae_cm:.2f}** ± {c.mae_std_cm:.2f} | "
            f"{c.rmse_cm:.2f} | {c.bias_cm:+.2f} | {c.mape_pct:.1f} | "
            f"{c.within_10pct:.1f}% [{c.within_10pct_ci_lo:.1f}, "
            f"{c.within_10pct_ci_hi:.1f}] | "
            f"{c.within_20pct:.1f}% [{c.within_20pct_ci_lo:.1f}, "
            f"{c.within_20pct_ci_hi:.1f}] | "
            f"{c.avg_latency_s:.1f} |"
        )
    lines.append("")

    # ---- Group breakdowns --------------------------------------------------
    def _group_table(title: str, key):
        groups: Dict[object, List[ConfigStats]] = {}
        for c in configs.values():
            groups.setdefault(key(c), []).append(c)
        lines.append(f"## {title}\n")
        lines.append("| group | n_configs | best MAE cm | best tag |")
        lines.append("|---|---|---|---|")
        for g in sorted(groups.keys(), key=str):
            best = min(groups[g], key=lambda c: c.mae_cm)
            lines.append(f"| {g} | {len(groups[g])} | "
                         f"{best.mae_cm:.2f} | `{best.tag}` |")
        lines.append("")

    _group_table("2. By depth model", lambda c: c.depth_model or "?")
    _group_table("3. By mask source", _fmt_mask)
    _group_table("4. By reference distance",
                 lambda c: "refdist" if c.use_ref_distance else "nodist")

    # ---- Paired tests ------------------------------------------------------
    if pairs:
        lines.append("## 5. Paired Wilcoxon signed-rank tests\n")
        lines.append("Null hypothesis: the two configs have the same per-sample absolute error distribution.\n")
        lines.append("| A | B | n_paired | median |err_A| | median |err_B| | "
                     "Δ MAE (A−B) | W | p | sig (p<0.05) |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for a_tag, b_tag in pairs:
            a = configs.get(a_tag)
            b = configs.get(b_tag)
            if a is None or b is None:
                lines.append(f"| `{a_tag}` | `{b_tag}` | (config not found) | | | | | | |")
                continue
            # Align by sample name
            a_map = dict(zip(a._per_sample_names, a._per_sample_abs_err))
            b_map = dict(zip(b._per_sample_names, b._per_sample_abs_err))
            shared = sorted(set(a_map) & set(b_map))
            if not shared:
                lines.append(f"| `{a_tag}` | `{b_tag}` | 0 | | | | | | (no shared samples) |")
                continue
            arr_a = [a_map[k] for k in shared]
            arr_b = [b_map[k] for k in shared]
            w, p, _method = paired_wilcoxon(arr_a, arr_b)
            sig = "✓" if p < 0.05 else "—"
            lines.append(
                f"| `{a_tag}` | `{b_tag}` | {len(shared)} | "
                f"{median(arr_a):.2f} | {median(arr_b):.2f} | "
                f"{(mean(arr_a) - mean(arr_b)):+.2f} | "
                f"{w:.1f} | {p:.4f} | {sig} |"
            )
        lines.append("")

    # ---- Recommendation ---------------------------------------------------
    if configs:
        best = sorted_by_mae[0]
        lines.append("## 6. Headline numbers (paper §伍)\n")
        lines.append(f"Best configuration: **`{best.tag}`** "
                     f"(model={best.depth_model}, mask={_fmt_mask(best)}, "
                     f"refdist={'Y' if best.use_ref_distance else 'N'}).")
        lines.append(f"\n- Sample size: **n = {best.n_ok}** of {best.n_total} "
                     f"(failure rate {(best.n_fail/best.n_total*100 if best.n_total else 0):.1f}%)")
        lines.append(f"- MAE = **{best.mae_cm:.2f} ± {best.mae_std_cm:.2f} cm**")
        lines.append(f"- RMSE = **{best.rmse_cm:.2f} cm**")
        lines.append(f"- Bias = **{best.bias_cm:+.2f} cm** "
                     f"({'over-' if best.bias_cm > 0 else 'under-'}estimating on average)")
        lines.append(f"- {best.within_10pct:.1f}% of samples within ±10% of true DBH "
                     f"(95% CI [{best.within_10pct_ci_lo:.1f}%, {best.within_10pct_ci_hi:.1f}%])")
        lines.append(f"- {best.within_20pct:.1f}% of samples within ±20% of true DBH "
                     f"(95% CI [{best.within_20pct_ci_lo:.1f}%, {best.within_20pct_ci_hi:.1f}%])")
        lines.append("")

        clean_refdist = [
            c for c in configs.values()
            if c.use_ref_distance and not _is_old_yolo_leakage(c)
            and c.n_total > 0 and c.n_ok / c.n_total >= 0.98
        ]
        clean_nodist = [
            c for c in configs.values()
            if not c.use_ref_distance and not _is_old_yolo_leakage(c)
            and c.n_total > 0 and c.n_ok / c.n_total >= 0.98
        ]
        upper_bound_refdist = _best_accuracy_then_latency([
            c for c in clean_refdist if c.use_gt_mask
        ])
        upper_bound_nodist = _best_accuracy_then_latency([
            c for c in clean_nodist if c.use_gt_mask
        ])
        server_yolo_refdist = _best_accuracy_then_latency([
            c for c in clean_refdist if c.use_server_yolo_mask
        ])
        server_yolo_gtbbox_nodist = _best_accuracy_then_latency([
            c for c in clean_nodist if c.use_server_yolo_mask
            and c.use_gt_bbox
        ])
        phone_yolo_nodist = _best_accuracy_then_latency([
            c for c in configs.values()
            if not c.use_ref_distance and c.use_server_yolo_mask
            and c.use_yolo_bbox
            and c.n_total > 0 and c.n_ok / c.n_total >= 0.98
        ])
        deployable = phone_yolo_nodist

        lines.append("## 7. Deployment recommendation (for start.ps1)\n")
        lines.append("Selection rule: require ≥98% successful samples, prefer lower MAE, "
                     "and if MAE differs by ≤0.20 cm choose the lower-latency config. "
                     "Old `yolomask`/`yolomaskm` rows and phone-YOLO bbox rows are optimistic if Xiang is in the YOLO training set. "
                     "Rows with `refdist=Y` are benchmark-only external-distance upper bounds; production defaults must come from `refdist=N`.\n")
        lines.append("| role | tag | MAE cm | RMSE cm | latency s | DA3 IR | DA3 device | note |")
        lines.append("|---|---|---:|---:|---:|---|---|---|")
        for role, c, note in [
            ("upper-bound-refdist", upper_bound_refdist,
             "GT mask + CapDis external override; benchmark-only, not production DBH semantics"),
            ("upper-bound-nodist", upper_bound_nodist,
             "GT mask with depth-model distance; clean upper bound for current production distance semantics"),
            ("server-yolo-refdist", server_yolo_refdist,
             "server YOLO + CapDis external override; diagnostic only"),
            ("server-yolo-gtbbox-nodist", server_yolo_gtbbox_nodist,
             "clean bbox upper bound for detection-only phone path; not deployable by itself"),
            ("phone-flow-nodist", phone_yolo_nodist,
             "actual phone YOLO bbox + server YOLO mask simulator; optimistic if YOLO saw Xiang during training"),
            ("deployable", deployable,
             "runtime candidate for default start.ps1 after matrix review; accuracy must carry the phone-YOLO leakage caveat"),
        ]:
            if c is None:
                lines.append(f"| {role} | (no eligible config) | | | | | | {note} |")
            else:
                lines.append(
                    f"| {role} | `{c.tag}` | {c.mae_cm:.2f} | {c.rmse_cm:.2f} | "
                    f"{c.avg_latency_s:.2f} | {_shape_hint(c)} | {_device_hint(c)} | {note} |"
                )
        if deployable is not None:
            lines.append("")
            lines.append("Recommended default after confirmation:")
            lines.append(f"- `start.ps1` `Da3Ir` → `{_shape_hint(deployable)}`")
            lines.append(f"- `start.ps1` `Da3Device` → `{_device_hint(deployable)}`")
            lines.append("- Keep current defaults if the candidate is not clearly better than 504x378 GPU/AUTO.")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[write] {out_path} ({len(lines)} lines)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Statistical analysis of benchmark CSV/JSON outputs.")
    ap.add_argument("--dir", default="benchmark_matrix_full",
                    help="Directory containing <tag>.json + <tag>.csv pairs.")
    ap.add_argument("--out", default=None,
                    help="Output markdown path. Default: <dir>/_analysis.md")
    ap.add_argument("--top", type=int, default=0,
                    help="Show only top-N configs by MAE in the main table (0=all).")
    ap.add_argument("--pair", nargs=2, action="append", metavar=("A_TAG", "B_TAG"),
                    help="Paired Wilcoxon between two configs. Repeatable.")
    ap.add_argument("--auto-pairs", action="store_true",
                    help="Auto-generate sensible pairs (same-mask same-refdist, "
                         "different model; same-model different mask; etc.).")
    args = ap.parse_args()

    src = Path(args.dir)
    if not src.is_absolute():
        src = Path(__file__).parent / src
    if not src.exists():
        print(f"[ERROR] directory not found: {src}")
        return 2

    configs = load_configs(src)
    if not configs:
        print(f"[ERROR] no configs loaded from {src}")
        return 3

    pairs: List[Tuple[str, str]] = []
    if args.pair:
        for a, b in args.pair:
            pairs.append((a, b))
    if args.auto_pairs:
        # Within each (mask, refdist) bucket, pair best model vs each other model.
        buckets: Dict[Tuple[str, bool], List[ConfigStats]] = {}
        for c in configs.values():
            buckets.setdefault((_fmt_mask(c), c.use_ref_distance), []).append(c)
        for cs in buckets.values():
            cs_sorted = sorted(cs, key=lambda c: c.mae_cm)
            if len(cs_sorted) < 2:
                continue
            best = cs_sorted[0]
            for other in cs_sorted[1:]:
                pairs.append((best.tag, other.tag))
        # Mask comparison: gt vs yolo, same model+refdist
        by_model_dist: Dict[Tuple[str, bool], Dict[str, ConfigStats]] = {}
        for c in configs.values():
            by_model_dist.setdefault((c.depth_model, c.use_ref_distance), {})[
                _fmt_mask(c)] = c
        for (model, refd), masks in by_model_dist.items():
            if "gt" in masks and "yolo-n" in masks:
                pairs.append((masks["gt"].tag, masks["yolo-n"].tag))

    out_path = Path(args.out) if args.out else (src / "_analysis.md")
    write_report(configs, out_path, top=args.top, pairs=pairs,
                 source_dir=src)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
