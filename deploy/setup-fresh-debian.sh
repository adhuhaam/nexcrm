#!/usr/bin/env bash
# Idempotent stack setup for a fresh Debian GNOME office server (JACMS / nexcrm).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_USER="${JACMS_SERVER_USER:-server}"
REPO_DIR="${JACMS_REPO_DIR:-/home/${SERVER_USER}/dev/nexcrm}"
FILES_DIR="${JACMS_FILES_DIR:-/home/${SERVER_USER}/JACMS-Files}"
NODE_MAJOR="${JACMS_NODE_MAJOR:-22}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() { echo "==> $*"; }

ensure_user() {
  if id "$SERVER_USER" &>/dev/null; then
    log "Unix user $SERVER_USER exists"
    return
  fi
  log "Creating user $SERVER_USER"
  adduser --disabled-password --gecos "" "$SERVER_USER" || adduser "$SERVER_USER"
  usermod -aG sudo "$SERVER_USER" 2>/dev/null || true
}

base_packages() {
  log "Base packages (git, build tools, curl, nginx deps)"
  apt-get update -qq
  apt-get install -y -qq \
    curl ca-certificates gnupg git build-essential sudo ufw \
    nginx postgresql postgresql-contrib \
    fonts-dejavu-core fonts-liberation \
    imagemagick ghostscript poppler-utils \
    libvips-tools
}

install_node() {
  if command -v node >/dev/null; then
    local ver
    ver="$(node --version)"
    log "Node already installed: $ver"
    return
  fi
  log "Installing Node.js ${NODE_MAJOR}.x (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  node --version
  npm --version
}

install_cloudflared() {
  if command -v cloudflared >/dev/null; then
    log "cloudflared: $(cloudflared --version | head -1)"
    return
  fi
  log "Installing cloudflared"
  ARCH="$(dpkg --print-architecture)"
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" \
    -o "$TMP/cloudflared.deb"
  dpkg -i "$TMP/cloudflared.deb" || apt-get install -f -y -qq
  rm -rf "$TMP"
}

install_tailscale() {
  if command -v tailscale >/dev/null; then
    log "Tailscale already installed"
    return
  fi
  if [[ "${JACMS_INSTALL_TAILSCALE:-0}" != "1" ]]; then
    log "Skipping Tailscale (set JACMS_INSTALL_TAILSCALE=1 to install)"
    return
  fi
  log "Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
}

postgres_bootstrap() {
  log "PostgreSQL role/database (nexcrm)"
  systemctl enable postgresql
  systemctl start postgresql || true
  sudo -u postgres createuser --createdb nexcrm 2>/dev/null || true
  sudo -u postgres createdb -O nexcrm nexcrm_dev 2>/dev/null || true
}

jacms_files_dir() {
  log "JACMS-Files at $FILES_DIR"
  install -d -m 0755 -o "$SERVER_USER" -g "$SERVER_USER" "$FILES_DIR"
}

app_from_repo() {
  if [[ ! -f "$ROOT/package.json" ]]; then
    log "WARN: expected repo at $ROOT"
  fi
  if [[ ! -d "$REPO_DIR/.git" && -d "$ROOT/.git" && "$ROOT" != "$REPO_DIR" ]]; then
    log "Cloning/sync: use $ROOT on this host or copy to $REPO_DIR"
  fi
  local work="$ROOT"
  if [[ -f "$REPO_DIR/package.json" ]]; then work="$REPO_DIR"; fi

  if [[ -f "$work/.env.example" && ! -f "$work/.env" ]]; then
    log "Creating $work/.env from template"
    sudo -u "$SERVER_USER" cp "$work/.env.example" "$work/.env"
    if grep -q '^FILE_ROOT=' "$work/.env"; then
      sudo -u "$SERVER_USER" sed -i "s|^FILE_ROOT=.*|FILES_DIR=${FILES_DIR}|" "$work/.env" || true
    fi
    echo "FILES_DIR=${FILES_DIR}" | sudo -u "$SERVER_USER" tee -a "$work/.env" >/dev/null || true
  fi

  if [[ -f "$work/package.json" ]]; then
    log "npm install (API + web) in $work"
    sudo -u "$SERVER_USER" bash -lc "cd '$work' && npm install"
    if [[ -f "$work/web/package.json" ]]; then
      sudo -u "$SERVER_USER" bash -lc "cd '$work/web' && npm install && npm run build"
    fi
  fi
}

systemd_stack() {
  log "systemd: nexcrm, nginx, postgresql"
  if [[ -f "$ROOT/deploy/install-web-nginx.sh" ]]; then
    bash "$ROOT/deploy/install-web-nginx.sh"
  fi
  if [[ -f "$ROOT/deploy/ensure-boot.sh" ]]; then
    bash "$ROOT/deploy/ensure-boot.sh" || log "ensure-boot reported issues — run verify-server.sh"
  fi
}

gnome_autostart() {
  log "GNOME autostart entries (nexcrm browser + optional Cursor)"
  install -d -m 0755 -o "$SERVER_USER" -g "$SERVER_USER" "/home/${SERVER_USER}/.config/autostart"
  if [[ -f "$ROOT/deploy/nexcrm-open.desktop" ]]; then
    install -m 0644 -o "$SERVER_USER" -g "$SERVER_USER" \
      "$ROOT/deploy/nexcrm-open.desktop" "/home/${SERVER_USER}/.config/autostart/nexcrm-open.desktop"
  fi
  if [[ -f "$ROOT/deploy/cursor-open.desktop" ]]; then
    install -m 0644 -o "$SERVER_USER" -g "$SERVER_USER" \
      "$ROOT/deploy/cursor-open.desktop" "/home/${SERVER_USER}/.config/autostart/cursor-open.desktop"
  fi
  log "Owner must enable GDM passwordless auto-login for $SERVER_USER (see README § Debian server setup)"
  log "BIOS: set Restore on AC power loss = Power On"
}

ensure_user
base_packages
install_node
install_cloudflared
install_tailscale
postgres_bootstrap
jacms_files_dir
app_from_repo
systemd_stack
gnome_autostart

log "Done. Run: sudo bash $ROOT/deploy/verify-server.sh"
