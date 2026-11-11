# JACMS rename plan (documentation only)

**JACMS** = **JA CRM** (“ja Crm”). This guide is the **checklist for a future code and ops rename** from **NEXCRM** / `nexcrm` to **JACMS** / `jacms`. **Do not** treat this file as instructions to rename in a docs-only pull request — application code, deploy units, and production paths stay as-is until a dedicated change lands.

## Goals

- Consistent product name **JACMS** in UI, PWA, docs, and operator-facing paths.
- Minimal downtime on the Debian server: parallel paths or short maintenance window.
- Tunnel, DNS, and mobile base URL remain valid (`https://server.bluraymaldives.site`).

## Scope matrix

| Area | Today | Target | Notes |
| --- | --- | --- | --- |
| Product name (UI) | NEXCRM | JACMS | `web/index.html`, titles, copy |
| PWA manifest | `name` / `short_name` NEXCRM | JACMS | `web/public/manifest.webmanifest` |
| npm package (root) | `nexcrm` | `jacms` | `package.json` `name` (private) |
| Systemd unit | `nexcrm.service` | `jacms.service` | `deploy/nexcrm.service` → `deploy/jacms.service` |
| systemd enable | `systemctl enable nexcrm` | `jacms` | Update `deploy/ensure-boot.sh`, docs |
| nginx site | `sites-available/nexcrm` | `jacms` | `deploy/nexcrm.nginx.conf` |
| Repo path (optional) | `/home/server/dev/nexcrm` | `/home/server/dev/jacms` | Git remote unchanged; symlink possible |
| WorkingDirectory in unit | `/home/server/dev/nexcrm` | new path | Match actual checkout |
| PostgreSQL role | `nexcrm` | `jacms` or keep `nexcrm` | **Breaking** if renamed — prefer keep DB user until migration scripted |
| Database name | `nexcrm_dev` | `jacms_dev` | Requires `pg_dump` / restore or `ALTER DATABASE` |
| `.env` example | `nexcrm_dev`, user `nexcrm` | `jacms_*` | `DATABASE_URL`, docs |
| `FILE_ROOT` default | `nexcrm-files` | `jacms-files` | Move files or update path |
| Cloudflare tunnel name | `nexcrm` (script default) | `jacms` | `cloudflared tunnel create jacms`; DNS hostname unchanged |
| Tunnel installer default | `--tunnel-name nexcrm` | `jacms` | `deploy/install-cloudflare-tunnel.sh` |
| CSS / BEM prefixes | `.nexcrm-settings`, etc. | optional `jacms-*` | Large web diff — phased |
| Docs brand | NEXCRM | JACMS (with “formerly NEXCRM” once) | `docs/`, `README.md`, `AGENTS.md` |
| Mobile app display name | NEXCRM | JACMS | `mobile/app.json` / Expo config |
| Backup timer / scripts | `nexcrm-backup.*` | `jacms-backup.*` | grep `deploy/` |

## Recommended order of work

1. **Docs & marketing strings** — README, guides, manifest name, `index.html` meta (low risk).
2. **Deploy artifacts** — duplicate unit as `jacms.service`, migrate enablement, retire `nexcrm.service` name on server.
3. **package.json** `name` and internal references — no public npm publish (`private: true`).
4. **Database** — only with explicit migration plan (see below).
5. **Tunnel name** — create `jacms` tunnel or rename in Cloudflare; update `config.yml` and credentials path; public hostname **unchanged**.
6. **Folder rename** on disk — last, with systemd `WorkingDirectory` update.

## Server migration checklist (ops)

Execute on maintenance window; adjust paths for your host.

- [ ] `cd web && npm run build` on current tree; `npm run check` in CI.
- [ ] Copy or rename checkout: `mv /home/server/dev/nexcrm /home/server/dev/jacms` (or fresh clone).
- [ ] Install new unit: `sudo cp deploy/jacms.service /etc/systemd/system/` (after file exists in repo).
- [ ] `sudo systemctl disable --now nexcrm`; `sudo systemctl enable --now jacms`.
- [ ] Update nginx site name if changed; `sudo nginx -t && sudo systemctl reload nginx`.
- [ ] Update `/etc/cloudflared/config.yml` only if origin path or tunnel ID changes — hostname stays `server.bluraymaldives.site`.
- [ ] `sudo bash deploy/ensure-boot.sh` (or JACMS successor script).
- [ ] Verify: local + `https://server.bluraymaldives.site/health`.
- [ ] Grep for stale `nexcrm` in cron, autostart `.desktop`, backups.

## Database rename options

**Option A — keep DB identifiers (recommended short term)**  
Leave role `nexcrm` and database `nexcrm_dev`; only change product strings. Zero data migration.

**Option B — rename database**

```bash
# Example only — plan downtime, verify backups
sudo -u postgres psql -c "ALTER DATABASE nexcrm_dev RENAME TO jacms_dev;"
# Role rename is trickier; often create jacms SUPERUSER/owner and reassign
```

Update `.env`:

```text
DATABASE_URL=postgresql:///jacms_dev?host=/var/run/postgresql&user=nexcrm
```

**Option C — new DB + dump/restore**  
Safest for permission cleanup; longer outage.

## Cloudflare tunnel rename

Hostname **`server.bluraymaldives.site`** does not need to change.

To rename tunnel object only:

```bash
# After login; names illustrative
cloudflared tunnel create jacms
# Update route DNS if needed (same hostname → new tunnel)
sudo bash deploy/install-cloudflare-tunnel.sh \
  --hostname server.bluraymaldives.site \
  --tunnel-name jacms
sudo systemctl restart cloudflared
```

Retire old tunnel in Cloudflare dashboard when connectors are zero.

## Verification grep (after code PR)

```bash
rg -i 'nexcrm' --glob '!node_modules' --glob '!*.lock'
```

Triage: keep historical migration SQL filenames; change user-facing and ops surfaces.

## What this PR did not do

- No `package.json`, systemd, nginx, tunnel, or database renames in application code.
- Guides refer to **JACMS** as the planned name while commands still use **`nexcrm`** where that matches the repo today.

## Related guides

- [README.md](README.md)
- [cloudflare-tunnel-server-bluraymaldives.md](cloudflare-tunnel-server-bluraymaldives.md)
- [../DEPLOY.md](../DEPLOY.md)
