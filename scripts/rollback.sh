#!/bin/bash
# ============================================================
# Tree App — Rollback 腳本
# ============================================================
# 使用方式:
#   /opt/tree-app/scripts/rollback.sh              # 回到上一個成功的 commit
#   /opt/tree-app/scripts/rollback.sh <commit>     # 回到指定 commit
#   /opt/tree-app/scripts/rollback.sh --list       # 列出最近 10 個 commit
#
# 注意: 此腳本只回退代碼和服務，不會回退資料庫變更。
#       如需回退資料庫，請使用 backup_db.sh 的備份檔案。
# ============================================================

set -euo pipefail

BACKEND_DIR="/opt/tree-app/backend"
LOG_DIR="/opt/tree-app/logs"
DEPLOY_LOG="$LOG_DIR/deploy.log"
ROLLBACK_FILE="$BACKEND_DIR/.last_good_commit"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ROLLBACK] $1" | tee -a "$DEPLOY_LOG"
}

cd "$BACKEND_DIR"

# --help
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "Usage: $0 [commit_hash] [--list] [--help]"
    echo ""
    echo "Options:"
    echo "  (no args)    Roll back to last known good commit"
    echo "  <commit>     Roll back to specified commit hash"
    echo "  --list       Show recent 10 commits and last good commit"
    echo "  -h, --help   Show this help"
    echo ""
    echo "Note: This only rolls back code + services, NOT database."
    echo "      For DB rollback, use backups in /opt/tree-app/backups/"
    exit 0
fi

# --list: show recent commits
if [ "${1:-}" = "--list" ]; then
    echo "=== Recent 10 commits ==="
    git log --oneline -10
    echo ""
    if [ -f "$ROLLBACK_FILE" ]; then
        echo "Last known good commit: $(cat "$ROLLBACK_FILE")"
    fi
    exit 0
fi

# Determine target commit
if [ -n "${1:-}" ]; then
    TARGET="$1"
else
    if [ -f "$ROLLBACK_FILE" ]; then
        TARGET=$(cat "$ROLLBACK_FILE")
    else
        echo "ERROR: No rollback point found. Specify a commit hash."
        echo "Usage: $0 [commit_hash|--list]"
        exit 1
    fi
fi

CURRENT=$(git rev-parse HEAD)
log "========== Rollback started =========="
log "Current: $CURRENT"
log "Target:  $TARGET"

if [ "$CURRENT" = "$TARGET" ]; then
    log "Already at target commit. Nothing to do."
    exit 0
fi

# Verify commit exists
if ! git cat-file -t "$TARGET" > /dev/null 2>&1; then
    log "ERROR: Commit $TARGET not found in repository."
    exit 1
fi

# Rollback
log "Checking out $TARGET..."
git checkout "$TARGET" 2>&1 | tee -a "$DEPLOY_LOG"

log "Installing dependencies..."
npm install --production 2>&1 | tail -3 | tee -a "$DEPLOY_LOG"

log "Reloading PM2..."
pm2 reload tree-backend 2>&1 | tee -a "$DEPLOY_LOG"

# Verify
sleep 5
if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
    log "Health check PASSED after rollback"
    log "Rollback complete: $CURRENT → $TARGET"
else
    log "WARNING: Health check failed after rollback!"
    log "Manual intervention may be needed."
    exit 1
fi

log "========== Rollback finished =========="
echo ""
echo "Rolled back to: $TARGET"
echo "To return to main branch: cd $BACKEND_DIR && git checkout main && git pull"
