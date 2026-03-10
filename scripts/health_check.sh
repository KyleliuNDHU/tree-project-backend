#!/bin/bash
# ============================================================
# Tree App — Health Check 腳本
# ============================================================
# Crontab: */5 * * * * /opt/tree-app/scripts/health_check.sh
# ============================================================

LOG="/opt/tree-app/logs/health.log"

# --help
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "Usage: $0"
    echo ""
    echo "Checks backend health and auto-restarts if down."
    echo "Logs to: $LOG"
    echo ""
    echo "Crontab: */5 * * * * $0"
    exit 0
fi

# Backend health
if ! curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Backend DOWN — restarting" >> "$LOG"
    pm2 restart tree-backend >> "$LOG" 2>&1
fi
