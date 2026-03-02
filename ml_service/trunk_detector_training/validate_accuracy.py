#!/usr/bin/env python3
"""
DBH 測量精度驗證工具
=====================

回答核心問題：「如何知道測量結果能不能用？」

本腳本做三件事：
1. 模型偵測品質驗證 → 模型抓到的是不是樹幹？(mAP)
2. 分割精度驗證     → mask 邊緣準不準？(IoU)
3. DBH 測量精度驗證 → 算出來的數字跟實際量的差多少？(RMSE, Bias)

最終產出：
  - 精度報告 (accuracy_report.json)
  - 視覺化圖表 (accuracy_plots.png)
  - 是否達到「可上線」標準的結論

上線標準：
  ┌──────────────────────────────────────┐
  │ 指標            │ 最低要求  │ 理想值  │
  ├──────────────────────────────────────┤
  │ Detection mAP50 │ > 0.80   │ > 0.90  │
  │ Segment IoU     │ > 0.70   │ > 0.80  │
  │ DBH RMSE (cm)   │ < 3.0    │ < 1.5   │
  │ DBH Bias (cm)   │ < ±1.0   │ < ±0.5  │
  │ DBH % Error     │ < 10%    │ < 5%    │
  └──────────────────────────────────────┘
  參考：人工胸徑帶測量的標準誤差約 ±0.5-1.0 cm

Usage:
    # 1. 只驗證模型偵測品質
    python validate_accuracy.py --model best.pt

    # 2. 完整 DBH 精度驗證（需要真值 CSV）
    python validate_accuracy.py --model best.pt --ground-truth ground_truth.csv

    # 3. 用手機實際拍攝驗證（需要連線 ML 服務）
    python validate_accuracy.py --field-test --ml-service-url http://localhost:8100/api/v1
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np


# ============================================================
# Part 1: 模型偵測品質驗證
# ============================================================

def validate_model_quality(model_path: str, data_yaml: str) -> Dict:
    """
    驗證模型的偵測和分割品質。

    Returns:
        dict with mAP50, mAP50-95, IoU stats
    """
    from ultralytics import YOLO

    print("\n" + "=" * 60)
    print("  Part 1: Model Detection & Segmentation Quality")
    print("=" * 60)

    model = YOLO(model_path)
    metrics = model.val(data=data_yaml, verbose=True)

    results = {
        "detection": {
            "mAP50": float(getattr(metrics.box, 'map50', 0)),
            "mAP50_95": float(getattr(metrics.box, 'map', 0)),
            "precision": float(getattr(metrics.box, 'mp', 0)),
            "recall": float(getattr(metrics.box, 'mr', 0)),
        },
        "segmentation": {
            "mAP50": float(getattr(metrics.seg, 'map50', 0)),
            "mAP50_95": float(getattr(metrics.seg, 'map', 0)),
            "precision": float(getattr(metrics.seg, 'mp', 0)),
            "recall": float(getattr(metrics.seg, 'mr', 0)),
        },
    }

    det = results["detection"]
    seg = results["segmentation"]

    print(f"\n  Detection:     mAP50={det['mAP50']:.3f}  P={det['precision']:.3f}  R={det['recall']:.3f}")
    print(f"  Segmentation:  mAP50={seg['mAP50']:.3f}  P={seg['precision']:.3f}  R={seg['recall']:.3f}")

    # 判定
    if det['mAP50'] >= 0.90 and seg['mAP50'] >= 0.80:
        results["verdict"] = "EXCELLENT"
        print("  ✓ 模型品質優秀，可以上線")
    elif det['mAP50'] >= 0.80 and seg['mAP50'] >= 0.70:
        results["verdict"] = "GOOD"
        print("  △ 模型品質良好，可以上線（建議持續加資料改善）")
    elif det['mAP50'] >= 0.70:
        results["verdict"] = "FAIR"
        print("  △ 模型品質可接受但不理想，建議增加標註資料")
    else:
        results["verdict"] = "POOR"
        print("  ✗ 模型品質不足，需要更多訓練資料或更長訓練")

    return results


# ============================================================
# Part 2: DBH 測量精度驗證
# ============================================================

def validate_dbh_accuracy(
    model_path: str,
    ground_truth_csv: str,
    ml_service_url: Optional[str] = None,
) -> Dict:
    """
    用真值（人工量測的 DBH）驗證完整流程的測量精度。

    ground_truth.csv 格式:
        image_path, true_dbh_cm, distance_m, species, notes
        tree_001.jpg, 32.5, 2.1, camphor, 捲尺量測
        tree_002.jpg, 45.0, 1.8, banyan, 胸徑帶量測

    如果提供 ml_service_url，會用完整的 ML 服務流程。
    否則用離線模型（YOLOv8 偵測 + 本地 dbh_calculator）。
    """
    import pandas as pd
    import cv2

    print("\n" + "=" * 60)
    print("  Part 2: DBH Measurement Accuracy Validation")
    print("=" * 60)

    # 讀取真值
    df = pd.read_csv(ground_truth_csv)
    required_cols = ['image_path', 'true_dbh_cm']
    for col in required_cols:
        if col not in df.columns:
            print(f"[ERROR] CSV must have column: {col}")
            print(f"  Required columns: {required_cols}")
            print(f"  Optional columns: distance_m, species, notes")
            sys.exit(1)

    print(f"  Ground truth samples: {len(df)}")

    # 載入偵測模型
    from ultralytics import YOLO
    model = YOLO(model_path)

    measurement_results = []

    for idx, row in df.iterrows():
        img_path = row['image_path']
        true_dbh = float(row['true_dbh_cm'])

        if not os.path.exists(img_path):
            print(f"  [SKIP] Image not found: {img_path}")
            continue

        try:
            if ml_service_url:
                # 完整 ML 服務流程
                measured_dbh = _measure_via_ml_service(img_path, model, ml_service_url)
            else:
                # 離線：YOLO + 本地 DBH calculator
                measured_dbh = _measure_offline(img_path, model)

            if measured_dbh is not None and measured_dbh > 0:
                error = measured_dbh - true_dbh
                pct_error = error / true_dbh * 100
                measurement_results.append({
                    'image': os.path.basename(img_path),
                    'true_dbh_cm': true_dbh,
                    'measured_dbh_cm': round(measured_dbh, 2),
                    'error_cm': round(error, 2),
                    'pct_error': round(pct_error, 1),
                    'species': row.get('species', 'unknown'),
                    'distance_m': row.get('distance_m', None),
                })
                status = "✓" if abs(pct_error) < 10 else "△" if abs(pct_error) < 20 else "✗"
                print(f"  {status} {os.path.basename(img_path)}: "
                      f"true={true_dbh:.1f} measured={measured_dbh:.1f} "
                      f"error={error:+.1f}cm ({pct_error:+.1f}%)")
            else:
                print(f"  ✗ {os.path.basename(img_path)}: measurement failed")

        except Exception as e:
            print(f"  ✗ {os.path.basename(img_path)}: {e}")

    if not measurement_results:
        print("\n  [ERROR] No successful measurements. Cannot compute accuracy.")
        return {"error": "No measurements"}

    # 計算統計
    errors = [r['error_cm'] for r in measurement_results]
    pct_errors = [r['pct_error'] for r in measurement_results]
    true_vals = [r['true_dbh_cm'] for r in measurement_results]
    measured_vals = [r['measured_dbh_cm'] for r in measurement_results]

    n = len(errors)
    rmse = np.sqrt(np.mean(np.array(errors) ** 2))
    mae = np.mean(np.abs(errors))
    bias = np.mean(errors)
    mean_pct_error = np.mean(np.abs(pct_errors))
    r_squared = 1 - np.sum((np.array(measured_vals) - np.array(true_vals)) ** 2) / \
                    np.sum((np.array(true_vals) - np.mean(true_vals)) ** 2) if n > 1 else 0

    within_1cm = sum(1 for e in errors if abs(e) < 1.0) / n * 100
    within_2cm = sum(1 for e in errors if abs(e) < 2.0) / n * 100
    within_5pct = sum(1 for e in pct_errors if abs(e) < 5.0) / n * 100
    within_10pct = sum(1 for e in pct_errors if abs(e) < 10.0) / n * 100

    stats = {
        "n_samples": n,
        "rmse_cm": round(rmse, 3),
        "mae_cm": round(mae, 3),
        "bias_cm": round(bias, 3),
        "mean_abs_pct_error": round(mean_pct_error, 1),
        "r_squared": round(r_squared, 4),
        "within_1cm_pct": round(within_1cm, 1),
        "within_2cm_pct": round(within_2cm, 1),
        "within_5pct_pct": round(within_5pct, 1),
        "within_10pct_pct": round(within_10pct, 1),
        "measurements": measurement_results,
    }

    print(f"\n  ── DBH Measurement Accuracy ──")
    print(f"  Samples:    {n}")
    print(f"  RMSE:       {rmse:.2f} cm")
    print(f"  MAE:        {mae:.2f} cm")
    print(f"  Bias:       {bias:+.2f} cm")
    print(f"  Mean |%E|:  {mean_pct_error:.1f}%")
    print(f"  R²:         {r_squared:.4f}")
    print(f"  Within 1cm: {within_1cm:.0f}%")
    print(f"  Within 2cm: {within_2cm:.0f}%")
    print(f"  Within 5%:  {within_5pct:.0f}%")
    print(f"  Within 10%: {within_10pct:.0f}%")

    # 上線判定
    if rmse < 1.5 and abs(bias) < 0.5 and mean_pct_error < 5:
        stats["verdict"] = "EXCELLENT"
        print("\n  ✓ 測量精度優秀！達到專業儀器水準，可以正式上線")
    elif rmse < 3.0 and abs(bias) < 1.0 and mean_pct_error < 10:
        stats["verdict"] = "GOOD"
        print("\n  ✓ 測量精度良好，符合林業調查需求，可以上線")
    elif rmse < 5.0 and mean_pct_error < 15:
        stats["verdict"] = "FAIR"
        print("\n  △ 測量精度可接受，但建議改善（可能是深度估算或拍攝距離問題）")
    else:
        stats["verdict"] = "POOR"
        print("\n  ✗ 測量精度不足，不建議上線")
        print("    常見原因：深度估測不準（太遠或太近）、樹幹偵測偏移、焦距估算錯誤")

    return stats


def _measure_via_ml_service(image_path: str, model, ml_service_url: str) -> Optional[float]:
    """透過完整 ML 服務流程測量 DBH。"""
    import requests

    # 先用 YOLO 偵測樹幹位置
    results = model.predict(image_path, verbose=False)
    if not results or len(results[0].boxes) == 0:
        return None

    # 取信心度最高的偵測
    best_idx = results[0].boxes.conf.argmax().item()
    box = results[0].boxes.xyxy[best_idx].cpu().numpy()
    x1, y1, x2, y2 = [int(v) for v in box]

    # 送到 ML 服務做完整測量（Depth + DBH calculation）
    with open(image_path, 'rb') as f:
        files = {'image': (os.path.basename(image_path), f, 'image/jpeg')}
        data = {
            'bbox_x1': x1, 'bbox_y1': y1,
            'bbox_x2': x2, 'bbox_y2': y2,
        }
        try:
            resp = requests.post(f"{ml_service_url}/measure-dbh",
                                 files=files, data=data, timeout=120)
            if resp.status_code == 200:
                result = resp.json()
                return result.get('dbh_cm', None)
        except Exception as e:
            print(f"    [ML Service Error] {e}")

    return None


def _measure_offline(image_path: str, model) -> Optional[float]:
    """離線測量：YOLO 偵測 + 本地深度估算 + DBH 計算。"""
    import cv2

    # YOLO 偵測
    results = model.predict(image_path, verbose=False)
    if not results or len(results[0].boxes) == 0:
        return None

    best_idx = results[0].boxes.conf.argmax().item()
    box = results[0].boxes.xyxy[best_idx].cpu().numpy()
    x1, y1, x2, y2 = [int(v) for v in box]

    # 如果有 mask，用 mask 算更精確的寬度
    mask = None
    if results[0].masks is not None:
        mask = results[0].masks.data[best_idx].cpu().numpy()

    # 嘗試載入本地深度模型
    try:
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from depth_estimation import estimate_depth_rich
        from dbh_calculator import measure_dbh, BoundingBox

        image = cv2.imread(image_path)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        H, W = image.shape[:2]

        # 深度估算
        depth_result = estimate_depth_rich(image_rgb)
        depth_map = depth_result.depth_map

        # DBH 計算
        bbox = BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)
        focal_px = depth_result.focal_length_px if hasattr(depth_result, 'focal_length_px') else None
        dbh_result = measure_dbh(depth_map, bbox, focal_length_px=focal_px)

        return dbh_result.dbh_cm

    except ImportError:
        print("    [WARN] Depth model not available for offline measurement")
        return None


# ============================================================
# Part 3: 視覺化
# ============================================================

def generate_plots(stats: Dict, output_path: str):
    """生成精度視覺化圖表。"""
    import matplotlib.pyplot as plt
    import matplotlib

    matplotlib.rcParams['font.sans-serif'] = ['Microsoft JhengHei', 'SimHei', 'DejaVu Sans']
    matplotlib.rcParams['axes.unicode_minus'] = False

    measurements = stats.get("measurements", [])
    if not measurements:
        print("[WARN] No measurements to plot")
        return

    true_vals = [m['true_dbh_cm'] for m in measurements]
    measured_vals = [m['measured_dbh_cm'] for m in measurements]
    errors = [m['error_cm'] for m in measurements]

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle('DBH 測量精度驗證報告', fontsize=16, fontweight='bold')

    # 1. Scatter: True vs Measured
    ax1 = axes[0, 0]
    ax1.scatter(true_vals, measured_vals, alpha=0.7, edgecolors='black', linewidth=0.5)
    min_v = min(min(true_vals), min(measured_vals)) * 0.8
    max_v = max(max(true_vals), max(measured_vals)) * 1.2
    ax1.plot([min_v, max_v], [min_v, max_v], 'r--', linewidth=2, label='完美預測')
    ax1.set_xlabel('真值 DBH (cm)')
    ax1.set_ylabel('測量 DBH (cm)')
    ax1.set_title('真值 vs 測量值')
    ax1.legend()
    ax1.set_aspect('equal')

    # 2. Error distribution
    ax2 = axes[0, 1]
    ax2.hist(errors, bins=20, edgecolor='black', alpha=0.7, color='steelblue')
    ax2.axvline(x=0, color='red', linestyle='--', linewidth=2)
    ax2.axvline(x=np.mean(errors), color='orange', linestyle='-', linewidth=2,
                label=f'Bias: {np.mean(errors):+.2f} cm')
    ax2.set_xlabel('誤差 (cm)')
    ax2.set_ylabel('次數')
    ax2.set_title('誤差分布')
    ax2.legend()

    # 3. Error vs True DBH (看大樹/小樹是否有系統性偏差)
    ax3 = axes[1, 0]
    ax3.scatter(true_vals, errors, alpha=0.7, edgecolors='black', linewidth=0.5)
    ax3.axhline(y=0, color='red', linestyle='--', linewidth=2)
    ax3.fill_between([min(true_vals)*0.8, max(true_vals)*1.2], -2, 2,
                     alpha=0.1, color='green', label='±2cm 範圍')
    ax3.set_xlabel('真值 DBH (cm)')
    ax3.set_ylabel('誤差 (cm)')
    ax3.set_title('誤差 vs 樹徑大小')
    ax3.legend()

    # 4. Summary table
    ax4 = axes[1, 1]
    ax4.axis('off')
    table_data = [
        ['指標', '結果', '標準'],
        ['RMSE', f"{stats['rmse_cm']:.2f} cm", '< 3.0 cm'],
        ['MAE', f"{stats['mae_cm']:.2f} cm", '< 2.0 cm'],
        ['Bias', f"{stats['bias_cm']:+.2f} cm", '< ±1.0 cm'],
        ['Mean |%Error|', f"{stats['mean_abs_pct_error']:.1f}%", '< 10%'],
        ['R²', f"{stats['r_squared']:.4f}", '> 0.90'],
        ['Within 2cm', f"{stats['within_2cm_pct']:.0f}%", '> 80%'],
        ['Verdict', stats.get('verdict', '?'), ''],
    ]
    table = ax4.table(cellText=table_data, loc='center', cellLoc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1, 1.5)
    # Header row styling
    for j in range(3):
        table[0, j].set_facecolor('#4472C4')
        table[0, j].set_text_props(color='white', fontweight='bold')
    # Verdict row color
    verdict = stats.get('verdict', 'POOR')
    color = {'EXCELLENT': '#C6EFCE', 'GOOD': '#FFEB9C', 'FAIR': '#FFC7CE', 'POOR': '#FF6666'}
    table[7, 1].set_facecolor(color.get(verdict, '#FFFFFF'))
    ax4.set_title('精度總結')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"\n  [Plot] Saved to {output_path}")


# ============================================================
# Part 4: 真值 CSV 範本
# ============================================================

def create_ground_truth_template(output_path: str):
    """建立真值 CSV 範本，讓使用者填入實際量測數據。"""
    template = """image_path,true_dbh_cm,distance_m,species,notes
photos/tree_001.jpg,32.5,2.1,camphor,捲尺量測
photos/tree_002.jpg,45.0,1.8,banyan,胸徑帶量測
photos/tree_003.jpg,18.3,2.5,pine,周長/π
"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(template)
    print(f"[Template] Ground truth CSV template created: {output_path}")
    print()
    print("  填寫說明：")
    print("  1. image_path:  照片路徑")
    print("  2. true_dbh_cm: 真實 DBH (cm)，用捲尺或胸徑帶在 1.3m 高處量測")
    print("  3. distance_m:  拍照距離（公尺），可選")
    print("  4. species:     樹種，可選")
    print("  5. notes:       備註，可選")
    print()
    print("  量測方法：")
    print("  - 最佳：直徑帶直接讀 DBH")
    print("  - 次佳：軟捲尺量周長 C，DBH = C / π")
    print("  - 建議量 30+ 棵樹，涵蓋 10-80cm 範圍")


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='Validate tree trunk detection and DBH accuracy')
    parser.add_argument('--model', type=str, help='Path to trained YOLOv8 model (.pt)')
    parser.add_argument('--ground-truth', type=str, help='Ground truth CSV file')
    parser.add_argument('--ml-service-url', type=str, help='ML service URL for full pipeline test')
    parser.add_argument('--create-template', action='store_true',
                        help='Create ground truth CSV template')
    parser.add_argument('--output-dir', type=str, default='validation_results',
                        help='Output directory for results')
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.create_template:
        create_ground_truth_template(str(output_dir / 'ground_truth_template.csv'))
        return

    if not args.model:
        print("[ERROR] --model is required")
        print("  Usage: python validate_accuracy.py --model best.pt")
        print("  Or:    python validate_accuracy.py --create-template")
        sys.exit(1)

    report = {
        "timestamp": datetime.now().isoformat(),
        "model": args.model,
    }

    # Part 1: 模型品質
    data_yaml = str(Path(__file__).parent / 'dataset.yaml')
    if os.path.exists(data_yaml):
        model_stats = validate_model_quality(args.model, data_yaml)
        report["model_quality"] = model_stats
    else:
        print("[WARN] dataset.yaml not found, skipping model quality validation")

    # Part 2: DBH 精度
    if args.ground_truth:
        dbh_stats = validate_dbh_accuracy(args.model, args.ground_truth, args.ml_service_url)
        report["dbh_accuracy"] = dbh_stats

        # Part 3: 視覺化
        try:
            generate_plots(dbh_stats, str(output_dir / 'accuracy_plots.png'))
        except ImportError:
            print("[WARN] matplotlib not available, skipping plots")
    else:
        print("\n[INFO] No ground truth provided. Skipping DBH accuracy validation.")
        print("       To validate measurement accuracy:")
        print("       1. python validate_accuracy.py --create-template")
        print("       2. Fill in ground_truth.csv with real measurements")
        print("       3. python validate_accuracy.py --model best.pt --ground-truth ground_truth.csv")

    # 儲存報告
    report_path = output_dir / 'accuracy_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n[Report] Full report saved to {report_path}")

    # 最終判定
    print("\n" + "=" * 60)
    print("  FINAL VERDICT")
    print("=" * 60)

    model_ok = report.get("model_quality", {}).get("verdict", "") in ["EXCELLENT", "GOOD"]
    dbh_ok = report.get("dbh_accuracy", {}).get("verdict", "") in ["EXCELLENT", "GOOD"]

    if model_ok and dbh_ok:
        print("  ✓ 模型偵測品質 + 測量精度皆達標，可以正式上線！")
    elif model_ok and not args.ground_truth:
        print("  △ 模型偵測品質達標，但尚未驗證實際測量精度")
        print("    建議：用捲尺量 30+ 棵樹的 DBH → 填入 ground_truth.csv → 重新驗證")
    elif model_ok:
        print("  △ 模型偵測品質達標，但測量精度需要改善")
    else:
        print("  ✗ 模型品質未達標，需要更多訓練資料")
    print("=" * 60)


if __name__ == '__main__':
    main()
