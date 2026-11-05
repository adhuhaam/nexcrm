#!/bin/bash
# Install nginx reverse proxy + systemd unit for NEXCRM (LAN + local; Tailscale Serve keeps ts.net HTTPS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq nginx

install -d -m 0755 /etc/nginx/ssl
if [[ -f /etc/caddy/pki/lan.crt && -f /etc/caddy/pki/lan.key ]]; then
  install -m 0644 /etc/caddy/pki/lan.crt /etc/nginx/ssl/nexcrm-lan.crt
  install -m 0640 /etc/caddy/pki/lan.key /etc/nginx/ssl/nexcrm-lan.key
  chown root:root /etc/nginx/ssl/nexcrm-lan.key
else
  echo "WARN: LAN TLS certs missing under /etc/caddy/pki — generating self-signed for 192.168.100.10"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout /etc/nginx/ssl/nexcrm-lan.key \
    -out /etc/nginx/ssl/nexcrm-lan.crt \
    -subj "/CN=192.168.100.10" \
    -addext "subjectAltName=IP:192.168.100.10,DNS:server"
  chmod 640 /etc/nginx/ssl/nexcrm-lan.key
fi

install -m 0644 "$ROOT/deploy/nexcrm.nginx.conf" /etc/nginx/sites-available/nexcrm
ln -sfn /etc/nginx/sites-available/nexcrm /etc/nginx/sites-enabled/nexcrm
rm -f /etc/nginx/sites-enabled/default

nginx -t
# Free LAN :443 from Caddy if present (Tailscale Serve keeps 100.x:443)
if systemctl is-active --quiet caddy 2>/dev/null; then
  systemctl stop caddy
  systemctl disable caddy || true
  echo "Stopped Caddy (nginx now owns LAN HTTPS)."
fi

systemctl reload nginx || systemctl restart nginx
systemctl enable --now nginx

install -m 0644 "$ROOT/deploy/nexcrm.service" /etc/systemd/system/nexcrm.service
systemctl daemon-reload
systemctl enable nexcrm
systemctl restart nexcrm

# Firewall: HTTP/HTTPS from office LAN; HTTP from Tailscale CGNAT (Serve still preferred for HTTPS)
if command -v ufw >/dev/null; then
  ufw allow from 192.168.100.0/24 to any port 80 proto tcp || true
  ufw allow from 192.168.100.0/24 to any port 443 proto tcp || true
  ufw allow from 100.64.0.0/10 to any port 80 proto tcp || true
fi

# Ensure Tailscale Serve still points at the app
if command -v tailscale >/dev/null; then
  tailscale serve --bg --yes http://127.0.0.1:3000 || true
fi

echo "NEXCRM web via nginx:"
echo "  Local:     http://127.0.0.1/"
echo "  LAN HTTP:  http://192.168.100.10/"
echo "  LAN HTTPS: https://192.168.100.10/"
echo "  Tailscale: https://server-1.snowy-pride.ts.net/"
systemctl --no-pager --full status nexcrm nginx | sed -n '1,40p'
