#!/bin/bash
# ============================================================
# Tree ML Service — 自架啟動腳本
# ============================================================
# 使用方式:
#   cd ~/tree-ml-service/tree-project-backend/ml_service
#   ./self_host/start.sh
#
# 環境變數 (可在 .env 中設定):
#   ML_API_KEY          - API 認證金鑰 (必須設定!)
#   ML_CORS_ORIGINS     - 允許的 CORS 來源 (逗號分隔)
#   ML_RATE_LIMIT       - 每小時每 IP 最大請求數 (預設 30)
#   ML_DEBUG            - 設為 "true" 啟用 /docs 端點
#   PORT                - 服務埠號 (預設 8000)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ML_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="${ML_DIR}/venv"
PID_FILE="/tmp/tree-ml.pid"
LOG_DIR="${ML_DIR}/logs"
ENV_FILE="${ML_DIR}/self_host/.env"

echo "🌲 Tree ML Service 啟動中..."
echo "   目錄: ${ML_DIR}"

# 載入 .env 檔案
if [ -f "$ENV_FILE" ]; then
    echo "📋 載入環境變數: ${ENV_FILE}"
    set -a
    source "$ENV_FILE"
    set +a
fi

# 檢查 ML_API_KEY 是否設定
if [ -z "$ML_API_KEY" ]; then
    echo ""
    echo "⚠️  警告: ML_API_KEY 未設定！"
    echo "   所有 ML 端點將不需要認證（不安全）"
    echo ""
    echo "   設定方式："
    echo "   1. 編輯 ${ENV_FILE}"
    echo "   2. 加入: ML_API_KEY=你的隨機金鑰"
    echo ""
    read -p "   是否繼續？ (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消。"
        exit 1
    fi
fi

# 建立 logs 目錄
mkdir -p "$LOG_DIR"

# 檢查虛擬環境
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 建立 Python 虛擬環境..."
    python3 -m venv "$VENV_DIR"
    source "${VENV_DIR}/bin/activate"
    echo "📦 安裝依賴套件..."
    pip install --upgrade pip
    pip install -r "${ML_DIR}/requirements.txt"
else
    source "${VENV_DIR}/bin/activate"
fi

# 檢查是否已有服務在跑
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "⚠️  服務已經在執行 (PID: ${OLD_PID})"
        echo "   執行 ./self_host/stop.sh 停止後再啟動"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# 設定環境變數
export TRANSFORMERS_CACHE=~/.cache/huggingface
export HF_HOME=~/.cache/huggingface
export PORT=${PORT:-8000}

cd "$ML_DIR"

echo ""
echo "🔧 設定:"
echo "   Port: ${PORT}"
echo "   API Key: ${ML_API_KEY:+已設定}"
echo "   CORS: ${ML_CORS_ORIGINS:-預設}"
echo "   Rate Limit: ${ML_RATE_LIMIT:-30}/hour"
echo ""

# 啟動 gunicorn (背景)
gunicorn app:app \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT}" \
    --timeout 180 \
    --daemon \
    --pid "$PID_FILE" \
    --access-logfile "${LOG_DIR}/access.log" \
    --error-logfile "${LOG_DIR}/error.log"

# 等待服務啟動
echo "⏳ 等待服務啟動..."
sleep 3

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "✅ ML Service 已啟動!"
    echo "   PID: $(cat "$PID_FILE")"
    echo "   URL: http://localhost:${PORT}"
    echo "   Health: http://localhost:${PORT}/health"
    echo ""
    echo "📋 下一步："
    echo "   1. 啟動 ngrok:  ngrok http ${PORT}"
    echo "   2. 在 App 中設定 ML 服務 URL 和 API Key"
    echo ""
    echo "📝 查看 log:"
    echo "   tail -f ${LOG_DIR}/error.log"
    echo ""
    echo "🛑 停止服務:"
    echo "   ./self_host/stop.sh"
else
    echo "❌ 啟動失敗！查看 log:"
    echo "   cat ${LOG_DIR}/error.log"
    exit 1
fi
