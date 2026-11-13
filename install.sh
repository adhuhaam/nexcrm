#!/usr/bin/env bash
# One-shot native installer for JACMS on fresh Debian (idempotent, safe to re-run).
# Usage: git clone …/jacms.git && cd jacms && sudo bash install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-jacms.bluraymaldives.site}"
APP_URL="${APP_URL:-https://${PUBLIC_DOMAIN}}"
NODE_MAJOR="${JACMS_NODE_MAJOR:-22}"
BACKUP_DIR="${JACMS_BACKUP_DIR:-/var/backups/jacms}"
FILES_DIR="${JACMS_FILES_DIR:-}"
REPO_DIR="${JACMS_REPO_DIR:-$ROOT}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash install.sh" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() { echo "==> $*"; }

ensure_timezone() {
  if [[ -z "$(timedatectl show -p Timezone --value 2>/dev/null || true)" ]] || [[ "$(timedatectl show -p Timezone --value)" == "Etc/UTC" ]]; then
    log "Setting timezone to Indian/Maldives"
    timedatectl set-timezone Indian/Maldives || true
  fi
}

resolve_server_user() {
  SERVER_USER="${JACMS_SERVER_USER:-}"
  if [[ -z "$SERVER_USER" ]]; then
    SERVER_USER="$(stat -c '%U' "$REPO_DIR")"
    if [[ "$SERVER_USER" == "root" ]]; then
      SERVER_USER="server"
    fi
  fi
  if ! id "$SERVER_USER" &>/dev/null; then
    log "Creating unix user $SERVER_USER"
    adduser --disabled-password --gecos "JACMS server" "$SERVER_USER"
    usermod -aG sudo "$SERVER_USER" 2>/dev/null || true
  fi
  if [[ "$SERVER_USER" == "root" ]]; then
    echo "JACMS must not run as root — set JACMS_SERVER_USER" >&2
    exit 1
  fi
  if [[ -z "$FILES_DIR" ]]; then
    FILES_DIR="/home/${SERVER_USER}/JACMS-Files"
  fi
  if [[ "$(stat -c '%U' "$REPO_DIR")" == "root" ]]; then
    log "Repository owned by root — chown to $SERVER_USER"
    chown -R "$SERVER_USER:$SERVER_USER" "$REPO_DIR"
  fi
}

base_packages() {
  log "System packages (Node deps, Postgres, nginx, build tools)"
  apt-get update -qq
  apt-get install -y -qq \
    curl ca-certificates gnupg git build-essential sudo \
    nginx postgresql postgresql-contrib openssl \
    fonts-dejavu-core fonts-liberation \
    imagemagick ghostscript poppler-utils libvips-tools
}

install_node() {
  if command -v node >/dev/null; then
    log "Node: $(node --version)"
    return
  fi
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
}

install_cloudflared_binary() {
  if command -v cloudflared >/dev/null; then
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

postgres_bootstrap() {
  log "PostgreSQL role and database (jacms)"
  systemctl enable postgresql
  systemctl start postgresql

  local pass_file="${REPO_DIR}/.postgres-password"
  local pg_pass=""
  if [[ -f "$pass_file" ]]; then
    pg_pass="$(tr -d '\n' <"$pass_file")"
  else
    pg_pass="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
    printf '%s' "$pg_pass" >"$pass_file"
    chmod 0600 "$pass_file"
    chown "$SERVER_USER:$SERVER_USER" "$pass_file"
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jacms') THEN
    CREATE ROLE jacms LOGIN PASSWORD '${pg_pass}';
  ELSE
    ALTER ROLE jacms WITH PASSWORD '${pg_pass}';
  END IF;
END\$\$;
SQL

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jacms'" | grep -q 1; then
    sudo -u postgres createdb -O jacms jacms
  fi

  DATABASE_URL="postgresql://jacms:${pg_pass}@127.0.0.1:5432/jacms"
  export DATABASE_URL
}

write_env() {
  local env_file="${REPO_DIR}/.env"
  if [[ ! -f "$env_file" ]]; then
    log "Writing $env_file"
    sudo -u "$SERVER_USER" cp "${REPO_DIR}/.env.example" "$env_file"
  fi
  sudo -u "$SERVER_USER" bash -lc "
    set -e
    f='$env_file'
    set_kv() {
      local k=\$1 v=\$2
      if grep -q \"^\${k}=\" \"\$f\"; then
        sed -i \"s|^\${k}=.*|\${k}=\${v}|\" \"\$f\"
      else
        printf '%s=%s\n' \"\$k\" \"\$v\" >>\"\$f\"
      fi
    }
    set_kv DATABASE_URL '$DATABASE_URL'
    set_kv FILES_DIR '$FILES_DIR'
    set_kv HOST '127.0.0.1'
    set_kv PORT '3000'
    set_kv PUBLIC_DOMAIN '$PUBLIC_DOMAIN'
    set_kv APP_URL '$APP_URL'
    set_kv DISPLAY_TIME_ZONE 'Indian/Maldives'
  "
  chmod 0600 "$env_file"
  chown "$SERVER_USER:$SERVER_USER" "$env_file"
}

app_build() {
  install -d -m 0755 -o "$SERVER_USER" -g "$SERVER_USER" "$FILES_DIR"
  log "npm install and build (API + web)"
  sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR' && npm install"
  sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR/web' && npm install && npm run build"
}

create_first_admin() {
  sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR' && npm run migrate"
  local count
  count="$(sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR' && node --experimental-strip-types -e \"
    import { loadEnv } from './lib/env.ts';
    import { pool } from './lib/db.ts';
    loadEnv();
    const r = await pool.query('select count(*)::int as n from users');
    console.log(r.rows[0].n);
    await pool.end();
  \"")"
  if [[ "${count:-0}" -gt 0 ]]; then
    log "Admin user already exists — skip create-admin"
    return
  fi
  log "Create first system admin (prompt or JACMS_ADMIN_* env)"
  if [[ -n "${JACMS_ADMIN_EMAIL:-}" && -n "${JACMS_ADMIN_PASSWORD:-}" && -n "${JACMS_ADMIN_NAME:-}" ]]; then
    sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR' && npm run create-admin"
  elif [[ -t 0 ]]; then
    sudo -u "$SERVER_USER" bash -lc "cd '$REPO_DIR' && npm run create-admin"
  else
    echo "Set JACMS_ADMIN_NAME, JACMS_ADMIN_EMAIL, JACMS_ADMIN_PASSWORD and re-run, or: sudo -u $SERVER_USER bash -lc 'cd $REPO_DIR && npm run create-admin'" >&2
    exit 1
  fi
}

install_nginx_and_systemd() {
  log "nginx + systemd (jacms)"
  sed -e "s|jacms.bluraymaldives.site|${PUBLIC_DOMAIN}|g" \
    -e "s|/home/server/dev/jacms|${REPO_DIR}|g" \
    -e "s|^User=server|User=${SERVER_USER}|" \
    -e "s|^Group=server|Group=${SERVER_USER}|" \
    "${ROOT}/deploy/jacms.service" >/etc/systemd/system/jacms.service
  sed "s|jacms.bluraymaldives.site|${PUBLIC_DOMAIN}|g" \
    "${ROOT}/deploy/jacms.nginx.conf" >/etc/nginx/sites-available/jacms
  ln -sfn /etc/nginx/sites-available/jacms /etc/nginx/sites-enabled/jacms
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload nginx || systemctl restart nginx

  sed "s|/home/server/dev/jacms|${REPO_DIR}|g" "${ROOT}/deploy/jacms-backup.service" >/etc/systemd/system/jacms-backup.service
  install -m 0644 "${ROOT}/deploy/jacms-backup.timer" /etc/systemd/system/jacms-backup.timer
  install -d -m 0700 "$BACKUP_DIR"
  chown root:root "$BACKUP_DIR"

  systemctl daemon-reload
  systemctl enable jacms
  systemctl restart jacms
  systemctl enable jacms-backup.timer
  systemctl start jacms-backup.timer || true
}

optional_cloudflared() {
  install_cloudflared_binary
  if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    log "Installing cloudflared with provided token"
    cloudflared service install "$CLOUDFLARE_TUNNEL_TOKEN"
    systemctl enable --now cloudflared
    return
  fi
  if [[ -t 0 ]]; then
    local token=""
    read -r -p "Paste Cloudflare tunnel token (Enter to skip): " token || true
    if [[ -n "$token" ]]; then
      cloudflared service install "$token"
      systemctl enable --now cloudflared
    else
      log "Skipping Cloudflare tunnel (configure hostname ${PUBLIC_DOMAIN} → http://localhost:80 in Cloudflare)"
    fi
  else
    log "Skipping tunnel — set CLOUDFLARE_TUNNEL_TOKEN to install non-interactively"
  fi
}

print_summary() {
  echo
  echo "──────── JACMS install summary ────────"
  echo "  Repo:       $REPO_DIR"
  echo "  Run as:     $SERVER_USER"
  echo "  Files:      $FILES_DIR"
  echo "  Backups:    $BACKUP_DIR (nightly, 14-day rotation)"
  echo "  Local web:  http://127.0.0.1/"
  echo "  Public URL: $APP_URL (requires Cloudflare tunnel → localhost:80)"
  echo "  Health:     curl -fsS http://127.0.0.1/health"
  echo "  MCP (docs): ${APP_URL}/mcp"
  echo "  Mobile API: $APP_URL"
  echo "────────────────────────────────────────"
}

ensure_timezone
resolve_server_user
base_packages
install_node
postgres_bootstrap
write_env
app_build
create_first_admin
install_nginx_and_systemd
optional_cloudflared

log "Running verify-server.sh"
if bash "${ROOT}/deploy/verify-server.sh"; then
  print_summary
else
  echo "verify-server reported failures — fix issues above, then re-run: sudo bash install.sh" >&2
  exit 1
fi
