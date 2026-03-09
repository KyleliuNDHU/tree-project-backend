#!/bin/bash
# ============================================================
# Tree App — 自動部署腳本 (取代 Render auto-deploy)
# ============================================================
# 使用方式:
#   /opt/tree-app/scripts/deploy.sh              # 正常部署 (pull + migrate + restart)
#   /opt/tree-app/scripts/deploy.sh --skip-migrate  # 跳過 migration
#   /opt/tree-app/scripts/deploy.sh --dry-run     # 只拉取，不重啟
#
# 此腳本會:
#   1. 記錄當前 commit 為 rollback 點
#   2. git pull 最新代碼
#   3. npm install --production
#   4. 執行 DB migration (可跳過)
#   5. PM2 graceful reload (zero-downtime)
#   6. 驗證 health check
#   7. 失敗時自動 rollback
# ============================================================

set -euo pipefail

BACKEND_DIR="/opt/tree-app/backend"
LOG_DIR="/opt/tree-app/logs"
DEPLOY_LOG="$LOG_DIR/deploy.log"
ROLLBACK_FILE="$BACKEND_DIR/.last_good_commit"

SKIP_MIGRATE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-migrate) SKIP_MIGRATE=true; shift ;;
        --dry-run)      DRY_RUN=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--skip-migrate] [--dry-run]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$DEPLOY_LOG"
}

mkdir -p "$LOG_DIR"

log "========== Deploy started =========="
cd "$BACKEND_DIR"

# 1. Save current commit as rollback point
PREV_COMMIT=$(git rev-parse HEAD)
log "Current commit: $PREV_COMMIT"

# Save as last known good (only if health is OK now)
if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "$PREV_COMMIT" > "$ROLLBACK_FILE"
    log "Saved rollback point: $PREV_COMMIT"
fi

# 2. Pull latest
log "Pulling latest from origin/main..."
GIT_OUTPUT=$(git pull origin main 2>&1)
log "$GIT_OUTPUT"

NEW_COMMIT=$(git rev-parse HEAD)
if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
    log "Already up to date. No deploy needed."
    exit 0
fi

log "New commit: $NEW_COMMIT"
CHANGES=$(git log --oneline "$PREV_COMMIT".."$NEW_COMMIT" 2>/dev/null || echo "N/A")
log "Changes:\n$CHANGES"

if [ "$DRY_RUN" = true ]; then
    log "Dry run — skipping install/migrate/restart."
    exit 0
fi

# 3. Install dependencies
log "Installing dependencies..."
npm install --production 2>&1 | tail -3 | tee -a "$DEPLOY_LOG"

# 4. Run migrations
if [ "$SKIP_MIGRATE" = false ]; then
    log "Running database migration..."
    if ! node scripts/migrate.js 2>&1 | tee -a "$DEPLOY_LOG"; then
        log "ERROR: Migration failed! Rolling back..."
        git checkout "$PREV_COMMIT" 2>&1 | tee -a "$DEPLOY_LOG"
        npm install --production 2>&1 | tail -3 | tee -a "$DEPLOY_LOG"
        log "Rolled back to $PREV_COMMIT"
        exit 1
    fi
fi

# 5. Graceful reload (zero-downtime for cluster mode)
log "Reloading PM2 (graceful)..."
pm2 reload tree-backend 2>&1 | tee -a "$DEPLOY_LOG"

# 6. Wait and verify health
sleep 5
HEALTH_OK=false
for i in 1 2 3; do
    if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    log "Health check attempt $i failed, retrying in 3s..."
    sleep 3
done

if [ "$HEALTH_OK" = true ]; then
    log "Health check PASSED"
    echo "$NEW_COMMIT" > "$ROLLBACK_FILE"
    log "Deploy complete: $PREV_COMMIT → $NEW_COMMIT"
else
    log "ERROR: Health check FAILED after deploy!"
    log "Auto-rolling back to $PREV_COMMIT..."
    git checkout "$PREV_COMMIT" 2>&1 | tee -a "$DEPLOY_LOG"
    npm install --production 2>&1 | tail -3 | tee -a "$DEPLOY_LOG"
    pm2 reload tree-backend 2>&1 | tee -a "$DEPLOY_LOG"
    sleep 3
    log "Rollback complete. Current commit: $(git rev-parse HEAD)"
    exit 1
fi

log "========== Deploy finished =========="
