#!/usr/bin/env bash
# Idempotent NexCRM → JACMS ops migration on an existing Debian server.
# Run after pulling PR #5 and (optionally) renaming the GitHub repo to adhuhaam/jacms.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_USER="${JACMS_SERVER_USER:-server}"
REPO_DIR="${JACMS_REPO_DIR:-/home/${SERVER_USER}/dev/jacms}"
LEGACY_REPO="/home/${SERVER_USER}/dev/nexcrm"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

log() { echo "==> $*"; }

rename_postgres() {
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='nexcrm'" | grep -q 1; then
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='jacms'" | grep -q 1; then
      log "PostgreSQL: ALTER ROLE nexcrm RENAME TO jacms"
      sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE nexcrm RENAME TO jacms;"
    else
      log "PostgreSQL role jacms already exists — skip role rename"
    fi
  fi
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='nexcrm_dev'" | grep -q 1; then
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jacms_dev'" | grep -q 1; then
      log "PostgreSQL: terminate connections and rename database nexcrm_dev → jacms_dev"
      sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nexcrm_dev' AND pid <> pg_backend_pid();"
      sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexcrm_dev RENAME TO jacms_dev;"
    else
      log "Database jacms_dev already exists — skip DB rename"
    fi
  fi
}

migrate_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  log "Updating $env_file (DATABASE_URL, NEXCRM_* → JACMS_*)"
  if grep -q 'nexcrm_dev' "$env_file" 2>/dev/null; then
    sed -i 's|nexcrm_dev|jacms_dev|g' "$env_file"
  fi
  if grep -q 'user=nexcrm' "$env_file" 2>/dev/null; then
    sed -i 's|user=nexcrm|user=jacms|g' "$env_file"
  fi
  if grep -q 'postgresql://nexcrm:' "$env_file" 2>/dev/null; then
    sed -i 's|postgresql://nexcrm:|postgresql://jacms:|g' "$env_file"
  fi
  while IFS= read -r key; do
  [[ -n "$key" ]] || continue
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
      jacms_key="JACMS_${key#NEXCRM_}"
      if ! grep -q "^${jacms_key}=" "$env_file" 2>/dev/null; then
        val="$(grep "^${key}=" "$env_file" | head -1 | cut -d= -f2-)"
        echo "${jacms_key}=${val}" >> "$env_file"
      fi
    fi
  done < <(grep -E '^NEXCRM_' "$env_file" 2>/dev/null | cut -d= -f1 || true)
}

migrate_systemd() {
  if systemctl list-unit-files | grep -q '^nexcrm.service'; then
    log "Disabling legacy nexcrm.service"
    systemctl disable --now nexcrm 2>/dev/null || true
    rm -f /etc/systemd/system/nexcrm.service
  fi
  install -m 0644 "$ROOT/deploy/jacms.service" /etc/systemd/system/jacms.service
  if [[ -d "$LEGACY_REPO" && ! -d "$REPO_DIR" ]]; then
    log "Symlink $LEGACY_REPO → $REPO_DIR (optional checkout path)"
    ln -sfn "$LEGACY_REPO" "$REPO_DIR"
  fi
  systemctl daemon-reload
  systemctl enable jacms
  systemctl restart jacms
}

migrate_nginx() {
  if [[ -f /etc/nginx/sites-enabled/nexcrm ]]; then
    log "Removing legacy nginx site nexcrm"
    rm -f /etc/nginx/sites-enabled/nexcrm /etc/nginx/sites-available/nexcrm
  fi
  if [[ -f /etc/nginx/ssl/nexcrm-lan.crt ]]; then
    install -m 0644 /etc/nginx/ssl/nexcrm-lan.crt /etc/nginx/ssl/jacms-lan.crt
    install -m 0640 /etc/nginx/ssl/nexcrm-lan.key /etc/nginx/ssl/jacms-lan.key
  fi
  install -m 0644 "$ROOT/deploy/jacms.nginx.conf" /etc/nginx/sites-available/jacms
  ln -sfn /etc/nginx/sites-available/jacms /etc/nginx/sites-enabled/jacms
  nginx -t
  systemctl reload nginx
}

migrate_autostart() {
  local autostart="/home/${SERVER_USER}/.config/autostart"
  install -d -m 0755 -o "$SERVER_USER" -g "$SERVER_USER" "$autostart"
  rm -f "$autostart/nexcrm-open.desktop"
  install -m 0644 -o "$SERVER_USER" -g "$SERVER_USER" \
    "$ROOT/deploy/jacms-open.desktop" "$autostart/jacms-open.desktop"
}

log "JACMS rebrand migration (idempotent)"
rename_postgres
for candidate in "$REPO_DIR/.env" "$LEGACY_REPO/.env" "$ROOT/.env"; do
  migrate_env_file "$candidate"
done
migrate_systemd
migrate_nginx
migrate_autostart

log "Done. Verify: sudo bash $ROOT/deploy/verify-server.sh"
log "All users must sign in again (jacms_session cookie). Reinstall mobile app if bundle id changed."
