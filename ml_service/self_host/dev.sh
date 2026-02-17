#!/bin/bash
# ============================================================
# Tree ML Service — 開發模式啟動 (前景執行，看即時 log)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ML_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="${ML_DIR}/venv"
ENV_FILE="${ML_DIR}/self_host/.env"

# 載入 .env
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# 建立/啟用虛擬環境
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 建立 Python 虛擬環境..."
    python3 -m venv "$VENV_DIR"
    source "${VENV_DIR}/bin/activate"
    pip install --upgrade pip
    pip install -r "${ML_DIR}/requirements.txt"
else
    source "${VENV_DIR}/bin/activate"
fi

export TRANSFORMERS_CACHE=~/.cache/huggingface
export HF_HOME=~/.cache/huggingface
export PORT=${PORT:-8000}

cd "$ML_DIR"

echo "🌲 Tree ML Service (開發模式)"
echo "   URL: http://localhost:${PORT}"
echo "   API Key: ${ML_API_KEY:+已設定}"
echo "   Ctrl+C 停止"
echo ""

uvicorn app:app --host 0.0.0.0 --port "${PORT}" --reload
