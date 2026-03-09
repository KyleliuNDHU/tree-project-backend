#!/usr/bin/env python3
"""
TFLite 匯出腳本 — 繞過 CUDA 衝突
==================================
問題：Colab 上 PyTorch 訓練後，TensorFlow/onnx2tf 無論如何都會嘗試用 GPU，
      導致 CUDA_ERROR_INVALID_HANDLE。CUDA_VISIBLE_DEVICES 在 Colab 環境下無效。

解法：
  方法 A: 用 onnx2tf CLI（shell 層面隔離），完全不經 Python TF
  方法 B: 如果 A 也失敗，用 onnx → saved_model → tflite 手動流程
  方法 C: 如果都失敗，先 restart runtime 再單獨跑此腳本

使用方式：
  1. 確保已有 ONNX 檔（train_n_s_models.py 會自動產生）
  2. 在 Colab 新 cell 跑: !python export_tflite.py
  3. 或在 restart runtime 後跑（最可靠）
"""

import os, sys, glob, shutil, subprocess

EXPORT_DIR = '/content/exported_models'
TFLITE_EXPORT_SIZE = 640

MODELS = [
    ('tree_trunk_seg_n', 'nano'),
]


def method_a_onnx2tf_cli(onnx_path, output_dir):
    """方法 A: 用 shell 呼叫 onnx2tf CLI，完全隔離 CUDA"""
    print('  [方法 A] onnx2tf CLI...')

    # 用 shell 設定環境變數，確保在 CUDA driver 初始化前生效
    cmd = (
        f'CUDA_VISIBLE_DEVICES=-1 '
        f'onnx2tf -i "{onnx_path}" '
        f'-o "{output_dir}" '
        f'-osd '       # output_signaturedefs
        f'-cotof '     # check_onnx_tf_output_shape（跳過驗證加速）
        f'--non_verbose '
    )

    result = subprocess.run(
        cmd, shell=True,
        capture_output=True, text=True,
        timeout=600,
        env={**os.environ, 'CUDA_VISIBLE_DEVICES': '-1'},
    )

    if result.returncode != 0:
        # 印出錯誤但不要太長
        stderr = result.stderr[-500:] if len(result.stderr) > 500 else result.stderr
        print(f'  ✗ onnx2tf CLI 失敗: {stderr}')
        return None

    # 找 .tflite
    tflite_files = glob.glob(os.path.join(output_dir, '*.tflite'))
    if not tflite_files:
        tflite_files = glob.glob(os.path.join(output_dir, '**', '*.tflite'), recursive=True)

    if tflite_files:
        # 選最大的（通常是 float 版本）
        tflite_files.sort(key=os.path.getsize, reverse=True)
        return tflite_files[0]
    return None


def method_b_ultralytics_subprocess(pt_path, output_dir):
    """方法 B: 用完全獨立的 Python 子程序跑 ultralytics export"""
    print('  [方法 B] ultralytics export 子程序...')

    # 寫一個臨時 Python 腳本，在全新環境中執行
    tmp_script = '/tmp/_tflite_export_worker.py'
    with open(tmp_script, 'w') as f:
        f.write(f'''
import os
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
# 必須在 import tensorflow 前就設好

# 額外嘗試禁用 TF GPU
try:
    import tensorflow as tf
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        tf.config.set_visible_devices([], 'GPU')
except:
    pass

from ultralytics import YOLO
model = YOLO("{pt_path}")
result = model.export(format='tflite', imgsz={TFLITE_EXPORT_SIZE})
print(f'EXPORT_RESULT:{{result}}')
''')

    result = subprocess.run(
        ['python3', tmp_script],
        capture_output=True, text=True,
        timeout=600,
        env={**os.environ, 'CUDA_VISIBLE_DEVICES': '-1'},
    )

    os.remove(tmp_script)

    if result.returncode != 0:
        stderr = result.stderr[-500:] if len(result.stderr) > 500 else result.stderr
        print(f'  ✗ ultralytics 子程序失敗: {stderr}')
        return None

    # 從 stdout 找結果路徑
    for line in result.stdout.split('\n'):
        if 'EXPORT_RESULT:' in line:
            path = line.split('EXPORT_RESULT:')[1].strip()
            if path and path != 'None':
                if os.path.isdir(path):
                    tflite_files = glob.glob(os.path.join(path, '*.tflite'))
                    if tflite_files:
                        return tflite_files[0]
                elif os.path.exists(path):
                    return path

    # 搜尋可能的輸出位置
    for search_dir in [output_dir, '/content/runs']:
        tflite_files = glob.glob(os.path.join(search_dir, '**', '*.tflite'), recursive=True)
        if tflite_files:
            tflite_files.sort(key=os.path.getmtime, reverse=True)
            return tflite_files[0]

    return None


def method_c_manual_convert(onnx_path, output_dir):
    """方法 C: 手動 ONNX → SavedModel → TFLite（最後手段）"""
    print('  [方法 C] 手動 onnx2tf + tflite_convert...')

    saved_model_dir = os.path.join(output_dir, 'saved_model')

    # Step 1: onnx2tf 只輸出 SavedModel（不要 tflite）
    cmd_sm = (
        f'CUDA_VISIBLE_DEVICES=-1 '
        f'onnx2tf -i "{onnx_path}" '
        f'-o "{saved_model_dir}" '
        f'-osd '
        f'--non_verbose '
    )
    r1 = subprocess.run(
        cmd_sm, shell=True,
        capture_output=True, text=True,
        timeout=600,
        env={**os.environ, 'CUDA_VISIBLE_DEVICES': '-1'},
    )

    if r1.returncode != 0:
        print(f'  ✗ SavedModel 轉換失敗')
        return None

    # Step 2: 用 tflite_convert CLI 轉換
    tflite_out = os.path.join(output_dir, 'model.tflite')
    cmd_tfl = (
        f'CUDA_VISIBLE_DEVICES=-1 '
        f'tflite_convert '
        f'--saved_model_dir="{saved_model_dir}" '
        f'--output_file="{tflite_out}" '
    )
    r2 = subprocess.run(
        cmd_tfl, shell=True,
        capture_output=True, text=True,
        timeout=300,
        env={**os.environ, 'CUDA_VISIBLE_DEVICES': '-1'},
    )

    if r2.returncode == 0 and os.path.exists(tflite_out):
        return tflite_out

    print(f'  ✗ tflite_convert 也失敗')
    return None


def export_one(output_name, size_name):
    pt_path = os.path.join(EXPORT_DIR, f'{output_name}_best.pt')
    onnx_path = os.path.join(EXPORT_DIR, f'{output_name}.onnx')
    tflite_dst = os.path.join(EXPORT_DIR, f'{output_name}.tflite')

    if os.path.exists(tflite_dst):
        size_mb = os.path.getsize(tflite_dst) / 1024 / 1024
        print(f'  ⏭️  {size_name}: TFLite 已存在 ({size_mb:.1f} MB)，跳過')
        return True

    if not os.path.exists(onnx_path) and not os.path.exists(pt_path):
        print(f'  ❌ {size_name}: 無 ONNX 也無 best.pt，跳過')
        return False

    # 如果沒有 ONNX，先從 pt 匯出
    if not os.path.exists(onnx_path):
        print(f'  📦 從 best.pt 匯出 ONNX...')
        cmd = (
            f'CUDA_VISIBLE_DEVICES=-1 python3 -c "'
            f'from ultralytics import YOLO; '
            f'model = YOLO(\\"{pt_path}\\"); '
            f'model.export(format=\\"onnx\\", imgsz={TFLITE_EXPORT_SIZE}, simplify=True)'
            f'"'
        )
        subprocess.run(cmd, shell=True, timeout=120,
                       env={**os.environ, 'CUDA_VISIBLE_DEVICES': '-1'})
        # ultralytics 會把 onnx 放在 pt 旁邊
        possible_onnx = pt_path.replace('_best.pt', '_best.onnx')
        if os.path.exists(possible_onnx):
            shutil.copy2(possible_onnx, onnx_path)
        if not os.path.exists(onnx_path):
            print(f'  ❌ ONNX 匯出失敗')
            return False

    print(f'\n📦 匯出 {size_name} TFLite')
    print(f'   ONNX: {onnx_path} ({os.path.getsize(onnx_path)/1024/1024:.1f} MB)')

    tmp_dir = f'/tmp/tflite_export_{output_name}'
    os.makedirs(tmp_dir, exist_ok=True)

    # 依序嘗試三種方法
    for method_fn, method_name in [
        (method_a_onnx2tf_cli, 'A'),
        (method_b_ultralytics_subprocess, 'B'),
        (method_c_manual_convert, 'C'),
    ]:
        try:
            if method_name == 'B':
                result_path = method_fn(pt_path, tmp_dir)
            else:
                result_path = method_fn(onnx_path, tmp_dir)

            if result_path and os.path.exists(result_path):
                shutil.copy2(result_path, tflite_dst)
                size_mb = os.path.getsize(tflite_dst) / 1024 / 1024
                print(f'  ✅ TFLite 匯出成功（方法 {method_name}）: {size_mb:.1f} MB')

                # 清理暫存
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return True
        except Exception as e:
            print(f'  ✗ 方法 {method_name} 例外: {e}')

    # 清理暫存
    shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f'  ❌ {size_name} 所有方法都失敗')
    print(f'  💡 建議：Restart runtime 後直接跑 !python export_tflite.py')
    return False


if __name__ == '__main__':
    print('='*60)
    print('TFLite 匯出（多方法嘗試，繞過 CUDA 衝突）')
    print('='*60)

    success = 0
    total = 0
    for output_name, size_name in MODELS:
        pt_path = os.path.join(EXPORT_DIR, f'{output_name}_best.pt')
        onnx_path = os.path.join(EXPORT_DIR, f'{output_name}.onnx')
        if os.path.exists(pt_path) or os.path.exists(onnx_path):
            total += 1
            if export_one(output_name, size_name):
                success += 1

    print(f'\n{"✅" if success == total else "⚠️"} TFLite 匯出: {success}/{total} 成功')

    if success < total:
        print('\n💡 如果全部失敗，試試：')
        print('   1. Runtime → Restart runtime')
        print('   2. 第一個 cell 只跑: !python export_tflite.py')
        print('   （不要先跑訓練腳本，避免 CUDA 污染）')

    sys.exit(0 if success == total else 1)
