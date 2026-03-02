#!/usr/bin/env python3
"""
資料集準備工具
==============

三種方式取得標註好的樹幹分割資料集：
  A) Roboflow 下載現成資料集（最快，5 分鐘）
  B) 用 SAM 半自動標註自己的照片（最準，2-3 天）
  C) 合併 A + B

Usage:
    # 方式 A：從 Roboflow 下載
    python prepare_dataset.py --source roboflow --api-key YOUR_RF_KEY

    # 方式 B：用 SAM 半自動標註你用 app 拍的照片
    python prepare_dataset.py --source local --images-dir ./my_photos

    # 方式 C：合併（推薦）
    python prepare_dataset.py --source merged --api-key YOUR_RF_KEY --images-dir ./my_photos
"""

import argparse
import os
import shutil
import sys
import json
import random
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image
from tqdm import tqdm


# ============================================================
# 方式 A：從 Roboflow 下載
# ============================================================

# 推薦的公開樹幹資料集 (Roboflow Universe)
ROBOFLOW_DATASETS = [
    # 格式: (workspace, project, version, 描述, 標註數)
    ("tree-trunk-segmentation", "tree-trunk-segmentation", 1,
     "Tree Trunk Segmentation - 通用樹幹分割", "~800"),
    ("arboreal-segmentation", "tree-detection-ywpwk", 2,
     "Tree Detection - 多樹種偵測", "~1200"),
]


def download_from_roboflow(api_key: str, output_dir: Path, max_datasets: int = 2):
    """從 Roboflow Universe 下載預標註的樹幹資料集。"""
    try:
        from roboflow import Roboflow
    except ImportError:
        print("[ERROR] pip install roboflow")
        sys.exit(1)

    rf = Roboflow(api_key=api_key)
    images_dir = output_dir / "images"
    labels_dir = output_dir / "labels"

    downloaded = 0
    for workspace, project_name, version, desc, count in ROBOFLOW_DATASETS[:max_datasets]:
        print(f"\n[Roboflow] Downloading: {desc} ({count} images)...")
        try:
            project = rf.workspace(workspace).project(project_name)
            dataset = project.version(version).download(
                model_format="yolov8",
                location=str(output_dir / f"_rf_{project_name}"),
                overwrite=True,
            )

            # 移動到統一目錄結構
            rf_dir = Path(dataset.location)
            for split in ['train', 'valid', 'test']:
                src_img = rf_dir / split / 'images'
                src_lbl = rf_dir / split / 'labels'
                # map 'valid' → 'val', 'test' → 'val'
                dst_split = 'train' if split == 'train' else 'val'

                if src_img.exists():
                    (images_dir / dst_split).mkdir(parents=True, exist_ok=True)
                    (labels_dir / dst_split).mkdir(parents=True, exist_ok=True)
                    for f in src_img.glob('*'):
                        shutil.copy2(f, images_dir / dst_split / f.name)
                    for f in src_lbl.glob('*'):
                        # 確保 class ID 統一為 0 (tree_trunk)
                        _remap_class_id(f, labels_dir / dst_split / f.name)

            downloaded += 1
            print(f"[Roboflow] ✓ {desc} downloaded successfully")

        except Exception as e:
            print(f"[Roboflow] ✗ Failed to download {desc}: {e}")
            print(f"           Manually download from: https://universe.roboflow.com/{workspace}/{project_name}")

    if downloaded == 0:
        print("\n[WARN] No datasets downloaded. You can manually download from Roboflow Universe:")
        print("  1. Go to https://universe.roboflow.com/search?q=tree+trunk+segmentation")
        print("  2. Choose a dataset with segmentation labels")
        print("  3. Export as 'YOLOv8' format")
        print(f"  4. Extract into {output_dir}/")
        print("\n  Or use --source local with your own photos + SAM auto-labeling.")


def _remap_class_id(src_label: Path, dst_label: Path):
    """將所有 class ID 統一映射為 0 (tree_trunk)。"""
    lines = src_label.read_text().strip().split('\n')
    remapped = []
    for line in lines:
        if not line.strip():
            continue
        parts = line.split()
        # YOLO seg 格式: class_id x1 y1 x2 y2 ... (polygon points)
        parts[0] = '0'  # 統一為 tree_trunk
        remapped.append(' '.join(parts))
    dst_label.write_text('\n'.join(remapped) + '\n')


# ============================================================
# 方式 B：SAM 半自動標註
# ============================================================

def sam_auto_label(images_dir: Path, output_dir: Path, model_type: str = "vit_t"):
    """
    用 SAM 2.1 自動為照片生成 tree trunk 分割 mask，
    存成 YOLO segmentation 格式。

    流程：
    1. 對每張圖，SAM auto-segment 生成所有 mask
    2. 用啟發式過濾：保留「垂直、在中央偏前方」的 mask
    3. 存成 YOLO polygon 標註
    4. 人工用 CVAT/Roboflow 修正（約省 70% 時間）
    """
    print("[SAM Auto-Label] Starting semi-automatic labeling...")
    print("[INFO] This generates initial labels. Manual review is recommended!")
    print()

    images = sorted(
        list(images_dir.glob('*.jpg')) +
        list(images_dir.glob('*.jpeg')) +
        list(images_dir.glob('*.png'))
    )

    if not images:
        print(f"[ERROR] No images found in {images_dir}")
        return

    print(f"[SAM] Found {len(images)} images to label")

    # 嘗試載入 SAM
    sam_model = _load_sam_for_labeling(model_type)
    use_sam = sam_model is not None

    if not use_sam:
        print("[WARN] SAM not available. Using depth-heuristic labeling (lower quality).")
        print("       For better results: pip install segment-anything-2")

    # 分配 train/val (80/20)
    random.shuffle(images)
    split_idx = int(len(images) * 0.8)
    splits = {
        'train': images[:split_idx],
        'val': images[split_idx:],
    }

    for split, split_images in splits.items():
        img_out = output_dir / "images" / split
        lbl_out = output_dir / "labels" / split
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        labeled_count = 0
        for img_path in tqdm(split_images, desc=f"Labeling {split}"):
            try:
                image = np.array(Image.open(img_path).convert('RGB'))
                H, W = image.shape[:2]

                if use_sam:
                    polygons = _sam_segment_trunks(sam_model, image)
                else:
                    polygons = _heuristic_segment_trunks(image)

                if polygons:
                    # 寫入 YOLO 格式標註
                    label_lines = []
                    for polygon in polygons:
                        # 正規化座標到 [0, 1]
                        normalized = []
                        for x, y in polygon:
                            normalized.extend([x / W, y / H])
                        coords_str = ' '.join(f'{c:.6f}' for c in normalized)
                        label_lines.append(f'0 {coords_str}')

                    # 複製圖片並寫入標註
                    dst_img = img_out / img_path.name
                    shutil.copy2(img_path, dst_img)

                    label_file = lbl_out / (img_path.stem + '.txt')
                    label_file.write_text('\n'.join(label_lines) + '\n')
                    labeled_count += 1

            except Exception as e:
                print(f"  [WARN] Failed to process {img_path.name}: {e}")

        print(f"[{split}] Labeled {labeled_count}/{len(split_images)} images")

    print("\n[SAM Auto-Label] Done!")
    print("[IMPORTANT] Please review and correct labels using one of these tools:")
    print("  - Roboflow Annotate: https://app.roboflow.com/ (最簡單)")
    print("  - CVAT: https://www.cvat.ai/ (免費開源)")
    print("  - Label Studio: https://labelstud.io/ (自架)")


def _load_sam_for_labeling(model_type: str = "vit_t"):
    """嘗試載入 SAM 模型用於自動標註。"""
    # 方法 1: SAM 2.1
    try:
        from sam2.build_sam import build_sam2
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        sam2 = build_sam2("sam2.1_hiera_t", device=device)
        mask_generator = SAM2AutomaticMaskGenerator(
            model=sam2,
            points_per_side=32,
            pred_iou_thresh=0.7,
            stability_score_thresh=0.8,
            min_mask_region_area=500,
        )
        print(f"[SAM] SAM 2.1 loaded on {device}")
        return mask_generator
    except ImportError:
        pass

    # 方法 2: HuggingFace transformers SAM
    try:
        from transformers import pipeline
        mask_generator = pipeline(
            "mask-generation",
            model="facebook/sam-vit-base",
            device=0 if _has_cuda() else -1,
        )
        print("[SAM] HuggingFace SAM loaded")
        return mask_generator
    except Exception:
        pass

    return None


def _has_cuda():
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def _sam_segment_trunks(mask_generator, image: np.ndarray) -> List[List[Tuple[float, float]]]:
    """用 SAM 生成 mask，再過濾出可能的樹幹。"""
    import cv2

    H, W = image.shape[:2]

    # 生成所有 mask
    try:
        # SAM 2.1 style
        if hasattr(mask_generator, 'generate'):
            masks = mask_generator.generate(image)
        else:
            # HuggingFace pipeline style
            result = mask_generator(Image.fromarray(image), points_per_batch=64)
            masks = result.get('masks', [])
            # Convert to SAM format
            masks = [{'segmentation': np.array(m), 'area': np.sum(m),
                       'predicted_iou': 0.8} for m in masks]
    except Exception as e:
        print(f"  [SAM ERROR] {e}")
        return []

    # 過濾：保留看起來像樹幹的 mask
    trunk_polygons = []
    for mask_data in masks:
        mask = mask_data['segmentation'].astype(np.uint8)
        if mask.shape != (H, W):
            continue

        # 計算 bounding box
        ys, xs = np.where(mask > 0)
        if len(ys) < 100:
            continue

        x1, x2 = int(np.min(xs)), int(np.max(xs))
        y1, y2 = int(np.min(ys)), int(np.max(ys))
        w, h = x2 - x1, y2 - y1

        if w == 0 or h == 0:
            continue

        # 樹幹特徵過濾
        aspect_ratio = h / w
        area_ratio = np.sum(mask) / (H * W)
        center_x = (x1 + x2) / 2 / W

        # 過濾條件：
        # 1. 高寬比 > 1.5（垂直結構）
        # 2. 面積佔比 1%-30%（不能太小也不能佔滿整張圖）
        # 3. 中心偏向圖片中央（使用者對準的地方）
        if aspect_ratio < 1.5:
            continue
        if area_ratio < 0.01 or area_ratio > 0.30:
            continue
        if abs(center_x - 0.5) > 0.35:
            continue

        # 轉換 mask → polygon (YOLO 格式需要多邊形，不是 mask)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        # 取最大輪廓
        largest = max(contours, key=cv2.contourArea)

        # 簡化多邊形（減少點數，YOLO 標註不需要太精確）
        epsilon = 0.005 * cv2.arcLength(largest, True)
        simplified = cv2.approxPolyDP(largest, epsilon, True)

        if len(simplified) < 4:
            continue

        # 轉為 (x, y) 列表
        polygon = [(int(p[0][0]), int(p[0][1])) for p in simplified]
        trunk_polygons.append(polygon)

    return trunk_polygons


def _heuristic_segment_trunks(image: np.ndarray) -> List[List[Tuple[float, float]]]:
    """
    不用 SAM 的簡易啟發式樹幹分割。
    品質較差，僅作為最後手段。
    """
    import cv2

    H, W = image.shape[:2]

    # 轉灰階
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

    # 邊緣偵測
    edges = cv2.Canny(gray, 50, 150)

    # 垂直邊強化
    kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
    vertical = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_v)

    # 連通區域
    contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    trunk_polygons = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < H * W * 0.01:  # 太小
            continue

        x, y, w, h = cv2.boundingRect(contour)
        if h / max(w, 1) < 1.5:  # 不夠垂直
            continue

        center_x = (x + w / 2) / W
        if abs(center_x - 0.5) > 0.35:  # 不在中央
            continue

        # 簡化
        epsilon = 0.01 * cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, epsilon, True)

        if len(simplified) >= 4:
            polygon = [(int(p[0][0]), int(p[0][1])) for p in simplified]
            trunk_polygons.append(polygon)

    return trunk_polygons[:3]  # 最多 3 個候選


# ============================================================
# 方式 C：合併
# ============================================================

def merge_datasets(roboflow_dir: Path, local_dir: Path, output_dir: Path):
    """合併 Roboflow 和本地標註的資料集。"""
    for split in ['train', 'val']:
        img_out = output_dir / "images" / split
        lbl_out = output_dir / "labels" / split
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        count = 0
        for src_dir in [roboflow_dir, local_dir]:
            src_img = src_dir / "images" / split
            src_lbl = src_dir / "labels" / split
            if not src_img.exists():
                continue

            for img_file in src_img.glob('*'):
                if img_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    lbl_file = src_lbl / (img_file.stem + '.txt')
                    if lbl_file.exists():
                        # 加前綴避免檔名衝突
                        prefix = 'rf_' if 'roboflow' in str(src_dir).lower() else 'local_'
                        dst_name = prefix + img_file.name
                        shutil.copy2(img_file, img_out / dst_name)
                        shutil.copy2(lbl_file, lbl_out / (prefix + img_file.stem + '.txt'))
                        count += 1

        print(f"[Merge] {split}: {count} images")


# ============================================================
# 統計
# ============================================================

def print_dataset_stats(dataset_dir: Path):
    """顯示資料集統計。"""
    print("\n" + "=" * 50)
    print("  Dataset Statistics")
    print("=" * 50)

    for split in ['train', 'val']:
        img_dir = dataset_dir / "images" / split
        lbl_dir = dataset_dir / "labels" / split

        if not img_dir.exists():
            print(f"  {split}: NOT FOUND")
            continue

        images = list(img_dir.glob('*.jpg')) + list(img_dir.glob('*.png')) + list(img_dir.glob('*.jpeg'))
        labels = list(lbl_dir.glob('*.txt')) if lbl_dir.exists() else []

        # 計算每張圖的標註數
        total_annotations = 0
        for lbl in labels:
            lines = lbl.read_text().strip().split('\n')
            total_annotations += len([l for l in lines if l.strip()])

        avg_per_image = total_annotations / max(len(labels), 1)
        print(f"  {split}:")
        print(f"    Images:      {len(images)}")
        print(f"    Labels:      {len(labels)}")
        print(f"    Annotations: {total_annotations} (avg {avg_per_image:.1f}/image)")

    print("=" * 50)


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='Prepare tree trunk segmentation dataset')
    parser.add_argument('--source', choices=['roboflow', 'local', 'merged'],
                        default='roboflow', help='Data source')
    parser.add_argument('--api-key', type=str, help='Roboflow API key')
    parser.add_argument('--images-dir', type=str, help='Local images directory (for SAM labeling)')
    parser.add_argument('--output-dir', type=str, default=None,
                        help='Output directory (default: ./datasets)')
    parser.add_argument('--sam-model', type=str, default='vit_t',
                        help='SAM model type for auto-labeling')
    args = parser.parse_args()

    base = Path(__file__).parent
    output_dir = Path(args.output_dir) if args.output_dir else base / "datasets"

    if args.source == 'roboflow':
        if not args.api_key:
            print("[ERROR] Roboflow API key required. Get it from https://app.roboflow.com/settings/api")
            print("        Usage: python prepare_dataset.py --source roboflow --api-key YOUR_KEY")
            sys.exit(1)
        download_from_roboflow(args.api_key, output_dir)

    elif args.source == 'local':
        if not args.images_dir:
            print("[ERROR] --images-dir required for local labeling")
            print("        Usage: python prepare_dataset.py --source local --images-dir ./my_photos")
            sys.exit(1)
        images_dir = Path(args.images_dir)
        if not images_dir.exists():
            print(f"[ERROR] Directory not found: {images_dir}")
            sys.exit(1)
        sam_auto_label(images_dir, output_dir, args.sam_model)

    elif args.source == 'merged':
        rf_dir = output_dir / "_roboflow"
        local_dir = output_dir / "_local"
        if args.api_key:
            download_from_roboflow(args.api_key, rf_dir)
        if args.images_dir:
            sam_auto_label(Path(args.images_dir), local_dir, args.sam_model)
        merge_datasets(rf_dir, local_dir, output_dir)

    print_dataset_stats(output_dir)
    print(f"\n[Done] Dataset ready at: {output_dir}")
    print("[Next] Run: python train.py")


if __name__ == '__main__':
    main()
