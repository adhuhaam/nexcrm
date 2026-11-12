#!/bin/bash
# Make Postgres + nginx + JACMS + browser open reliable on power-on.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

# Single owner of :3000 — system unit only (user unit caused EADDRINUSE races).
USER_UNIT="/home/server/.config/systemd/user/jacms.service"
if [[ -f "$USER_UNIT" ]] || systemctl --user -M server@ is-enabled jacms >/dev/null 2>&1; then
  sudo -u server XDG_RUNTIME_DIR="/run/user/$(id -u server)" systemctl --user disable --now jacms 2>/dev/null || true
  rm -f "$USER_UNIT" \
    /home/server/.config/systemd/user/default.target.wants/jacms.service
  sudo -u server XDG_RUNTIME_DIR="/run/user/$(id -u server)" systemctl --user daemon-reload 2>/dev/null || true
  echo "Disabled conflicting user jacms.service"
fi

fuser -k 3000/tcp 2>/dev/null || true

if systemctl list-unit-files 2>/dev/null | grep -q '^nexcrm.service'; then
  systemctl disable --now nexcrm 2>/dev/null || true
  rm -f /etc/systemd/system/nexcrm.service
  echo "Retired legacy nexcrm.service (use jacms.service)"
fi

install -m 0644 "$ROOT/deploy/jacms.service" /etc/systemd/system/jacms.service
systemctl daemon-reload

systemctl enable postgresql
systemctl enable postgresql@18-main
systemctl enable nginx
systemctl enable jacms
systemctl enable jacms-backup.timer 2>/dev/null || true
systemctl enable tailscaled 2>/dev/null || true

systemctl start postgresql@18-main
systemctl start nginx
systemctl restart jacms

# Desktop: open the app after autologin
install -d -m 0755 -o server -g server /home/server/.config/autostart
install -m 0644 -o server -g server "$ROOT/deploy/jacms-open.desktop" \
  /home/server/.config/autostart/jacms-open.desktop

# Keep remote sessions reachable
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target 2>/dev/null || true

echo "Boot stack status:"
systemctl is-enabled postgresql postgresql@18-main nginx jacms
systemctl --no-pager --full status jacms nginx postgresql@18-main | sed -n '1,50p'

ok=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -eq 1 ]]; then
  curl -fsS http://127.0.0.1:3000/health && echo
  curl -fsS http://127.0.0.1/health && echo
  echo "Boot stack healthy."
else
  echo "WARN: health checks did not pass yet — see: journalctl -u jacms -n 50" >&2
  systemctl --no-pager --full status jacms | sed -n '1,40p' || true
  exit 1
fi
