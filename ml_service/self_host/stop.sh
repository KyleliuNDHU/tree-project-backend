#!/bin/bash
# ============================================================
# Tree ML Service — 停止腳本
# ============================================================

PID_FILE="/tmp/tree-ml.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "ℹ️  沒有找到 PID 檔案，服務可能未啟動"
    
    # 嘗試找到 gunicorn 程序
    PIDS=$(pgrep -f "gunicorn app:app" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "🔍 找到 gunicorn 程序: $PIDS"
        kill $PIDS 2>/dev/null
        echo "✅ 已停止 gunicorn 程序"
    else
        echo "✅ 服務未在執行"
    fi
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    echo "🛑 停止 ML Service (PID: $PID)..."
    kill "$PID"
    
    # 等待程序結束
    for i in {1..10}; do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    
    # 如果還沒結束，強制結束
    if kill -0 "$PID" 2>/dev/null; then
        echo "⚠️  程序未回應，強制結束..."
        kill -9 "$PID" 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    echo "✅ ML Service 已停止"
else
    echo "ℹ️  程序 (PID: $PID) 已經不存在"
    rm -f "$PID_FILE"
fi
