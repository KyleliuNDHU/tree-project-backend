#!/bin/bash
# ============================================================
# Tree App — Health Check 腳本
# ============================================================
# Crontab: */5 * * * * /opt/tree-app/scripts/health_check.sh
# ============================================================

LOG="/opt/tree-app/logs/health.log"

# Backend health
if ! curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Backend DOWN — restarting" >> "$LOG"
    pm2 restart tree-backend >> "$LOG" 2>&1
fi
