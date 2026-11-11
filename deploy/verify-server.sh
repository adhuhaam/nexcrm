#!/usr/bin/env bash
# Pass/fail checks for the full JACMS Debian office stack.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_USER="${JACMS_SERVER_USER:-server}"
REPO_DIR="${JACMS_REPO_DIR:-/home/${SERVER_USER}/dev/nexcrm}"
FILES_DIR="${JACMS_FILES_DIR:-/home/${SERVER_USER}/JACMS-Files}"
NODE_MIN_MAJOR="${JACMS_NODE_MIN_MAJOR:-22}"

PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

check() {
  local name="$1"
  shift
  if "$@"; then
    green "PASS  $name"
    PASS=$((PASS + 1))
  else
    red "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

check_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_systemd_active() {
  systemctl is-active --quiet "$1"
}

check_systemd_enabled() {
  systemctl is-enabled --quiet "$1" 2>/dev/null
}

check_curl_health() {
  curl -fsS --max-time 5 "$1" >/dev/null 2>&1
}

echo "JACMS server verification"
echo "Repo: $REPO_DIR | Files: $FILES_DIR"
echo

check "git installed" check_cmd git
check "curl installed" check_cmd curl
check "build-essential (gcc)" check_cmd gcc
check "nginx installed" check_cmd nginx
check "psql client" check_cmd psql
check "node installed" check_cmd node
if check_cmd node; then
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  check "node >= ${NODE_MIN_MAJOR}" test "${major:-0}" -ge "$NODE_MIN_MAJOR"
else
  red "FAIL  node version (node missing)"
  FAIL=$((FAIL + 1))
fi
check "npm installed" check_cmd npm
check "cloudflared installed" check_cmd cloudflared
check "ImageMagick (convert)" check_cmd convert
check "ghostscript (gs)" check_cmd gs
check "poppler (pdftotext)" check_cmd pdftotext

check "postgresql active" check_systemd_active postgresql
check "nginx active" check_systemd_active nginx
check "nexcrm active" check_systemd_active nexcrm

check "postgresql enabled" check_systemd_enabled postgresql
check "nginx enabled" check_systemd_enabled nginx
check "nexcrm enabled" check_systemd_enabled nexcrm

if systemctl list-unit-files cloudflared.service &>/dev/null; then
  check "cloudflared enabled" check_systemd_enabled cloudflared
  check "cloudflared active" check_systemd_active cloudflared
else
  red "FAIL  cloudflared unit (not installed — optional until tunnel configured)"
  FAIL=$((FAIL + 1))
fi

if systemctl list-unit-files tailscaled.service &>/dev/null; then
  check "tailscaled active" check_systemd_active tailscaled
else
  green "PASS  tailscaled (optional — not installed)"
  PASS=$((PASS + 1))
fi

check "JACMS-Files directory exists" test -d "$FILES_DIR"
check "JACMS-Files writable by $SERVER_USER" test -w "$FILES_DIR" -o -O "$FILES_DIR"

work="$ROOT"
[[ -f "$REPO_DIR/package.json" ]] && work="$REPO_DIR"
check "repo package.json" test -f "$work/package.json"
check ".env present" test -f "$work/.env"

if [[ -f "$work/.env" ]]; then
  check ".env FILES_DIR or FILE_ROOT" grep -qE '^(FILES_DIR|FILE_ROOT)=' "$work/.env"
fi

check "API health :3000" check_curl_health "http://127.0.0.1:3000/health"
check "nginx health :80" check_curl_health "http://127.0.0.1/health"

if id "$SERVER_USER" &>/dev/null; then
  check "server user exists" true
else
  check "server user exists" false
fi

autostart="/home/${SERVER_USER}/.config/autostart"
if [[ -f "$autostart/nexcrm-open.desktop" ]]; then
  check "nexcrm GNOME autostart" true
else
  check "nexcrm GNOME autostart" false
fi

echo
echo "Summary: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
