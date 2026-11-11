# Autostart on boot (power loss / shutdown)

Goal: after **any** reboot or AC power return, **PostgreSQL**, **nginx**, the **app service** (`nexcrm` today), **cloudflared**, and optional timers come up **without** login or manual `sudo` — so `https://server.bluraymaldives.site` works once DNS and Tunnel are configured.

Builds on [DEPLOY.md](../DEPLOY.md) and repo script `deploy/ensure-boot.sh`.

## Systemd units to enable

| Unit | Role | Depends on |
| --- | --- | --- |
| `postgresql` / `postgresql@*-main` | Database | `network.target` |
| `nginx` | Reverse proxy → `127.0.0.1:3000` | network |
| `nexcrm` | Node API + static web | `postgresql.service` (`After=` / `Wants=` in unit) |
| `cloudflared` | Cloudflare Tunnel connector | network (after nginx is up in practice) |
| `tailscaled` | Optional admin VPN | per [REMOTE.md](../REMOTE.md) |
| `nexcrm-backup.timer` | Optional backups | if installed |

App unit excerpt (from `deploy/nexcrm.service`):

- `Restart=on-failure`, `RestartSec=3`
- `HOST=127.0.0.1`, `PORT=3000`
- `EnvironmentFile=-/home/server/dev/nexcrm/.env`

## One-shot boot hardening (repo script)

From the repo on the server:

```bash
cd /home/server/dev/nexcrm
sudo bash deploy/ensure-boot.sh
```

This script (among other things):

- Disables conflicting **user** `nexcrm.service` if present (avoids port 3000 races).
- Installs and enables `postgresql`, `postgresql@18-main` (version may differ on Debian — adjust instance name), `nginx`, `nexcrm`.
- Restarts services and curls `http://127.0.0.1:3000/health` and `http://127.0.0.1/health`.
- Masks sleep/hibernate targets so remote SSH stays reachable.

**Debian note:** PostgreSQL instance may be `postgresql@15-main` or similar. List with:

```bash
systemctl list-units 'postgresql@*'
```

Enable the instance unit that matches your cluster.

## cloudflared ordering

Install and enable the tunnel **after** nginx and nexcrm are healthy — [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md).

`deploy/install-cloudflare-tunnel.sh` runs `systemctl enable --now cloudflared`. For stricter ordering you can drop a systemd drop-in (optional):

```ini
# /etc/systemd/system/cloudflared.service.d/after-nginx.conf
[Unit]
After=network-online.target nginx.service
Wants=network-online.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart cloudflared
```

## BIOS / hardware

| Setting | Recommendation |
| --- | --- |
| **Restore on AC power loss** | **Power On** / **Last State** (wording varies) so the PC starts after outage |
| Wake-on-LAN | Optional; not required for Tunnel (connector is outbound) |
| UPS | Recommended for clean shutdowns |

## Desktop auto-login (optional)

Only if you need **Cursor** or a browser on the physical console immediately after boot **without** typing a password:

- **GDM** (GNOME): `/etc/gdm3/daemon.conf` — `AutomaticLoginEnable=true`, `AutomaticLogin=server`
- **SDDM** (KDE): distribution-specific autologin config

Security: auto-login increases physical-access risk. Prefer SSH/Cursor Remote from another machine when possible ([REMOTE.md](../REMOTE.md)).

## Passwordless sudo (optional ops convenience)

Some hosts use `/etc/sudoers.d/server-nopasswd` for the `server` user so install scripts run without prompts. Limit to trusted single-user desktops.

## Post-boot health checklist

Run after reboot or power restore (local SSH or console):

```bash
# 1) Core units active?
systemctl is-active postgresql nginx nexcrm cloudflared

# 2) Enabled for next boot?
systemctl is-enabled postgresql nginx nexcrm cloudflared

# 3) App health (local)
curl -fsS http://127.0.0.1:3000/health && echo OK-app
curl -fsS http://127.0.0.1/health && echo OK-nginx

# 4) Public (if tunnel configured)
curl -fsS https://server.bluraymaldives.site/health && echo OK-public

# 5) Recent errors
journalctl -u nexcrm -n 30 --no-pager
journalctl -u nginx -n 20 --no-pager
journalctl -u cloudflared -n 30 --no-pager
```

Expected: all `is-active` → `active`; health endpoints return JSON success; `cloudflared` logs show registered tunnel connections.

## Troubleshooting

### nexcrm fails / port 3000 in use

```bash
sudo journalctl -u nexcrm -n 80 --no-pager
sudo ss -tlnp | grep 3000
sudo systemctl restart nexcrm
```

Check `.env` and `DATABASE_URL`; Postgres must be up first.

### nginx 502 / bad gateway

```bash
sudo nginx -t
sudo journalctl -u nginx -n 40 --no-pager
curl -v http://127.0.0.1:3000/health
sudo systemctl restart nexcrm nginx
```

### cloudflared inactive

```bash
systemctl status cloudflared
journalctl -u cloudflared -n 100 --no-pager
```

Common fixes:

- Invalid or missing credentials under `/etc/cloudflared/` or `/root/.cloudflared/` — re-run login flow per [CLOUDFLARE_TUNNEL.md](../CLOUDFLARE_TUNNEL.md) (never paste credentials into docs or git).
- Origin down: fix nginx/nexcrm first (`curl http://127.0.0.1:80/health`).
- Config typo in `/etc/cloudflared/config.yml` — hostname must match DNS route.

### Cloudflare **Error 1033** in the browser

**1033** means Cloudflare’s edge cannot reach a healthy **tunnel connector** (cloudflared on your server is down, disconnected, or the tunnel ID/credentials do not match).

1. On the server: `systemctl status cloudflared` → should be `active (running)`.
2. `journalctl -u cloudflared -f` — look for connection errors, auth failures, or certificate issues.
3. Confirm local stack: `curl http://127.0.0.1/health`.
4. In Cloudflare Zero Trust / Tunnels dashboard: tunnel shows **Healthy** with active connectors.
5. After config changes: `sudo systemctl restart cloudflared`.

### PostgreSQL not ready on fast boot

```bash
systemctl status postgresql
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl restart nexcrm
```

## Re-run after deploy changes

```bash
cd /home/server/dev/nexcrm
cd web && npm run build && cd ..
sudo bash deploy/ensure-boot.sh
```

When JACMS rename changes the unit name to `jacms.service`, update commands accordingly — [jacms-rename-plan.md](jacms-rename-plan.md).
