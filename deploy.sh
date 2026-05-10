#!/usr/bin/env bash
# deploy.sh — Pull latest code and redeploy ScholarAI with zero-downtime strategy
# Usage: ./deploy.sh [branch]
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${1:-main}"
COMPOSE="docker compose"

log()  { echo "[deploy $(date '+%H:%M:%S')] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

cd "$APP_DIR"

# ─── 1. Pull latest code ──────────────────────────────────────────────────────
log "Pulling latest code from branch '$BRANCH'..."
git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# ─── 2. Validate env files exist ─────────────────────────────────────────────
[ -f backend/.env ]      || fail "backend/.env missing — copy from backend/.env.example"
[ -f frontend/.env.local ] || fail "frontend/.env.local missing — copy from frontend/.env.example"

# ─── 3. Build new images ──────────────────────────────────────────────────────
log "Building Docker images..."
$COMPOSE build --pull --no-cache

# ─── 4. Start / replace containers ───────────────────────────────────────────
log "Starting services..."
$COMPOSE up -d --remove-orphans

# ─── 5. Remove dangling images ────────────────────────────────────────────────
log "Cleaning up old images..."
docker image prune -f --filter "dangling=true"

# ─── 6. Health check ─────────────────────────────────────────────────────────
log "Waiting for backend to become healthy..."
MAX_WAIT=60
ELAPSED=0
until curl -sf http://localhost/api/ > /dev/null 2>&1; do
    sleep 3
    ELAPSED=$((ELAPSED + 3))
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        fail "Backend did not become healthy within ${MAX_WAIT}s"
    fi
done

log "All services are up!"
$COMPOSE ps
