#!/usr/bin/env bash
# startup.sh — Bootstrap a fresh Ubuntu/Debian VM for ScholarAI
# Usage: curl -sSL <raw-url>/startup.sh | bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_ORG/ScholarAI.git}"
APP_DIR="${APP_DIR:-/opt/scholarai}"
BRANCH="${BRANCH:-main}"

log()  { echo "[startup] $*"; }
fail() { echo "[startup] ERROR: $*" >&2; exit 1; }

# ─── 1. System updates ────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git unzip ca-certificates gnupg lsb-release

# ─── 2. Install Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
else
    log "Docker already installed: $(docker --version)"
fi

# ─── 3. Install Docker Compose v2 (standalone) ───────────────────────────────
if ! docker compose version &>/dev/null 2>&1; then
    log "Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
fi
log "Docker Compose: $(docker compose version)"

# ─── 4. Clone / pull repository ──────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    log "Repository already exists, pulling latest..."
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
    log "Cloning repository to $APP_DIR..."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ─── 5. Environment files ─────────────────────────────────────────────────────
log "Setting up environment files..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
    log "  Created backend/.env from example — EDIT IT before starting!"
fi
if [ ! -f "$APP_DIR/frontend/.env.local" ]; then
    cp "$APP_DIR/frontend/.env.example" "$APP_DIR/frontend/.env.local"
    log "  Created frontend/.env.local from example — EDIT IT before starting!"
fi

# ─── 6. Firewall (ufw) ────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    log "Configuring firewall..."
    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
fi

# ─── 7. Create systemd service for auto-restart on reboot ────────────────────
cat > /etc/systemd/system/scholarai.service <<EOF
[Unit]
Description=ScholarAI Docker Compose Application
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable scholarai

log ""
log "═══════════════════════════════════════════════════════"
log " Bootstrap complete!"
log " Next steps:"
log "   1. Edit $APP_DIR/backend/.env with your secrets"
log "   2. Edit $APP_DIR/frontend/.env.local with your config"
log "   3. Run: cd $APP_DIR && docker compose up -d --build"
log "═══════════════════════════════════════════════════════"
