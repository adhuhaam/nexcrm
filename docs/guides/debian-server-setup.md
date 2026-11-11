# Debian server setup (JACMS / NEXCRM)

Prepare a **16 GB RAM Debian desktop** as the office server: OS packages, Node.js, PostgreSQL, optional nginx, firewall, and **Cursor** for on-machine development. Public internet access comes later via [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md).

## Assumptions

- **Debian stable** (e.g. bookworm) **desktop**, **16 GB RAM**, **GNOME**, **wired Ethernet** — frequently power-cycled.
- One primary admin Unix account, e.g. `server`, with the repo at `/home/server/dev/nexcrm` (path may change after [jacms-rename-plan.md](jacms-rename-plan.md)).
- **Development on the server** with **Cursor**; GNOME **auto-login** (no password) + Cursor autostart per [autostart-on-boot.md](autostart-on-boot.md).
- App listens on `127.0.0.1:3000`; nginx on `127.0.0.1:80` when installed — see [DEPLOY.md](../DEPLOY.md).
- Public URL **https://server.bluraymaldives.site** — [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md).

## 1. Base system

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y \
  curl ca-certificates gnupg git build-essential \
  ufw sudo
```

Set hostname if desired (optional):

```bash
sudo hostnamectl set-hostname jacms-server
```

## 2. Unix user and directories

```bash
sudo adduser server    # follow prompts; strong local password
sudo usermod -aG sudo server
```

Clone or copy the monorepo:

```bash
sudo -u server mkdir -p /home/server/dev
sudo -u server git clone <YOUR_REPO_URL> /home/server/dev/nexcrm
cd /home/server/dev/nexcrm
```

Copy environment template (no secrets in git):

```bash
cp .env.example .env
# Edit .env — typical values on this host:
# DATABASE_URL=postgresql:///nexcrm_dev?host=/var/run/postgresql&user=nexcrm
# FILE_ROOT=/home/server/Desktop/nexcrm-files
# HOST=127.0.0.1
# PORT=3000
```

Create file storage:

```bash
sudo -u server mkdir -p "$(grep FILE_ROOT .env | cut -d= -f2-)"
```

## 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

Create role and database (adjust names when JACMS rename lands):

```bash
sudo -u postgres createuser --createdb nexcrm || true
sudo -u postgres createdb -O nexcrm nexcrm_dev || true
```

Migrations apply on first `npm start` / `systemctl start nexcrm`.

For LAN/Tailscale TCP access, use the repo installer (writes `deploy/database-network.env`, mode 600):

```bash
cd /home/server/dev/nexcrm
sudo bash deploy/install-postgres-network.sh
```

## 4. Node.js

Use Node **22+** (LTS) via [NodeSource](https://github.com/nodesource/distributions) or nvm for the `server` user. Example (NodeSource 22.x on bookworm):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v22.x
```

Install app and build web:

```bash
cd /home/server/dev/nexcrm
npm install
cd web && npm install && npm run build && cd ..
npm start        # smoke: http://127.0.0.1:3000/health
```

## 5. nginx + systemd (production-style)

From the repo root:

```bash
cd /home/server/dev/nexcrm
sudo bash deploy/install-web-nginx.sh
```

This installs `nexcrm.service`, nginx site `nexcrm`, and enables units. Details: [DEPLOY.md](../DEPLOY.md).

Verify:

```bash
curl -sS http://127.0.0.1/health
curl -sS http://127.0.0.1:3000/health
```

## 6. Firewall (UFW)

Default deny incoming; allow SSH and office LAN as needed:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
# Optional office LAN (adjust subnet):
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
sudo ufw enable
```

Do **not** open WAN 80/443 when using Cloudflare Tunnel only — see [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md).

Port `5432` rules for LAN/Tailscale are applied by `install-postgres-network.sh` when UFW is present.

## 7. Cursor editor on the server

Install [Cursor](https://cursor.com) for Linux (.deb or AppImage) under the `server` user. Development happens **on this machine** (not only over SSH).

- Open the folder `/home/server/dev/nexcrm` (or `jacms` after rename).
- Use integrated terminal for `npm start`, `cd web && npm run dev`, and `npm run check`.
- **GNOME auto-login** + **Cursor autostart** — required on the owner host; see [autostart-on-boot.md](autostart-on-boot.md).
- **BIOS:** set **Restore on AC power loss = Power On** before relying on unattended recovery.

## 8. Updates and backups

```bash
sudo apt update && sudo apt upgrade -y
```

Schedule Postgres/app backups via your policy; the deploy tree may include `nexcrm-backup.timer` if enabled by `deploy/ensure-boot.sh` on your host.

## 9. Next steps

| Step | Guide |
| --- | --- |
| Boot recovery stack | [autostart-on-boot.md](autostart-on-boot.md) |
| Public `https://server.bluraymaldives.site` | [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md) |
| Rename planning | [jacms-rename-plan.md](jacms-rename-plan.md) |
