#!/usr/bin/env bash
# Install cloudflared and (optionally) create a named tunnel to local nginx.
set -euo pipefail

HOSTNAME_FQDN=""
TUNNEL_NAME="jacms"
ORIGIN="http://127.0.0.1:80"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hostname) HOSTNAME_FQDN="${2:-}"; shift 2 ;;
    --tunnel-name) TUNNEL_NAME="${2:-}"; shift 2 ;;
    --origin) ORIGIN="${2:-}"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared already installed: $(cloudflared --version | head -1)"
    return
  fi
  echo "Installing cloudflared…"
  # Official Cloudflare package (amd64/arm64)
  ARCH="$(dpkg --print-architecture)"
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" \
    -o "$TMP/cloudflared.deb"
  dpkg -i "$TMP/cloudflared.deb"
  rm -rf "$TMP"
  cloudflared --version
}

write_config() {
  local tunnel_id="$1"
  local credentials="$2"
  mkdir -p /etc/cloudflared
  cat >/etc/cloudflared/config.yml <<EOF
tunnel: ${tunnel_id}
credentials-file: ${credentials}

ingress:
  - hostname: ${HOSTNAME_FQDN}
    service: ${ORIGIN}
  - service: http_status:404
EOF
  chmod 640 /etc/cloudflared/config.yml
}

install_cloudflared

if [[ -z "$HOSTNAME_FQDN" ]]; then
  cat <<EOF

cloudflared binary is ready.

Next (interactive, needs a Cloudflare domain):
  1) cloudflared tunnel login
  2) sudo bash deploy/install-cloudflare-tunnel.sh --hostname jacms.YOURDOMAIN.com --tunnel-name ${TUNNEL_NAME}

Docs: README.md#cloudflare-tunnel
EOF
  exit 0
fi

if [[ ! -f /root/.cloudflared/cert.pem ]] && [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "Run cloudflared tunnel login first (creates cert.pem)." >&2
  exit 1
fi

# Prefer root cert path used by service installs
export TUNNEL_ORIGIN_CERT="${TUNNEL_ORIGIN_CERT:-/root/.cloudflared/cert.pem}"
if [[ ! -f "$TUNNEL_ORIGIN_CERT" ]]; then
  TUNNEL_ORIGIN_CERT="$HOME/.cloudflared/cert.pem"
fi

EXISTING_ID="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}')" || true
if [[ -z "$EXISTING_ID" ]]; then
  cloudflared tunnel create "$TUNNEL_NAME"
  EXISTING_ID="$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}')"
fi

CRED="/root/.cloudflared/${EXISTING_ID}.json"
if [[ ! -f "$CRED" ]]; then
  CRED="$(ls /root/.cloudflared/"${EXISTING_ID}".json 2>/dev/null || ls "$HOME/.cloudflared/${EXISTING_ID}.json" 2>/dev/null || true)"
fi
if [[ -z "$CRED" || ! -f "$CRED" ]]; then
  echo "Credentials file for tunnel $EXISTING_ID not found under ~/.cloudflared" >&2
  exit 1
fi

write_config "$EXISTING_ID" "$CRED"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME_FQDN" || true

# systemd
cloudflared service install || true
systemctl enable --now cloudflared
systemctl restart cloudflared
systemctl --no-pager --full status cloudflared || true

echo
echo "Tunnel ${TUNNEL_NAME} (${EXISTING_ID}) → ${ORIGIN}"
echo "Public URL: https://${HOSTNAME_FQDN}/"
echo "Health:     curl -sS https://${HOSTNAME_FQDN}/health"
