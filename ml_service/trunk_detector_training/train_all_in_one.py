#!/usr/bin/env python3
"""
🌲 YOLOv8-seg 樹幹偵測模型訓練 — 全部合在一起的版本
=======================================================
把所有 Step 0~10 合成一個腳本，直接在 Colab 跑一次就好。
不怕斷線（如果斷了，重新跑這一個檔案就好）。

使用方式（Colab）：
1. 上傳此檔案到 Colab
2. 新增一個 Code Cell，貼入：
     !python train_all_in_one.py
3. 執行即可

或者直接把整個檔案內容貼進一個大 Cell 執行。

=======================================================
"""

# !! 防止 Colab 跑 !python 時 stdout 被 buffer 住，看不到訓練進度 !!
import os, sys
os.environ['PYTHONUNBUFFERED'] = '1'
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

import time, shutil, glob, random, hashlib
import numpy as np
from pathlib import Path
from collections import defaultdict

# ╔══════════════════════════════════════════════════════╗
# ║  可調參數（只需要改這裡）                              ║
# ╚══════════════════════════════════════════════════════╝

# --- Roboflow ---
ROBOFLOW_API_KEY = 'uwNljxzf8xgKGZ9Is3py'

# --- Kaggle（Urban Street 用） ---
KAGGLE_USERNAME = 'liuminhhao'
KAGGLE_KEY = '008487131ccae0319171497f4f54a7c5'

# --- 訓練模式 ---
TRAINING_MODE = 'fresh'  # 'fresh' 或 'resume'
RESUME_MODEL_PATH = None  # resume 模式時填你的 .pt 路徑，例如 '/content/tree_trunk_seg_best.pt'

# --- 跳過資料準備 ---
# 'auto' = 自動偵測：如果 merged_dataset/data.yaml 已存在就跳過（預設）
# True  = 強制跳過 Step 2~3
# False = 強制重新下載（含重新合併）
SKIP_DATA_PREP = 'auto'

# --- 僅重新合併（不重新下載） ---
# True = 跳過下載，但重新執行 Step 3 合併（適用於改了 oversample 比例時）
# False = 正常流程
FORCE_REBUILD_MERGE_ONLY = False

# --- 自動續練（Crash Recovery） ---
# 設成 True：如果偵測到上次 crash 留下的 last.pt，
# 自動載入那些權重繼續練（不用從 COCO 預訓練重來）
AUTO_RESUME_FROM_CRASH = True

# --- 模型 ---
MODEL_SIZE = 'yolov8m-seg.pt'  # 'yolov8n-seg.pt' / 'yolov8s-seg.pt' / 'yolov8m-seg.pt'

# --- 訓練參數 ---
EPOCHS = 60            # 模型已高度收斂，60 epochs + early stop 即可
BATCH_SIZE_OVERRIDE = 64  # 640px 下 95GB GPU 可輕鬆跑 batch=64（之前 16 是為 960px 設的）
IMAGE_SIZE = 640       # 與 TFLite 匯出尺寸一致，訓練速度 ~2x 快

# --- 學術資料加權 ---
# ⚠️ 修改此值後需設 FORCE_REBUILD_MERGE_ONLY = True 才會生效
URBAN_OVERSAMPLE = 0  # Urban Street 額外複製次數（0=不加權，降低佔比）
XIANG_OVERSAMPLE = 1  # Xiang tree 額外複製次數（2x 有效）

# --- Roboflow 資料集清單 ---
DATASETS = [
    ('tree-trunks', 'tree-trunk-detection-bi-axe', 1, '主資料集 1.3k 張'),
    ('tree-trunks', 'cherry-trunks', 2, '櫻桃樹幹 337 張'),
    ('imageprocessing-mo6fy', 'tree_trunk-weppw', 1, '6 classes 1.1k 張'),
    ('projetosia', 'trunk-tree-z1bpo', 1, '巴西樹幹 140 張'),
    ('wurdataset', 'tree-trunk-segmentation-ixblx', 1, '精確標註 172 張'),
]

# --- 路徑 ---
MERGED_DIR = '/content/merged_dataset'
URBAN_STREET_DIR = '/content/urban_street_trunk'
URBAN_CONVERTED_DIR = '/content/urban_street_converted'
XIANG_DIR = '/content/xiang_validation'
XIANG_TRAIN = '/content/xiang_yolo_train'
XIANG_VAL = '/content/xiang_yolo_validation'

# ╔══════════════════════════════════════════════════════╗
# ║  Step 0：確認 GPU                                    ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 0：確認 GPU')
print('='*60)

os.system('nvidia-smi')

import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    props = torch.cuda.get_device_properties(0)
    total = getattr(props, 'total_memory', None) or getattr(props, 'total_mem', None)
    if total:
        print(f'VRAM: {total / 1024**3:.1f} GB')
else:
    print('⚠️ 沒有偵測到 GPU！訓練會很慢')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 1：安裝依賴                                     ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 1：安裝依賴')
print('='*60)

# 先檢查是否已安裝，避免重複 pip install
_need_install = False
try:
    import ultralytics, roboflow
    print('✓ 已安裝（跳過 pip install）')
except ImportError:
    _need_install = True

if _need_install:
    os.system('pip install ultralytics roboflow supervision zenodo_get kaggle -q')
    print('✓ 安裝完成')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 1.5：上傳或設定續練模型                          ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 1.5：訓練模式')
print('='*60)

if TRAINING_MODE == 'resume' and RESUME_MODEL_PATH and os.path.exists(RESUME_MODEL_PATH):
    from ultralytics import YOLO
    try:
        test_model = YOLO(RESUME_MODEL_PATH)
        print(f'✓ Resume 模式：已載入 {RESUME_MODEL_PATH}')
        print(f'  模型類型: {test_model.task}')
        del test_model
    except Exception as e:
        print(f'⚠️ 模型載入警告: {e}，改用 fresh mode')
        TRAINING_MODE = 'fresh'
elif TRAINING_MODE == 'resume':
    print(f'⚠️ 找不到 resume 模型 {RESUME_MODEL_PATH}，改用 fresh mode')
    TRAINING_MODE = 'fresh'

if TRAINING_MODE == 'fresh':
    print(f'✓ Fresh mode：將從 COCO 預訓練權重 ({MODEL_SIZE}) 開始訓練')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 2：下載 Roboflow 資料集                         ║
# ╚══════════════════════════════════════════════════════╝
data_yaml_path = os.path.join(MERGED_DIR, 'data.yaml')

# --- 自動偵測資料是否已存在 ---
if SKIP_DATA_PREP == 'auto':
    if os.path.exists(data_yaml_path):
        # 檢查 train/valid/test 都有影像
        _splits_ok = True
        for _s in ['train', 'valid', 'test']:
            _img_dir = os.path.join(MERGED_DIR, _s, 'images')
            if not os.path.exists(_img_dir) or len(os.listdir(_img_dir)) == 0:
                _splits_ok = False
                break
        SKIP_DATA_PREP = _splits_ok
        if _splits_ok:
            print('\n🔍 自動偵測：merged_dataset 已存在，跳過資料準備')
        else:
            print('\n🔍 自動偵測：merged_dataset 不完整，重新下載')
    else:
        SKIP_DATA_PREP = False
        print('\n🔍 自動偵測：無現有資料，執行完整下載')

# --- FORCE_REBUILD_MERGE_ONLY 覆蓋邏輯 ---
# 設成 True 時：即使 merged_dataset 已存在，也會重新合併（適用於改 oversample 比例後）
# 注意：下載步驟會自動偵測已有資料，不會重複下載
if FORCE_REBUILD_MERGE_ONLY:
    SKIP_DATA_PREP = False
    print('\n🔄 FORCE_REBUILD_MERGE_ONLY = True：重新合併資料集')

if SKIP_DATA_PREP:
    print('\n' + '='*60)
    print('⏭️  跳過 Step 2~3（資料已存在）')
    print('='*60)
    for split in ['train', 'valid', 'test']:
        img_dir = os.path.join(MERGED_DIR, split, 'images')
        if os.path.exists(img_dir):
            count = len(os.listdir(img_dir))
            print(f'  {split}: {count} images ✓')
    print(f'  data.yaml: {data_yaml_path} ✓')

if not SKIP_DATA_PREP:

    downloaded_datasets = []

    # ===== Step 2: 下載 Roboflow =====
    print('\n' + '='*60)
    print('Step 2：下載 Roboflow 資料集')
    print('='*60)

    from roboflow import Roboflow
    rf = Roboflow(api_key=ROBOFLOW_API_KEY)

    downloaded_datasets = []
    for i, (ws, proj, ver, desc) in enumerate(DATASETS, 1):
        print(f'\n[{i}/{len(DATASETS)}] 下載 {ws}/{proj} v{ver}...')
        try:
            project = rf.workspace(ws).project(proj)
            ds = project.version(ver).download(
                model_format='yolov8',
                location=f'/content/dataset_{i}',
                overwrite=False  # 已下載過就跳過，避免浪費時間
            )
            for split in ['train', 'valid', 'test']:
                img_dir = os.path.join(ds.location, split, 'images')
                if os.path.exists(img_dir):
                    count = len([f for f in os.listdir(img_dir) if f.endswith(('.jpg', '.png', '.jpeg'))])
                    print(f'  {split}: {count} images')
            downloaded_datasets.append(ds)
            print(f'  ✓ 完成')
        except Exception as e:
            print(f'  ✗ 下載失敗: {e}')

        print(f'\n✓ 成功下載 {len(downloaded_datasets)}/{len(DATASETS)} 個資料集')

    # ╔══════════════════════════════════════════════════════╗
    # ║  Step 2.5：下載 Urban Street Trunk（Kaggle）          ║
    # ╚══════════════════════════════════════════════════════╝
    print('\n' + '='*60)
    print('Step 2.5：下載 Urban Street Trunk（Kaggle, ~7,675 張）')
    print('='*60)

    if KAGGLE_USERNAME and KAGGLE_KEY:
        os.environ['KAGGLE_USERNAME'] = KAGGLE_USERNAME
        os.environ['KAGGLE_KEY'] = KAGGLE_KEY
        print(f'✓ Kaggle 帳號: {KAGGLE_USERNAME}')

        DATASET_SLUG = 'erickendric/tree-dataset-of-urban-street-segmentation-trunk'
        print(f'\n📥 下載 {DATASET_SLUG}...')
        print('   (約 6-13 GB，請稍候...)')

        ret = os.system(f'kaggle datasets download -d {DATASET_SLUG} -p {URBAN_STREET_DIR} --unzip')
        if ret == 0:
            total_files = sum(len(fnames) for _, _, fnames in os.walk(URBAN_STREET_DIR))
            print(f'\n✓ 下載完成！共 {total_files} 個檔案')
        else:
            print('❌ 下載失敗！請確認 Kaggle 認證')
    else:
        print('⚠️ 未設定 Kaggle 認證，跳過 Urban Street')

    # ╔══════════════════════════════════════════════════════╗
    # ║  Step 2.5b：VOC Bitmap Mask → YOLO-seg 轉換           ║
    # ╚══════════════════════════════════════════════════════╝
    print('\n' + '='*60)
    print('Step 2.5b：VOC Bitmap Mask → YOLO-seg 格式轉換')
    print('='*60)

    import cv2

    if os.path.exists(URBAN_STREET_DIR):
        # 自動找到 VOC 根目錄
        voc_root = None
        for root, dirs, files in os.walk(URBAN_STREET_DIR):
            if 'JPEGImages' in dirs and 'SegmentationClass' in dirs:
                voc_root = root
                break

        if voc_root is None:
            print(f'❌ 找不到 VOC 資料集結構，跳過 Urban Street 轉換')
        else:
            print(f'✓ 找到 VOC 根目錄: {voc_root}')

            JPEG_DIR = os.path.join(voc_root, 'JPEGImages')
            SEG_DIR = os.path.join(voc_root, 'SegmentationClass')
            CLASS_NAMES_FILE = os.path.join(voc_root, 'class_names.txt')

            if os.path.exists(CLASS_NAMES_FILE):
                with open(CLASS_NAMES_FILE, 'r') as f:
                    class_names = [line.strip() for line in f if line.strip()]
                print(f'  class_names.txt: {len(class_names)} 類')
            else:
                class_names = []

            # 清理舊轉換
            if os.path.exists(URBAN_CONVERTED_DIR):
                shutil.rmtree(URBAN_CONVERTED_DIR)
            os.makedirs(os.path.join(URBAN_CONVERTED_DIR, 'images'), exist_ok=True)
            os.makedirs(os.path.join(URBAN_CONVERTED_DIR, 'labels'), exist_ok=True)

            def mask_to_yolo_polygons(mask_path, img_w, img_h, min_area=100):
                mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
                if mask is None:
                    mask_bgr = cv2.imread(mask_path, cv2.IMREAD_COLOR)
                    if mask_bgr is None:
                        return []
                    mask = cv2.imread(mask_path, cv2.IMREAD_UNCHANGED)
                    if mask is None:
                        return []
                    if len(mask.shape) == 3:
                        gray = cv2.cvtColor(mask_bgr, cv2.COLOR_BGR2GRAY)
                        mask = (gray > 0).astype(np.uint8) * 255

                if mask.max() <= 1:
                    binary = (mask > 0).astype(np.uint8) * 255
                else:
                    binary = np.zeros_like(mask)
                    binary[(mask > 0) & (mask < 255)] = 255

                contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
                yolo_lines = []
                for contour in contours:
                    area = cv2.contourArea(contour)
                    if area < min_area:
                        continue
                    epsilon = 0.001 * cv2.arcLength(contour, True)
                    approx = cv2.approxPolyDP(contour, epsilon, True)
                    if len(approx) < 3:
                        continue
                    points = []
                    for pt in approx:
                        nx = max(0.0, min(1.0, pt[0][0] / img_w))
                        ny = max(0.0, min(1.0, pt[0][1] / img_h))
                        points.extend([f'{nx:.6f}', f'{ny:.6f}'])
                    yolo_lines.append('0 ' + ' '.join(points))
                return yolo_lines

            # 批量轉換
            from PIL import Image as _PILImage
            mask_files = sorted([f for f in os.listdir(SEG_DIR) if f.lower().endswith('.png')])
            total = len(mask_files)
            converted_urban = 0
            skipped_empty = 0
            errors_urban = 0

            print(f'\n🔄 開始轉換 {total} 張 masks...')
            for i, mask_fname in enumerate(mask_files):
                if (i + 1) % 1000 == 0 or (i + 1) == total:
                    print(f'  進度: {i+1}/{total} ({converted_urban} converted)')

                mask_path = os.path.join(SEG_DIR, mask_fname)
                stem = os.path.splitext(mask_fname)[0]

                img_path = None
                for ext in ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG']:
                    candidate = os.path.join(JPEG_DIR, stem + ext)
                    if os.path.exists(candidate):
                        img_path = candidate
                        break
                if img_path is None:
                    continue

                try:
                    with _PILImage.open(img_path) as _pil_img:
                        img_w, img_h = _pil_img.size
                except Exception:
                    errors_urban += 1
                    continue

                try:
                    yolo_lines = mask_to_yolo_polygons(mask_path, img_w, img_h)
                except Exception:
                    errors_urban += 1
                    continue

                if not yolo_lines:
                    skipped_empty += 1
                    continue

                img_ext = os.path.splitext(img_path)[1]
                out_name = f'urban_{converted_urban:05d}'
                dst_img = os.path.join(URBAN_CONVERTED_DIR, 'images', out_name + img_ext)
                dst_lbl = os.path.join(URBAN_CONVERTED_DIR, 'labels', out_name + '.txt')
                try:
                    os.link(img_path, dst_img)
                except OSError:
                    shutil.copy2(img_path, dst_img)
                with open(dst_lbl, 'w') as f:
                    f.write('\n'.join(yolo_lines) + '\n')
                converted_urban += 1

            print(f'\n✓ Urban Street 轉換完成！成功: {converted_urban}, 空mask跳過: {skipped_empty}, 錯誤: {errors_urban}')
    else:
        print('⚠️ Urban Street 目錄不存在，跳過轉換')

    # ╔══════════════════════════════════════════════════════╗
    # ║  Step 2.7：下載 & 轉換 Xiang et al.（Zenodo）         ║
    # ╚══════════════════════════════════════════════════════╝
    print('\n' + '='*60)
    print('Step 2.7：下載 & 轉換 Xiang et al.（Zenodo, 294 張）')
    print('='*60)

    os.makedirs(XIANG_DIR, exist_ok=True)

    print('📥 下載 Xiang et al. 分割驗證集...')
    print('   DOI: 10.5281/zenodo.10650629')

    ret = os.system(f'cd {XIANG_DIR} && zenodo_get 10.5281/zenodo.10650629')
    if ret != 0:
        print('⚠️ zenodo_get 失敗，嘗試直接下載...')
        ZIP_URL = 'https://zenodo.org/records/10650629/files/data%20and%20code.zip?download=1'
        ret = os.system(f'wget -q --show-progress -O "{XIANG_DIR}/data_and_code.zip" "{ZIP_URL}"')

    zips = glob.glob(os.path.join(XIANG_DIR, '*.zip'))
    for z in zips:
        print(f'  解壓: {os.path.basename(z)}')
        os.system(f'unzip -q -o "{z}" -d "{XIANG_DIR}"')

    print(f'✓ Xiang et al. 下載完成！')

    # --- 轉換 Xiang Binary Masks → YOLO-seg ---
    print('\n🔄 轉換 Xiang et al. Binary Masks → YOLO-seg...')

    import yaml

    TRAIN_RATIO = 0.8
    SPLIT_SEED = 42

    for d in [XIANG_TRAIN, XIANG_VAL]:
        if os.path.exists(d):
            shutil.rmtree(d)
        os.makedirs(os.path.join(d, 'images'), exist_ok=True)
        os.makedirs(os.path.join(d, 'labels'), exist_ok=True)

    rgb_dirs = list(Path(XIANG_DIR).rglob('treeRGB'))
    seg_dirs = list(Path(XIANG_DIR).rglob('treeSeg'))

    if not rgb_dirs or not seg_dirs:
        print(f'❌ 找不到 tree/treeRGB 或 tree/treeSeg，跳過 Xiang 轉換')
    else:
        rgb_dir = rgb_dirs[0]
        seg_dir = seg_dirs[0]
        print(f'  RGB: {rgb_dir}')
        print(f'  Seg: {seg_dir}')

        rgb_files = sorted([f for f in rgb_dir.iterdir()
                            if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.bmp')])
        print(f'  找到 {len(rgb_files)} 張 RGB 影像')

        converted_xiang = 0
        skipped_no_mask = 0
        skipped_no_contour = 0
        mask_coverage_pcts = []
        converted_pairs_xiang = []

        for rgb_path in rgb_files:
            stem = rgb_path.stem
            possible_masks = [
                seg_dir / f'{stem}-tm.jpg', seg_dir / f'{stem}-tm.png',
                seg_dir / f'{stem}_mask.jpg', seg_dir / f'{stem}_mask.png',
                seg_dir / f'{stem}.jpg', seg_dir / f'{stem}.png',
            ]
            mask_path = next((mp for mp in possible_masks if mp.exists()), None)
            if mask_path is None:
                skipped_no_mask += 1
                continue

            mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
            if mask is None:
                skipped_no_mask += 1
                continue

            _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                skipped_no_contour += 1
                continue

            H, W = mask.shape[:2]
            mask_px = (binary > 0).sum()
            mask_coverage_pcts.append(mask_px / (H * W) * 100)

            yolo_lines = []
            for cnt in contours:
                if cv2.contourArea(cnt) < 500:
                    continue
                epsilon = 0.005 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)
                if len(approx) < 3:
                    continue
                points = []
                for pt in approx:
                    x = max(0.0, min(1.0, pt[0][0] / W))
                    y = max(0.0, min(1.0, pt[0][1] / H))
                    points.extend([f'{x:.6f}', f'{y:.6f}'])
                yolo_lines.append('0 ' + ' '.join(points))

            if yolo_lines:
                converted_pairs_xiang.append((rgb_path, yolo_lines))
                converted_xiang += 1

        print(f'  成功轉換: {converted_xiang} / {len(rgb_files)} 張')

        # 隨機分割 train / val
        random.seed(SPLIT_SEED)
        indices = list(range(len(converted_pairs_xiang)))
        random.shuffle(indices)
        n_train_xiang = int(len(indices) * TRAIN_RATIO)

        train_count = 0
        val_count = 0
        for rank, idx in enumerate(indices):
            rgb_path_x, yolo_lines_x = converted_pairs_xiang[idx]
            is_train = rank < n_train_xiang
            out_dir = XIANG_TRAIN if is_train else XIANG_VAL
            out_idx = train_count if is_train else val_count
            out_name = f'xiang_tree_{out_idx:04d}'
            ext = rgb_path_x.suffix

            shutil.copy2(str(rgb_path_x), os.path.join(out_dir, 'images', out_name + ext))
            with open(os.path.join(out_dir, 'labels', out_name + '.txt'), 'w') as f:
                f.write('\n'.join(yolo_lines_x) + '\n')

            if is_train:
                train_count += 1
            else:
                val_count += 1

        # data.yaml
        with open(os.path.join(XIANG_VAL, 'data.yaml'), 'w') as f:
            yaml.dump({'path': XIANG_VAL, 'val': 'images', 'nc': 1, 'names': ['tree_trunk']},
                      f, default_flow_style=False)
        with open(os.path.join(XIANG_TRAIN, 'data.yaml'), 'w') as f:
            yaml.dump({'path': XIANG_TRAIN, 'train': 'images', 'nc': 1, 'names': ['tree_trunk']},
                      f, default_flow_style=False)

        print(f'✓ Xiang et al. 轉換完成！訓練: {train_count}, 驗證: {val_count}')

    # ╔══════════════════════════════════════════════════════╗
    # ║  Step 3：合併所有資料集                                ║
    # ╚══════════════════════════════════════════════════════╝
    print('\n' + '='*60)
    print('Step 3：合併所有資料集（Roboflow + Urban Street + Xiang Tree）')
    print('='*60)

    import yaml

    if os.path.exists(MERGED_DIR):
        shutil.rmtree(MERGED_DIR)
    for split in ['train', 'valid', 'test']:
        os.makedirs(os.path.join(MERGED_DIR, split, 'images'), exist_ok=True)
        os.makedirs(os.path.join(MERGED_DIR, split, 'labels'), exist_ok=True)

    all_pairs = []
    seen_hashes = set()
    stats = defaultdict(int)

    def fast_file_hash(filepath):
        st = os.stat(filepath)
        with open(filepath, 'rb') as f:
            head = f.read(2048)
        return hashlib.md5(f'{st.st_size}:{head}'.encode('latin-1')).hexdigest()

    # --- Phase 1: Roboflow ---
    print('\n📦 Phase 1: 處理 Roboflow 資料集')

    EXTRA_TRUNK_OVERRIDES = {'tree_trunk-weppw': {'0', '2'}}

    for ds in downloaded_datasets:
        ds_dir = ds.location
        data_yaml_file = os.path.join(ds_dir, 'data.yaml')
        with open(data_yaml_file, 'r') as f:
            cfg = yaml.safe_load(f)
        names = cfg.get('names', [])
        if isinstance(names, dict):
            names = [names[k] for k in sorted(names.keys())]

        ds_basename = os.path.basename(ds_dir)
        extra_trunk = set()
        for key, val in EXTRA_TRUNK_OVERRIDES.items():
            if key in ds_basename:
                extra_trunk = val
                break

        trunk_ids = set()
        non_trunk_names = []
        for idx, name in enumerate(names):
            n = str(name).lower().strip()
            if 'trunk' in n or n in extra_trunk:
                trunk_ids.add(idx)
            else:
                non_trunk_names.append(f'{idx}:{name}')

        if trunk_ids:
            print(f'  ✓ {ds_basename}: trunk IDs = {trunk_ids}')
            if non_trunk_names:
                print(f'    ⛔ 排除: {non_trunk_names}')
        elif len(names) == 1:
            trunk_ids = {0}
            print(f'  ⚠️ {ds_basename}: 單類別 "{names[0]}"，假設為 trunk')
        else:
            print(f'  ❌ {ds_basename}: 無 trunk class，跳過')
            stats['datasets_skipped'] += 1
            continue

        for split in ['train', 'valid', 'test']:
            img_dir = os.path.join(ds_dir, split, 'images')
            lbl_dir = os.path.join(ds_dir, split, 'labels')
            if not os.path.exists(img_dir):
                continue

            for img_file in os.listdir(img_dir):
                if not img_file.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                    continue
                img_path = os.path.join(img_dir, img_file)

                img_hash = fast_file_hash(img_path)
                if img_hash in seen_hashes:
                    stats['duplicates'] += 1
                    continue
                seen_hashes.add(img_hash)

                stem = os.path.splitext(img_file)[0]
                lbl_path = os.path.join(lbl_dir, stem + '.txt')
                trunk_lines = []
                if os.path.exists(lbl_path):
                    with open(lbl_path, 'r') as f:
                        for line in f:
                            parts = line.strip().split()
                            if len(parts) >= 5:
                                cls = int(parts[0])
                                if cls in trunk_ids:
                                    parts[0] = '0'
                                    trunk_lines.append(' '.join(parts))
                                    stats['annotations_kept'] += 1
                                else:
                                    stats['annotations_removed'] += 1

                if trunk_lines:
                    all_pairs.append((img_path, trunk_lines))
                    stats['images_with_trunk'] += 1
                else:
                    if random.random() < 0.1:
                        all_pairs.append((img_path, []))
                        stats['negative_samples'] += 1
                    else:
                        stats['images_no_trunk_skipped'] += 1

    roboflow_count = len(all_pairs)
    print(f'  Roboflow 影像: {roboflow_count}')

    # --- Phase 2: Urban Street ---
    print(f'\n📦 Phase 2: 處理 Urban Street Trunk 資料集')

    urban_img_dir = os.path.join(URBAN_CONVERTED_DIR, 'images')
    urban_lbl_dir = os.path.join(URBAN_CONVERTED_DIR, 'labels')

    if os.path.exists(urban_img_dir):
        urban_images = [f for f in os.listdir(urban_img_dir)
                        if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
        print(f'  找到 {len(urban_images)} 張已轉換的 Urban Street 圖片')

        urban_added = 0
        for img_file in urban_images:
            img_path = os.path.join(urban_img_dir, img_file)
            img_hash = fast_file_hash(img_path)
            if img_hash in seen_hashes:
                stats['duplicates'] += 1
                continue
            seen_hashes.add(img_hash)

            stem = os.path.splitext(img_file)[0]
            lbl_path = os.path.join(urban_lbl_dir, stem + '.txt')
            trunk_lines = []
            if os.path.exists(lbl_path):
                with open(lbl_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and len(line.split()) >= 5:
                            trunk_lines.append(line)
                            stats['annotations_kept'] += 1
            if trunk_lines:
                all_pairs.append((img_path, trunk_lines))
                stats['images_with_trunk'] += 1
                urban_added += 1
            else:
                if random.random() < 0.05:
                    all_pairs.append((img_path, []))
                    stats['negative_samples'] += 1

        print(f'  ✓ Urban Street 加入: {urban_added} 張')
    else:
        print('  ⚠️ 未找到 Urban Street 轉換資料，跳過')

    # --- Phase 2.5: Xiang Tree ---
    print(f'\n📦 Phase 2.5: 處理 Xiang et al. 樹木訓練資料')

    XIANG_TRAIN_DIR = XIANG_TRAIN
    xiang_train_img_dir = os.path.join(XIANG_TRAIN_DIR, 'images')
    xiang_train_lbl_dir = os.path.join(XIANG_TRAIN_DIR, 'labels')

    if os.path.exists(xiang_train_img_dir):
        xiang_images = [f for f in os.listdir(xiang_train_img_dir)
                        if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
        print(f'  找到 {len(xiang_images)} 張 Xiang 訓練圖片')

        xiang_added = 0
        for img_file in xiang_images:
            img_path = os.path.join(xiang_train_img_dir, img_file)
            img_hash = fast_file_hash(img_path)
            if img_hash in seen_hashes:
                stats['duplicates'] += 1
                continue
            seen_hashes.add(img_hash)

            stem = os.path.splitext(img_file)[0]
            lbl_path = os.path.join(xiang_train_lbl_dir, stem + '.txt')
            trunk_lines = []
            if os.path.exists(lbl_path):
                with open(lbl_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and len(line.split()) >= 5:
                            trunk_lines.append(line)
                            stats['annotations_kept'] += 1
            if trunk_lines:
                all_pairs.append((img_path, trunk_lines))
                stats['images_with_trunk'] += 1
                xiang_added += 1

        print(f'  ✓ Xiang tree 加入: {xiang_added} 張')
    else:
        print('  ⚠️ 未找到 Xiang 訓練資料，跳過')

    # --- Phase 3: Oversampling ---
    print(f'\n📦 Phase 3: 學術資料加權 (Oversampling)')

    urban_pairs = [(p, l) for p, l in all_pairs if URBAN_CONVERTED_DIR in p]
    urban_os_count = 0
    for _ in range(URBAN_OVERSAMPLE):
        for pair in urban_pairs:
            all_pairs.append(pair)
            urban_os_count += 1

    xiang_pairs = [(p, l) for p, l in all_pairs if XIANG_TRAIN_DIR in p]
    xiang_os_count = 0
    for _ in range(XIANG_OVERSAMPLE):
        for pair in xiang_pairs:
            all_pairs.append(pair)
            xiang_os_count += 1

    print(f'  Urban Street:  {len(urban_pairs)} 原始 + {urban_os_count} 加權 = {len(urban_pairs) + urban_os_count} 有效')
    print(f'  Xiang tree:    {len(xiang_pairs)} 原始 + {xiang_os_count} 加權 = {len(xiang_pairs) + xiang_os_count} 有效')
    print(f'  Roboflow:      {roboflow_count} (1x)')
    academic_total = len(urban_pairs) + urban_os_count + len(xiang_pairs) + xiang_os_count
    print(f'  學術資料佔比:  {academic_total}/{len(all_pairs)} = {academic_total/len(all_pairs)*100:.1f}%')

    # --- 統計 ---
    print(f'\n📊 合併統計')
    print(f'  有效總計:        {len(all_pairs)}')
    print(f'  重複跳過:        {stats["duplicates"]}')
    print(f'  有 trunk 標註:   {stats["images_with_trunk"]}')
    print(f'  負樣本:          {stats["negative_samples"]}')
    print(f'  標註保留/移除:   {stats["annotations_kept"]} / {stats["annotations_removed"]}')

    # --- 重新分配 train/valid/test ---
    random.seed(42)
    random.shuffle(all_pairs)

    n = len(all_pairs)
    n_train = int(n * 0.80)
    n_valid = int(n * 0.15)

    train_pairs = all_pairs[:n_train]
    valid_pairs = all_pairs[n_train:n_train + n_valid]
    test_pairs = all_pairs[n_train + n_valid:]

    print(f'\n🔄 寫入合併資料集到磁碟...')
    for split_name, pairs in [('train', train_pairs), ('valid', valid_pairs), ('test', test_pairs)]:
        for i, (img_path, label_lines) in enumerate(pairs):
            if (i + 1) % 2000 == 0:
                print(f'  {split_name}: {i+1}/{len(pairs)}')
            ext = os.path.splitext(img_path)[1]
            new_name = f'{split_name}_{i:05d}'
            dst_img = os.path.join(MERGED_DIR, split_name, 'images', new_name + ext)
            dst_lbl = os.path.join(MERGED_DIR, split_name, 'labels', new_name + '.txt')
            try:
                os.link(img_path, dst_img)
            except OSError:
                shutil.copy2(img_path, dst_img)
            with open(dst_lbl, 'w') as f:
                f.write('\n'.join(label_lines) + '\n' if label_lines else '')

    print(f'\n  Split 分配:')
    print(f'    train: {len(train_pairs)}')
    print(f'    valid: {len(valid_pairs)}')
    print(f'    test:  {len(test_pairs)}')

    # 產生 data.yaml
    data_yaml_path = os.path.join(MERGED_DIR, 'data.yaml')
    data_config = {
        'path': MERGED_DIR,
        'train': 'train/images',
        'val': 'valid/images',
        'test': 'test/images',
        'nc': 1,
        'names': ['tree_trunk']
    }
    with open(data_yaml_path, 'w') as f:
        yaml.dump(data_config, f, default_flow_style=False)

    print(f'\n✅ 合併完成！data.yaml: {data_yaml_path}')
    print(f'   總影像數: {len(all_pairs)} 張')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 5：開始訓練！                                    ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 5：開始訓練！')
print('='*60)

import psutil

# GPU 自動偵測
if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_mem_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print(f'🖥️ GPU: {gpu_name} ({gpu_mem_gb:.1f} GB)')

    # 注意：validation 時 mask upsampling 需要額外 VRAM
    # batch 不能塞滿，要預留 ~15-20GB 給 val
    if gpu_mem_gb >= 90:
        auto_batch = 32 if IMAGE_SIZE >= 960 else 64
    elif gpu_mem_gb >= 70:
        auto_batch = 24 if IMAGE_SIZE >= 960 else 48
    elif gpu_mem_gb >= 35:
        auto_batch = 12 if IMAGE_SIZE >= 960 else 24
    elif gpu_mem_gb >= 20:
        auto_batch = 6 if IMAGE_SIZE >= 960 else 12
    else:
        auto_batch = 4 if IMAGE_SIZE >= 960 else 8

    BATCH_SIZE = BATCH_SIZE_OVERRIDE if BATCH_SIZE_OVERRIDE > 0 else auto_batch

    # ⚠️ workers=0 是關鍵！在 Colab 用 !python 跑腳本時
    #    multiprocessing workers 會造成死鎖，訓練永遠卡在第一個 epoch
    #    workers=0 = 主進程自己讀資料，穩定不死鎖
    WORKERS = 0

    # ⚠️ cache=True 在 ultralytics 裡其實是 RAM cache！
    #    必須用字串 'disk' 才是真正的磁碟快取
    cache_mode = 'disk'
    print(f'  Cache: Disk (穩定模式)')
    print(f'  Workers: {WORKERS} (防死鎖模式)')
else:
    BATCH_SIZE = 8
    WORKERS = 0
    cache_mode = 'disk'

# 訓練參數
if TRAINING_MODE == 'resume' and RESUME_MODEL_PATH:
    start_model = RESUME_MODEL_PATH
    LR0 = 0.0003
    LRF = 0.005
    WARMUP = 3
    PATIENCE = 50
    print(f'  🔄 續練: {RESUME_MODEL_PATH}, lr0={LR0}')
else:
    start_model = MODEL_SIZE
    LR0 = 0.001
    LRF = 0.01
    WARMUP = 5
    PATIENCE = 15  # 快速 early stop（模型已高度收斂）

    # --- 自動偵測上次訓練留下的 checkpoint ---
    if AUTO_RESUME_FROM_CRASH:
        _crash_candidates = [
            '/content/runs/segment/train/weights/best.pt',   # 優先用 best
            '/content/runs/segment/train/weights/last.pt',
            '/content/runs/segment/train2/weights/best.pt',
            '/content/runs/segment/train2/weights/last.pt',
            '/content/runs/segment/train3/weights/best.pt',
            '/content/runs/segment/train3/weights/last.pt',
        ]
        for _cp in _crash_candidates:
            if os.path.exists(_cp):
                start_model = _cp
                LR0 = 0.0005   # 已有不錯的權重，用較小 lr 繼續
                WARMUP = 2
                print(f'  🔁 偵測到上次 crash 的 checkpoint: {_cp}')
                print(f'     自動從該權重繼續訓練（不是從 epoch 0 COCO 重新來）')
                break
        else:
            print(f'  🆕 全新訓練: {MODEL_SIZE}, lr0={LR0}')
    else:
        print(f'  🆕 全新訓練: {MODEL_SIZE}, lr0={LR0}')

print(f'  Epochs: {EPOCHS}, Batch: {BATCH_SIZE}, ImgSz: {IMAGE_SIZE}, Workers: {WORKERS}')

# CNN 加速
torch.backends.cudnn.benchmark = True
if hasattr(torch.backends, 'cuda'):
    torch.backends.cuda.matmul.allow_tf32 = True
if hasattr(torch.backends, 'cudnn'):
    torch.backends.cudnn.allow_tf32 = True

from ultralytics import YOLO
model = YOLO(start_model)

start_time = time.time()

results = model.train(
    data=data_yaml_path,
    epochs=EPOCHS,
    batch=BATCH_SIZE,
    imgsz=IMAGE_SIZE,
    device=0,
    workers=WORKERS,
    cache=cache_mode,
    verbose=True,
    patience=PATIENCE,
    save=True,
    save_period=10,
    exist_ok=True,
    pretrained=True,
    optimizer='AdamW',
    lr0=LR0,
    lrf=LRF,
    warmup_epochs=WARMUP,
    cos_lr=True,
    # 資料增強
    hsv_h=0.02, hsv_s=0.6, hsv_v=0.4,
    degrees=15.0, translate=0.15, scale=0.5, shear=3.0,
    perspective=0.0005, flipud=0.0, fliplr=0.5,
    mosaic=0.9, mixup=0.15, copy_paste=0.15, erasing=0.15,
    # 分割設定
    overlap_mask=True, mask_ratio=1,
    amp=True, close_mosaic=15,
)

elapsed = time.time() - start_time
print(f'\n✓ 訓練完成！耗時 {elapsed/60:.1f} 分鐘')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 6：驗證模型品質                                  ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 6：驗證模型品質')
print('='*60)

best_pt = '/content/runs/segment/train/weights/best.pt'
if not os.path.exists(best_pt):
    for p in ['/content/runs/segment/train2/weights/best.pt',
              '/content/runs/segment/train3/weights/best.pt']:
        if os.path.exists(p):
            best_pt = p
            break

print(f'Model: {best_pt}')
size_mb = os.path.getsize(best_pt) / 1024 / 1024
print(f'Size: {size_mb:.1f} MB')

model = YOLO(best_pt)
metrics = model.val(data=data_yaml_path)

box_map50 = float(getattr(metrics.box, 'map50', 0))
seg_map50 = float(getattr(metrics.seg, 'map50', 0))
box_p = float(getattr(metrics.box, 'mp', 0))
box_r = float(getattr(metrics.box, 'mr', 0))

print(f'\n  Detection  mAP50: {box_map50:.3f}  P: {box_p:.3f}  R: {box_r:.3f}')
print(f'  Segment    mAP50: {seg_map50:.3f}')

if seg_map50 >= 0.85:
    print('\n✅ 模型品質優秀！可以匯出到手機')
elif seg_map50 >= 0.70:
    print('\n⚠️ 模型品質可以，但建議加更多訓練資料')
else:
    print('\n❌ 品質不足，需要更多資料或更長訓練')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 6.5：Xiang et al. 獨立分割品質驗證               ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 6.5：Xiang et al. 獨立分割品質驗證')
print('='*60)

xiang_yaml = os.path.join(XIANG_VAL, 'data.yaml')
xiang_img_dir = os.path.join(XIANG_VAL, 'images')

if os.path.exists(xiang_yaml):
    all_img_files = sorted([f for f in os.listdir(xiang_img_dir)
                            if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    n_val = len(all_img_files)
    print(f'  驗證子集: {n_val} 張')

    val_model = YOLO(best_pt)

    xiang_seg_map50 = 0
    try:
        xiang_metrics = val_model.val(data=xiang_yaml, verbose=False)
        xiang_seg_map50 = float(getattr(xiang_metrics.seg, 'map50', 0))
        xiang_box_map50 = float(getattr(xiang_metrics.box, 'map50', 0))
        print(f'  Box  mAP50:    {xiang_box_map50:.3f}')
        print(f'  Mask mAP50:    {xiang_seg_map50:.3f}')
    except Exception as e:
        print(f'  ⚠️ 驗證指標計算失敗: {e}')

    # 逐圖推論統計
    all_results = []
    for img_file in all_img_files:
        img_p = os.path.join(xiang_img_dir, img_file)
        preds = val_model.predict(img_p, verbose=False)
        n_det = len(preds[0].boxes)
        max_conf = float(preds[0].boxes.conf.max()) if n_det > 0 else 0.0
        mask_area_px = 0
        if preds[0].masks is not None and n_det > 0:
            best_idx = int(preds[0].boxes.conf.argmax())
            mask_data = preds[0].masks.data[best_idx].cpu().numpy()
            mask_area_px = int((mask_data > 0.5).sum())
        all_results.append({'file': img_file, 'detected': n_det > 0, 'conf': max_conf, 'mask_area_px': mask_area_px})

    n_detected = sum(1 for x in all_results if x['detected'])
    det_rate = n_detected / n_val * 100 if n_val > 0 else 0
    confs = [x['conf'] for x in all_results if x['detected']]
    avg_conf = np.mean(confs) if confs else 0

    print(f'\n  偵測率:     {n_detected}/{n_val} = {det_rate:.1f}%')
    print(f'  平均信心度: {avg_conf:.3f}')

    if xiang_seg_map50 >= 0.85 and det_rate >= 95:
        print(f'  🏆 優秀')
    elif xiang_seg_map50 >= 0.70 and det_rate >= 85:
        print(f'  ✅ 良好')
    else:
        print(f'  ⚠️ 待加強')
else:
    print('  ⚠️ 未找到 Xiang 驗證集，跳過')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 8：匯出模型                                     ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 8：匯出模型')
print('='*60)

export_dir = '/content/exported_models'
os.makedirs(export_dir, exist_ok=True)

TFLITE_EXPORT_SIZE = 640
ONNX_EXPORT_SIZE = IMAGE_SIZE

# TFLite INT8
print(f'  匯出 TFLite INT8 (imgsz={TFLITE_EXPORT_SIZE})...')
try:
    tflite_path = model.export(format='tflite', imgsz=TFLITE_EXPORT_SIZE, int8=True)
    if tflite_path:
        shutil.copy2(tflite_path, os.path.join(export_dir, 'tree_trunk_seg.tflite'))
        size = os.path.getsize(tflite_path) / 1024 / 1024
        print(f'  ✓ TFLite: {size:.1f} MB')
except Exception as e:
    print(f'  ✗ TFLite INT8 failed: {e}，嘗試 FP16...')
    try:
        tflite_path = model.export(format='tflite', imgsz=TFLITE_EXPORT_SIZE, half=True)
        if tflite_path:
            shutil.copy2(tflite_path, os.path.join(export_dir, 'tree_trunk_seg.tflite'))
            size = os.path.getsize(tflite_path) / 1024 / 1024
            print(f'  ✓ TFLite FP16: {size:.1f} MB')
    except Exception as e2:
        print(f'  ✗ TFLite FP16 also failed: {e2}')

# ONNX
print(f'  匯出 ONNX (imgsz={ONNX_EXPORT_SIZE})...')
try:
    onnx_path = model.export(format='onnx', imgsz=ONNX_EXPORT_SIZE, simplify=True)
    if onnx_path:
        shutil.copy2(onnx_path, os.path.join(export_dir, 'tree_trunk_seg.onnx'))
        size = os.path.getsize(onnx_path) / 1024 / 1024
        print(f'  ✓ ONNX: {size:.1f} MB')
except Exception as e:
    print(f'  ✗ ONNX failed: {e}')

# PyTorch
shutil.copy2(best_pt, os.path.join(export_dir, 'tree_trunk_seg_best.pt'))
print(f'  ✓ PyTorch: {os.path.getsize(best_pt) / 1024 / 1024:.1f} MB')

with open(os.path.join(export_dir, 'tree_trunk_labels.txt'), 'w') as f:
    f.write('tree_trunk\n')

print(f'\n所有模型已匯出到: {export_dir}')

# ╔══════════════════════════════════════════════════════╗
# ║  Step 9：打包下載                                      ║
# ╚══════════════════════════════════════════════════════╝
print('\n' + '='*60)
print('Step 9：打包下載')
print('='*60)

os.system('cd /content && zip -r exported_models.zip exported_models/')

try:
    from google.colab import files
    files.download('/content/exported_models.zip')
    print('\n✓ 下載開始！')
except Exception:
    print('\n⚠️ 自動下載失敗（可能不在 Colab 環境）')
    print('   請手動下載: /content/exported_models.zip')

print('\n下載後的部署步驟：')
print('  1. tree_trunk_seg.tflite → frontend/assets/ml/')
print('  2. tree_trunk_labels.txt → frontend/assets/ml/')
print('  3. tree_trunk_seg.onnx   → backend/ml_service/models/')
print('  4. tree_trunk_seg_best.pt → 保留備份（日後可繼續訓練）')

print('\n' + '='*60)
print('🎉 全部完成！')
print('='*60)
