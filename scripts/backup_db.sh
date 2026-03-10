#!/bin/bash
# ============================================================
# Tree App — 資料庫備份腳本
# ============================================================
# Crontab: 0 3 * * * /opt/tree-app/scripts/backup_db.sh
# 手動:    /opt/tree-app/scripts/backup_db.sh
# ============================================================

set -euo pipefail

BACKUP_DIR="/opt/tree-app/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETAIN_DAYS=30

mkdir -p "$BACKUP_DIR"

DUMP_FILE="$BACKUP_DIR/tree_survey_$TIMESTAMP.dump"

# Help
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "Usage: $0"
    echo ""
    echo "PostgreSQL backup for tree_survey database."
    echo "Backups are saved to: $BACKUP_DIR"
    echo "Retention: $RETAIN_DAYS days"
    echo ""
    echo "Crontab: 0 3 * * * $0"
    exit 0
fi

# Load DB password from .env
ENV_FILE="/opt/tree-app/backend/.env"
if [ -f "$ENV_FILE" ]; then
    DB_PASS=$(grep -oP 'postgresql://[^:]+:\K[^@]+' "$ENV_FILE" 2>/dev/null || echo "")
fi
if [ -z "${DB_PASS:-}" ]; then
    echo "ERROR: Cannot extract DB password from $ENV_FILE"
    exit 1
fi

PGPASSWORD="$DB_PASS" pg_dump \
    -U tree_app -h 127.0.0.1 tree_survey \
    --format=custom --no-owner --no-privileges \
    -f "$DUMP_FILE"

# Clean up old backups
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETAIN_DAYS -delete

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "$(date '+%Y-%m-%d %H:%M:%S') Backup done: $DUMP_FILE ($SIZE)"
