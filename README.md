# JACMS

[![Production](https://img.shields.io/badge/production-jacms.bluraymaldives.site-blue)](https://jacms.bluraymaldives.site)
[![Stack](https://img.shields.io/badge/stack-Node%2022%20%C2%B7%20PostgreSQL%20%C2%B7%20nginx%20%C2%B7%20cloudflared-informational)](#debian-server-architecture)
[![Docs](https://img.shields.io/badge/docs-README%20master-green)](#development-roadmap)
[![Agent rule](https://img.shields.io/badge/agents-maintain%20README-orange)](#agent-quick-start)

> **⚠️ MANDATORY RULE FOR CURSOR AND EVERY AI AGENT**

**YOU MUST MAINTAIN `README.md` AS PART OF EVERY CHANGE.**

- **Before starting work:** `git pull` and read **this file** (`README.md`) for the latest ✅ DONE · 🚧 IN PROGRESS · 📝 PLANNED status.
- **After every change:** update **this file** in the **same commit** — checkboxes, changelog date, and any section affected.
- **New ideas or decisions** from the owner (Adhuhaam) → add under [Planned work](#planned-work) or [Open items](#open-items) immediately.
- **Never leave docs stale.** Code and docs must agree.
- **Commit and push docs frequently.** Adhuhaam edits from many locations — always pull/rebase first and **merge his edits**; **never overwrite** them.
- **Everyone stays aligned through this single document.**

Stubs: [AGENTS.md](AGENTS.md), [mobile/AGENTS.md](mobile/AGENTS.md), [.cursor/rules/docs-maintenance.mdc](.cursor/rules/docs-maintenance.mdc).

---

<a id="table-of-contents"></a>

## Table of contents


- [Overview](#overview)
- [Quick start](#quick-start)
- [Fresh install (native & Docker)](#fresh-install)
- [Development roadmap](#development-roadmap)
- [Product map](#product-map)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Client access scope](#client-access-scope)
- [Agent quick start](#agent-quick-start)
- [Agent quick reference](#agent-quick-reference)
- [Deploy](#deploy)
- [Server architecture (Debian)](#debian-server-architecture)
- [Debian server setup](#debian-server-setup)
- [Autostart on boot](#autostart-on-boot)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms)
- [Remote / Tailscale](#remote-access-tailscale)
- [JACMS rename plan](#jacms-rename-plan)
- [Grok Bot MCP guide](#grok-bot-plan)
  - [Architecture](#grok-bot-architecture)
  - [MCP server (Node)](#grok-bot-mcp-server)
  - [Auth & `grokbot` user](#grok-bot-auth)
  - [Tool catalog](#grok-bot-tools)
  - [nginx & tunnel](#grok-bot-nginx)
  - [Connect Grok Bot](#connect-grok-bot)
  - [Troubleshooting](#grok-bot-troubleshooting)
- [UI redesign plan](#ui-redesign-plan)
- [Mobile app](#mobile-expo-app)
- [Mobile agent notes](#mobile-expo-agents)
- [Android preview roadmap](#mobile-expo-android-preview)
- [Web app notes](#web-app-notes)

---

<a id="overview"></a>

## Overview

**JACMS** (JA CRM) — manpower-agency office **super app**: legal **employers** second staff to **clients** with dual monthly rates (staff salary vs bill). One Node API + PostgreSQL serves a React **PWA** (`web/`) and Expo **mobile** (`mobile/`) on the same `/api/v1`.

| | |
| --- | --- |
| **Production URL** | https://jacms.bluraymaldives.site (Cloudflare Tunnel → nginx → Node) |
| **Repo** | https://github.com/adhuhaam/jacms |
| **Rebrand** | PR #5 — code, deploy, and PWA use **JACMS** / `jacms`; existing servers run `deploy/migrate-rebrand.sh` once ([M3](#m3--jacms-rename-code--ops)) |
| **Status legend** | ✅ DONE · 🚧 IN PROGRESS · 📝 PLANNED |

| Layer | Stack | Path |
| --- | --- | --- |
| API + static | Node TS, Drizzle, PostgreSQL | `app/`, `modules/`, `lib/`, `db/` |
| Web | React + Vite + shadcn PWA | `web/` |
| Mobile | Expo Router | `mobile/` |
| Deploy | systemd, nginx, scripts | `deploy/` |

### Locked design rules

- One API for all clients — no separate mobile backend.
- **Clients are not projects** — projects/sites/pools/slots belong to the legal employer.
- Committed LOAs, allocation events, locked pay runs, and files are **immutable** — correct via new events/drafts.
- **Attendance** (P/AB/OD) drives payroll LOP; ending an allocation auto-adjusts attendance.
- **Date UI:** DD MMM YYYY; APIs ISO `YYYY-MM-DD`.

---

<a id="agent-quick-start"></a>

<details open>
<summary><strong>Agent quick start</strong> (Cursor / cloud agents)</summary>

1. `git pull` on `main` (or your feature branch); read [Development roadmap](#development-roadmap) checkboxes and changelog.
2. Code map: `app/*-http.ts` (routes), `modules/` (domain), `lib/schema.ts` + `db/migrations/`, `web/src/pages/`, `mobile/src/app/`.
3. Commands: `npm install`, `npm start`, `npm run check`, `npm run migrate:files` (file layout migration on server).
4. Env: `DATABASE_URL`, `FILES_DIR` (or legacy `FILE_ROOT`), `HOST`, `PORT` — see `.env.example`.
5. **Every commit that changes behavior** must update **this README** (checkboxes, changelog date, affected sections). Rule: [AGENTS.md](AGENTS.md), [.cursor/rules/docs-maintenance.mdc](.cursor/rules/docs-maintenance.mdc).
6. Server greenfield: `sudo bash install.sh` (or legacy wrapper `deploy/setup-fresh-debian.sh`) then `deploy/verify-server.sh`.
7. Status legend: ✅ DONE · 🚧 IN PROGRESS · 📝 PLANNED.

</details>

---

<a id="quick-start"></a>

## Quick start

```bash
cp .env.example .env   # DATABASE_URL, FILES_DIR, HOST, PORT, optional OPENAI_*
npm install && npm start              # http://127.0.0.1:3000/health
cd web && npm install && npm run dev  # Vite
npm run check                         # backend smoke tests
npm run mobile:install && npm run mobile
```

Field API base URL: `https://jacms.bluraymaldives.site` (override with `PUBLIC_DOMAIN` / `APP_URL` in `.env`).

---

<a id="fresh-install"></a>

## Fresh install (native & Docker)

JACMS is a **single office instance** (one API + one Postgres database + one file store). After cloning on a **fresh Debian 13** machine, choose **native** (systemd + host Postgres) or **Docker Compose**.

### Native — one command

```bash
git clone https://github.com/adhuhaam/jacms.git
cd jacms
sudo bash install.sh
```

`install.sh` is **idempotent** and safe to re-run. It:

| Step | Action |
| --- | --- |
| OS | Node 22 LTS, PostgreSQL, nginx, build tools, ImageMagick/vips |
| Database | Role `jacms`, database `jacms`, generated password in `.postgres-password` (gitignored) + `DATABASE_URL` in `.env` |
| App | `npm install`, build `web/`, `npm run migrate`, **empty data** (roles only) |
| Admin | Prompts for name / email / password — or `JACMS_ADMIN_NAME`, `JACMS_ADMIN_EMAIL`, `JACMS_ADMIN_PASSWORD` |
| Services | `jacms.service` (API on `127.0.0.1:3000`), nginx on `:80` → API |
| Tunnel | Optional paste of `CLOUDFLARE_TUNNEL_TOKEN` — public hostname **`jacms.bluraymaldives.site`** must route to `http://localhost:80` in Cloudflare |
| Backups | `jacms-backup.timer` — nightly `pg_dump` to `/var/backups/jacms`, **14-day** rotation |
| Finish | `deploy/verify-server.sh` + URL summary |

**Public URL env:** `PUBLIC_DOMAIN` (default `jacms.bluraymaldives.site`) and `APP_URL` (default `https://$PUBLIC_DOMAIN`) — used in CORS, docs, and mobile EAS defaults.

**Restore from backup:**

```bash
gunzip -c /var/backups/jacms/jacms-YYYYMMDDTHHMMSSZ.sql.gz | psql "$DATABASE_URL"
```

(`DATABASE_URL` from `.env`; stop `jacms` during restore if needed.)

### Docker Compose

```bash
cp .env.compose.example .env   # set POSTGRES_PASSWORD
docker compose up -d --build
docker compose run --rm \
  -e JACMS_ADMIN_NAME="Office Admin" \
  -e JACMS_ADMIN_EMAIL=admin@yourdomain.com \
  -e JACMS_ADMIN_PASSWORD='your-secure-password' \
  api npm run create-admin
```

| Service | Role |
| --- | --- |
| `postgres` | Database volume `jacms_pgdata` |
| `api` | Migrations on boot, files volume `jacms_files` |
| `web` | nginx serves `web/dist`, proxies `/api`, `/mcp`, `/health`, `/login` → `api` |
| `cloudflared` | Profile `tunnel` — set `CLOUDFLARE_TUNNEL_TOKEN` |
| `backup` | Profile `ops` — daily dumps in volume `jacms_backups` |

Local URL: `http://127.0.0.1:${HTTP_PORT:-8080}/` (default port **8080**). Point the Cloudflare tunnel at the host port nginx publishes (or run the `tunnel` profile against `web:80` on an internal network).

### Mobile (not built on the server)

Build on your workstation with [EAS](https://docs.expo.dev/eas/):

```bash
cd mobile && npm install
npm run eas:preview    # APK — EXPO_PUBLIC_JACMS_API_URL=https://jacms.bluraymaldives.site
```

The app stores the API URL on device; production default is **`https://jacms.bluraymaldives.site`**.

---

<a id="development-roadmap"></a>

## Development roadmap

### Changelog

| Date | Note |
| --- | --- |
| 2026-11-13 | **Fresh install PR:** `install.sh` one-shot Debian installer, Docker Compose stack, `PUBLIC_DOMAIN`/`APP_URL`, hostname **jacms.bluraymaldives.site**, `npm run create-admin`, nightly backups, typecheck fix, no auto admin seed. |
| 2026-11-13 | **PR #6:** Grok Bot MCP integration — full development guide in README (Streamable HTTP `/mcp`, `grokbot` service user + API keys, tool catalog, nginx/tunnel, security, testing, owner connect steps, troubleshooting). Docs only — no runtime MCP code. |
| 2026-11-13 | **PR #5:** Full rebrand NEXCRM → JACMS — packages `jacms` / `jacms-mobile`, `jacms.service`, cookie `jacms_session`, DB role/db `jacms` / `jacms_dev`, `deploy/migrate-rebrand.sh`, repo URLs `github.com/adhuhaam/jacms`. |
| 2026-11-12 | **PR #4:** Employee self-service web (`/ess/*`) + mobile (`(ess)` tabs), phone login, `/api/v1/ess/*`, HR self-service account, Xpat portal adapter placeholders, migration `031_employee_self_service.sql`. |
| 2026-11-12 | **PR #3:** `FILES_DIR` / `JACMS-Files` per-employee folders, `scripts/migrate-jacms-files-layout.ts`, `deploy/setup-fresh-debian.sh`, `deploy/verify-server.sh`, README agent quick start. |
| 2026-11-11 | Master plan rebrand: merged feature plan, checkbox inventory, milestones M1–M8; server guides in `docs/guides/`. |

---

### How to use this plan (Cursor agents)

1. Pull latest `main` or feature branch; read **Milestones** below.
2. Pick the **first milestone** with unchecked `- [ ]` tasks that match your assignment.
3. Mark task 🚧 in this file when you start; ✅ when shipped **in the same commit** as code/docs updates.
4. If scope is unclear, read pointers (`modules/…`, `web/src/pages/…`) under **Shipped inventory**.

---

### Shipped inventory (current codebase)

Each item is **implemented today** unless noted. Use pointers for implementation detail.

#### Platform, API, and deploy

- [x] **Monorepo layout** — Node API `app/`, domain `modules/`, Drizzle `lib/schema.ts`, SQL `db/migrations/`, React `web/`, Expo `mobile/` — [ARCHITECTURE.md](#architecture)
- [x] **HTTP server** — `app/server.ts`: migrate on boot, seed roles only, static SPA, `/health` — `app/server.ts`
- [x] **Shared JSON API** — `/api/v1/*` contract — [API.md](#api-reference)
- [x] **Env config** — `DATABASE_URL`, `FILES_DIR`, `PUBLIC_DOMAIN`, `APP_URL`, `HOST`, `PORT`, `DISPLAY_TIME_ZONE`, OpenAI OCR — `.env.example`
- [x] **Migrations 001–027+** — applied on API start under advisory lock — `db/migrations/`, [MASTER_PLAN historical table in git history]
- [x] **Smoke tests** — `npm run check` — `tests/*.test.ts`
- [x] **systemd unit `jacms.service`** — Node serves app on loopback — `deploy/jacms.service`, [DEPLOY.md](#deploy)
- [x] **nginx reverse proxy** — local/LAN `:80` → app `:3000` — `deploy/install-web-nginx.sh`, `deploy/jacms.nginx.conf`
- [x] **Postgres network install helper** — `deploy/install-postgres-network.sh`, `deploy/database-network.env` (not in git)
- [x] **Boot stack script** — `deploy/ensure-boot.sh` enables postgresql, nginx, jacms
- [x] **Native one-shot installer** — `install.sh` (wrapper: `deploy/setup-fresh-debian.sh`)
- [x] **Docker Compose stack** — `docker-compose.yml`, `Dockerfile.api`, `Dockerfile.web`
- [x] **First admin CLI** — `npm run create-admin` (install prompts or env)
- [x] **Nightly Postgres backups** — `deploy/jacms-backup.{sh,service,timer}`
- [x] **Server verification script** — `deploy/verify-server.sh` (pass/fail per component)
- [x] **NexCRM → JACMS server migration** — idempotent `deploy/migrate-rebrand.sh` (PR #5)
- [x] **Cloudflare Tunnel installer** — `deploy/install-cloudflare-tunnel.sh` → nginx origin — [CLOUDFLARE_TUNNEL.md](#cloudflare-tunnel)
- [x] **Server ops documentation** — merged into README (Debian setup, boot, tunnel, rename, mobile roadmap)
- [x] **Tailscale Serve / REMOTE** — optional admin path — [REMOTE.md](#remote-access-tailscale)

#### Auth, roles, and access (as built today)

- [x] **Email + password login** — scrypt, ~12h session — `modules/access/access.ts`, `POST /login`, cookie `jacms_session`
- [x] **Bearer token for mobile** — `Authorization: Bearer` on same session token — `app/*-http.ts`
- [x] **Ten built-in system roles** — above nine plus `employee_self_service` for staff portal — `modules/access/access.ts` (`seedRoles`), migration `031_employee_self_service.sql`
- [x] **Employee self-service auth** — phone + admin-set password, forced change on first login, scrypt sessions — `lib/phone.ts`, `POST /login` (`phone` or `email`), `users.phone` / `users.employee_id`
- [x] **Employee self-service API** — server-enforced own data only — `modules/employee-self/*`, `app/employee-self-http.ts`, `/api/v1/ess/*`
- [x] **HR: self-service account + Xpat sync** — `POST /api/v1/employees/:id/self-service-account`, `POST /api/v1/employees/:id/xpat-sync` (manual only), `modules/integrations/xpat-portal-adapter.ts` for future portal credentials
- [x] **Employee web portal** — shadcn tabs: Dashboard, Attendance, Salary, Xpat, Profile — `web/src/pages/employee-self.tsx`, routes `/ess/*`
- [x] **Employee mobile portal** — bottom tabs under `mobile/src/app/(ess)/` (Dashboard, Attendance, Salary, Xpat, More → Profile)
- [x] **Nine built-in office roles** — `system_admin`, `company`, `manager`, `hr_manager`, `hr_staff`, `client`, `vendor`, `agent`, `investor_guest` — `modules/access/access.ts` (`seedRoles`)
- [x] **Per-module permission matrix** — view/create/edit/delete per module key — `modules/access/permissions.ts`, migration `027_role_permissions.sql`
- [x] **Roles UI** — matrix editor in Settings — `web/src/pages/access.tsx`
- [x] **Users CRUD** — Settings → People — `app/access-http.ts`, `web/src/pages/users.tsx`
- [x] **Client assignment table** — `user_clients` + `setUserClients` — `modules/access/client-scope.ts` (enforcement **incomplete** on many routes — see Planned)
- [x] **System admin-only modules** — users, roles, settings, health flags — `ACCESS_ONLY_MODULES` in `permissions.ts`
- [x] **First admin** — `npm run create-admin` / `install.sh` prompt — optional dev `JACMS_AUTO_SEED_ADMIN=1` → `.admin-password`

#### Companies, clients, designations, branding

- [x] **Employer & client companies** — `kind` employer\|client — `modules/companies/companies.ts`, `web/src/pages/companies.tsx`, `clients.tsx`
- [x] **Company detail** — projects list, employees, branding file ids — `web/src/pages/company-detail.tsx`, `client-detail.tsx`
- [x] **Client designation monthly rates** — staff + bill month rates — `modules/hr/client-rates.ts`, `/api/v1/clients/:id/rates`
- [x] **Designations catalog** — office-wide job titles — `modules/hr/designations.ts`, `web/src/pages/designations.tsx`
- [x] **LOA branding assets** — letterhead, seal, signature upload — company routes in API.md

#### Employees, onboard, OCR, photos

- [x] **Employee CRUD** — directory, search, filters — `modules/hr/employees.ts`, `web/src/pages/employees.tsx`
- [x] **Profile photos** — multipart upload — `POST /api/v1/employees/:id/photo`
- [x] **Quick onboard** — scan passport, commit employee + optional allocation/housing — `modules/hr/onboard.ts`, `web/src/pages/employee-onboard.tsx`
- [x] **Passport OCR (OpenAI Vision)** — scan + apply — `modules/hr/passport-ocr.ts`, Settings stores key — `modules/settings/settings.ts`
- [x] **XPAT integration** — preview, import, sync one/all — `app/xpat-http.ts`, `modules/integrations/xpat*.ts`, UI in `employees.tsx`, `XpatStatusBadge`

#### LOAs (letters)

- [x] **LOA list & editor** — immutable snapshots on commit — `modules/documents/letters.ts`, `web/src/pages/loas.tsx`, `loa-editor.tsx`
- [x] **Signed LOA upload** — `POST /api/v1/letters/:id/signed-copy`
- [x] **Document numbering preview** — `GET /api/v1/letters/preview-number`

#### Allocations (secondment)

- [x] **Allocate staff to client** — dual monthly rates — `modules/hr/allocations.ts`, `web/src/pages/allocations.tsx`
- [x] **Rate change events** — `POST …/rate-change`
- [x] **End allocation** — resign, terminate, lost, transfer_out + attendance hook — `POST …/end`, `modules/hr/attendance.ts` `applyAllocationEndAttendance`
- [x] **Allocation detail & events** — `GET /api/v1/allocations/:id`

#### Attendance & overtime

- [x] **Daily attendance P / AB / OD** — manual + bulk — `modules/hr/attendance.ts`, `app/attendance-http.ts`
- [x] **Month grid** — years 2000–2100, per-employee save, bulk save — `web/src/pages/attendance.tsx`
- [x] **Period summary** — per allocation P/AB/OD/unmarked — `GET /api/v1/attendance/period-summary`
- [x] **OT rates** — company / project / client scope — `modules/hr/ot.ts`, `app/ot-http.ts`
- [x] **OT entries** — feed payroll — attendance page OT tab

#### Payroll

- [x] **Pay run generation** — `client_batch` \| `employer_client`, full calendar month — `modules/hr/payroll.ts`
- [x] **LOP math** — monthly rates, P+OD paid, AB/unmarked unpaid, + OT — [API.md](#api-reference) attendance section
- [x] **Lock / recalculate / delete draft** — immutable locked runs
- [x] **Payroll UI** — list, detail, lines — `web/src/pages/payroll.tsx`
- [x] **Salary sheet export** — `payroll-salary-sheet.tsx`
- [x] **Client payment request export** — `payroll-payment-request.tsx`
- [x] **Payslips view** — `payroll-payslips.tsx`

#### Accommodations

- [x] **Houses & stays** — check-in/out — `modules/hr/accommodations.ts`, `web/src/pages/accommodations.tsx`
- [x] **Unallocated stay charge preview** — `GET /api/v1/accommodations/charges`

#### Documents & files vault

- [x] **File storage on disk** — `FILES_DIR` / `FILE_ROOT` — `modules/files/storage.ts`, `modules/files/paths.ts`
- [x] **Per-employee GNOME-visible folders** — `<name>_<passport-or-no-passport>_<employee-id>` under `JACMS-Files` — `modules/files/paths.ts`
- [x] **File layout migration (re-runnable)** — `npm run migrate:files` → `scripts/migrate-jacms-files-layout.ts`
- [x] **Upload / download / entity filter** — `web/src/pages/documents.tsx`

#### Projects & work permits

- [x] **Projects, sites, quota pools, slots** — `modules/projects/projects.ts`, `web/src/pages/projects.tsx`
- [x] **Work permits CRUD** — `modules/hr/work-permits.ts`, `web/src/pages/work-permits.tsx`

#### Finance app (Expenses)

- [x] **Expenses launcher app** — `/apps/expenses` — `web/src/lib/apps.ts`, `modules/expenses/expenses.ts`, `web/src/pages/expenses.tsx`
- [x] **Categories** — client_payment, investment, other — [PRODUCT.md](#product-map)

#### Settings, preferences, and admin API

- [x] **Office preferences** — region, currency — `modules/companies/preferences.ts`, Settings → General
- [x] **System settings KV** — OpenAI OCR key/model (masked GET) — `modules/settings/settings.ts`, `app/access-http.ts`
- [x] **Admin access JSON** — roles + users payload — `GET /api/v1/admin/access`
- [x] **Role CRUD** — create/update/delete non-system roles — admin routes in [API.md](#api-reference)
- [x] **HR dashboard API** — counts, headcount — `GET /api/v1/hr/dashboard`, `modules/hr/dashboard-finance.ts`

#### Web SPA shell & UX (current)

- [x] **Workspace + Operations nav** — `web/src/components/shell.tsx`
- [x] **Finance app icons** — sidebar launcher — `web/src/lib/apps.ts`
- [x] **Soft routing / lazy pages** — `web/src/App.tsx`, `web/src/lib/spa-nav.ts`
- [x] **Command palette** — `web/src/components/command-palette.tsx`
- [x] **PWA manifest** — still named JACMS in `web/public/manifest.webmanifest`
- [x] **shadcn/ui components** — `web/src/components/ui/*` (pre-redesign styling)
- [x] **Login page** — `web/src/pages/login.tsx`
- [x] **Dashboard** — headcount + finance cards — `web/src/pages/dashboard.tsx`, `modules/hr/dashboard-finance.ts`
- [x] **Settings hub** — General, People, Roles, Health tabs — `web/src/pages/access.tsx`
- [x] **Server health page (v1)** — system_admin, auto-refresh 2.5s — `web/src/pages/settings-health.tsx`, `GET /api/v1/admin/health`

#### Mobile (Expo)

- [x] **Connect + login** — any API URL, Bearer token — `mobile/src/app/login.tsx`, `mobile/src/lib/auth.tsx`
- [x] **Tabs** — dashboard, companies, clients, employees, payroll, more — `mobile/src/app/(tabs)/`
- [x] **Companies** — list, detail, form — `mobile/src/app/companies/`
- [x] **Clients** — list, form — `mobile/src/app/clients/`
- [x] **Employees** — list, detail, form — `mobile/src/app/employees/`
- [x] **Allocations** — list, detail, form, resign, rate change — `mobile/src/app/allocations/`
- [x] **LOAs** — list, detail, simple create — `mobile/src/app/loas/`
- [x] **Payroll** — list, detail, create, lock — `mobile/src/app/payroll/`
- [x] **Work permits** — list, form — `mobile/src/app/work-permits/`
- [x] **Projects** — list, detail — `mobile/src/app/projects/`
- [x] **Expenses** — list, form — `mobile/src/app/expenses/`
- [x] **EAS preview profile documented** — `mobile/README.md` (no CI wired in repo)

#### Mobile gaps (not shipped — do not check as done)

- Attendance month sheet, accommodations, onboard/OCR, rich LOA PDF, admin/settings/roles, permission-aware menus (see [mobile/README.md](../mobile/README.md))

#### Domain rules (locked — always enforce)

- [x] Clients ≠ projects; projects belong to legal employer — [AGENTS.md](#agent-quick-reference)
- [x] Immutable committed LOAs, allocation events, locked pay runs, files — correct via new events/drafts
- [x] Attendance drives payroll LOP; allocation end auto-adjusts attendance
- [x] Single API for web + mobile — no forked business logic in mobile

---

### Planned work (owner decisions)

Items below are **not done** in code unless marked 🚧. Breakdown supports milestone checklists.

#### P1 — Server auto-start (Debian desktop)

- [ ] Document & verify BIOS **Restore on AC power loss = Power On** — [Autostart on boot](#autostart-on-boot)
- [ ] **GNOME auto-login** (no password) for desktop user `server`
- [ ] **Cursor opens automatically** after GNOME login (autostart `.desktop`)
- [ ] systemd: `postgresql`, `jacms`, `nginx`, `cloudflared` enabled **without user login**
- [ ] App starts when **no network** at boot; **cloudflared** `Restart=always` / retry until tunnel up (no hard `Requires=network-online` on app)
- [ ] Optional drop-in for `cloudflared` After=nginx — guide documents pattern
- [x] Post-boot checklist automated or scripted (health curls) — `deploy/verify-server.sh`

#### P2 — Role-based login (7 roles)

- [ ] Collapse to **7 roles**: system_admin, hr_manager, hr_staff, manager, client, employee_self_service, agency — merge/remove company, vendor, investor_guest, agent
- [x] **Employee self-service**: phone + password sign-in — `employee_self_service` role, `/ess` + `/api/v1/ess/*`
- [ ] **Agency role**: own candidates, passport upload, permit/visa tracking
- [ ] **Client role dashboard**: allocated workers, attendance, OT, worker docs — no invoices/pay runs
- [ ] **Per-role landing dashboard** after login (web + mobile)
- [ ] **Fix client scoping on every endpoint** — allocations by id, mutations, client rates, `companies?kind=client`, dashboard, employees, attendance, OT, documents, work permits, … — `modules/access/client-scope.ts` + routers
- [ ] **Hide menus/pages** by module permissions (web shell + mobile) — not aggregate flags only
- [ ] **Mobile session loads** permission matrix + client scope
- [ ] **Admin-only password reset** (no self-service email link)
- [ ] **Login rate limiting / lockout**
- [ ] **Audit log** — logins, role changes, record changes, bot actions — system_admin UI

#### P3 — Server health & status (enhanced)

- [ ] Auto-refresh every **10 seconds** (today 2.5s partial) — `settings-health.tsx`
- [ ] Show CPU, RAM, disk, temperature (where available)
- [ ] Status: JACMS API, PostgreSQL, nginx, **Cloudflare tunnel** connector
- [ ] Uptime, last boot, network/internet reachability
- [ ] Recent errors / log tail; **last DB backup** status
- [ ] Parity on **mobile** for system_admin (optional phase)

#### P4 — Grok Bot connectivity

Implementation spec: [Grok Bot MCP guide](#grok-bot-plan). Grok Bot calls the MCP endpoint from **its backend** — the URL must be **public HTTPS** (tunnel), not LAN-only.

- [ ] **`grokbot` service user** + dedicated role; permissions via existing `role_permissions` matrix
- [ ] **`api_keys` table** — hashed secrets, label, scopes, per-key rate limit, created/rotated/revoked in **Settings → API keys** (system_admin)
- [ ] **MCP route** — `@modelcontextprotocol/sdk` TypeScript server, **Streamable HTTP** transport, mounted at **`/mcp`** on the Node API (`app/mcp-server.ts` or `app/mcp-http.ts`)
- [ ] **nginx `location /mcp`** — streaming/SSE-friendly proxy (`proxy_buffering off`, long `proxy_read_timeout`) in `deploy/jacms.nginx.conf`
- [ ] **Public URL** — `https://jacms.bluraymaldives.site/mcp` via existing Cloudflare tunnel → nginx (see [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms))
- [ ] **REST parity** — same Bearer API key on `/api/v1/*` as MCP (shared auth middleware)
- [ ] **RBAC + audit** — every tool/REST call runs normal permission checks; `audit_log.actor = grokbot` (display name "Grok Bot")
- [ ] **Write tools** — Zod input schemas; destructive tools annotated + require `confirm: true`; Grok Bot **owner approval in chat** before any write (client policy — JACMS still enforces RBAC)
- [ ] **Read tool catalog** — `search_employees`, `get_employee`, `list_clients`, `get_attendance`, `get_payroll_summary`, `get_xpat_status`, `get_server_health`
- [ ] **Write tool catalog** — employee create/update, record attendance, allocate to client, upload/link document, trigger Xpat sync, whitelisted server actions (restart service, backup)
- [ ] **Optional** — MCP resources + prompts (employee summary, payroll period) — phase 2
- [ ] **Health alerts** — webhook on partial stack failure; Grok Bot scheduled routine pings `GET /api/health` or public `/health` for down alerts
- [ ] **Secrets** — API key only on server + Grok Bot connector; **never** in git; document in `.env.example` as `GROKBOT_*` placeholders only

#### P5 — Full UI redesign

- [ ] **Web**: shadcn default — collapsible left sidebar, light/dark toggle, navy/black dark palette
- [ ] **Mobile**: React Native Reusables + NativeWind; bottom tabs + More menu
- [ ] **Tables**: search, filters, sort, export Excel + PDF
- [ ] **Mobile lists**: card layout; visual parity with web

#### P6 — Living documentation

- [x] Mandatory rule in README.md, `AGENTS.md`, `mobile/AGENTS.md`, `.cursor/rules/docs-maintenance.mdc`
- [x] All former `docs/*.md` and guides merged into README.md (stubs only elsewhere)
- [ ] Enforce in PR review / agent workflow: every feature PR touches checkboxes + changelog

#### P7 — JACMS rename (code)

- [x] Follow [JACMS rename plan](#jacms-rename-plan) — **PR #5** (package, service, tunnel default `jacms`, PWA, DB + `migrate-rebrand.sh`)

#### P8 — Mobile Android preview

- [ ] EAS **preview** APK with base URL `https://jacms.bluraymaldives.site`
- [ ] Office Metro on Debian LAN (dev-only) — [Android preview roadmap](#mobile-expo-android-preview)
- [ ] Attendance + permissions parity milestones (separate tasks under P2/P5)

---

### Milestones (build order)

Pick the next unchecked task in the earliest incomplete milestone.

#### M1 — Master documentation & guides

**Goal:** Single checklist-driven roadmap; server ops docs; JACMS naming in docs; Cursor always loads maintenance rule.

**Checklist**

- [x] Single `README.md` master document with shipped inventory + planned + milestones
- [x] Server ops sections merged into README (deploy, Debian, tunnel, boot)
- [x] README is the only full doc; deleted duplicate markdown under `docs/`
- [x] `.cursor/rules/docs-maintenance.mdc` (`alwaysApply: true`)
- [x] Mandatory rule in AGENTS.md, docs README, guides README

**Acceptance:** Owner can open README → MASTER_PLAN → pick an unchecked `- [ ]`; agents pull rule without extra setup.

---

#### M2 — Boot resilience (Debian GNOME server)

**Goal:** After power loss, stack serves LAN + tunnel URL without manual login; Cursor ready on console.

**Checklist**

- [x] BIOS AC-restore documented (owner verifies on hardware) — [Autostart on boot](#autostart-on-boot), `deploy/setup-fresh-debian.sh`
- [ ] GNOME passwordless auto-login for `server` (owner GDM config)
- [x] Cursor autostart `.desktop` shipped — `deploy/cursor-open.desktop`
- [x] JACMS browser autostart — `deploy/jacms-open.desktop`
- [ ] All systemd units enabled on production host (postgres, jacms, nginx, cloudflared)
- [ ] App local without WAN; cloudflared retries (verify after reboot)
- [x] `deploy/setup-fresh-debian.sh` + `deploy/verify-server.sh` for stack bring-up
- [x] `deploy/ensure-boot.sh` for unit enablement on existing hosts
- [x] Guides match scripts: [Autostart on boot](#autostart-on-boot), [Debian server setup](#debian-server-setup)

**Acceptance:** Reboot test: `curl https://jacms.bluraymaldives.site/health` within N minutes without typing password; `systemctl is-active` all green.

---

#### M3 — JACMS rename (code & ops)

**Goal:** Product strings and ops artifacts say JACMS; minimal downtime.

**Checklist**

- [x] Execute [JACMS rename plan](#jacms-rename-plan) — **PR #5**
- [x] Update README checkboxes for renamed paths
- [x] Public hostname **jacms.bluraymaldives.site** (`PUBLIC_DOMAIN` / `APP_URL`)

**Acceptance:** PWA title JACMS; `systemctl status jacms` on upgraded hosts; docs and commands consistent. Production: run `sudo bash deploy/migrate-rebrand.sh` after pull + repo rename.

---

#### M4 — RBAC v2 (7 roles, scoping, menus)

**Goal:** Correct data isolation especially for **client** and **agency**; menus match permissions.

**Checklist**

- [ ] All **P2** role/scoping tasks
- [ ] Migration for new roles / user phone login
- [ ] API.md + PRODUCT.md updated
- [ ] Tests for client-scope on critical routes

**Acceptance:** Client user cannot `GET` another client’s allocation by ID; web/mobile menus hide forbidden modules.

---

#### M5 — Operations health dashboard v2

**Goal:** system_admin sees live server + tunnel + backup every 10s.

**Checklist**

- [ ] All **P3** tasks
- [ ] Backend aggregates tunnel status (read cloudflared/nginx/pg)
- [ ] No secret leakage in health JSON

**Acceptance:** Health page matches checklist; manual failover of cloudflared reflected within 10s.

---

#### M6 — Grok Bot

**Goal:** Owner-approved agent automation against production with audit trail.

**Spec:** [Grok Bot MCP guide](#grok-bot-plan) — Cursor agents implement P4 checkboxes in order (auth → `/mcp` handler → tools → nginx → deploy).

**Checklist**

- [ ] All **P4** tasks completed in code + deploy
- [ ] MCP Inspector smoke: `npx @modelcontextprotocol/inspector` against tunnel URL with Bearer key
- [ ] Owner [Connect Grok Bot](#connect-grok-bot) steps verified on production hostname
- [ ] Read tools return data scoped to `grokbot` role; write tools reject without `confirm: true`
- [ ] Grok Bot approval policy documented (writes need owner OK in Grok chat — not enforced server-side)
- [ ] Troubleshooting table in README matches observed failure modes

**Acceptance:** Read works with key; destructive write rejected without `confirm`; audit row per mutating call; `curl` + Inspector pass; Grok Bot lists tools after next message.

---

#### M7 — UI redesign (web + mobile)

**Goal:** Cohesive shadcn / RN Reusables experience.

**Checklist**

- [ ] All **P5** tasks module-by-module (suggest payroll → allocations → employees first)
- [ ] Dark/light toggle persisted

**Acceptance:** Design review on dashboard + one operations module + one mobile tab.

---

#### M8 — Mobile field release

**Goal:** Preview APK for managers; API URL production.

**Checklist**

- [ ] EAS preview build in CI or documented manual release
- [ ] Permission-aware mobile (depends M4)
- [ ] [mobile-expo-android-preview.md](#mobile-expo-android-preview) updated with actual artifact flow

**Acceptance:** APK installs; login to `https://jacms.bluraymaldives.site`; smoke list screens.

---

### Open items

_Add Adhuhaam’s new ideas here with date bullets; promote into Planned when scoped._

- (none yet in repo)

---

### Agent quick reference

| Need | Path |
| --- | --- |
| Master roadmap | README.md (this file) |
| HTTP routes | [API.md](#api-reference) |
| Permissions modules | `modules/access/permissions.ts` |
| Web routes | `web/src/App.tsx` |
| Mobile routes | `mobile/src/app/` |
| Deploy | [DEPLOY.md](#deploy), `deploy/` |
| Server setup | [guides/README.md](#debian-server-architecture) |

```bash
npm start                      # API + web/dist
cd web && npm run build
npm run check                  # backend smoke tests
cd mobile && npm run typecheck
```

| 2026-11-11 | **README.md** is the single master document; merged all `docs/*.md` and guides. |

---

<a id="debian-server-architecture"></a>

## Server architecture (Debian)

Step-by-step guides for running **JACMS** (JA CRM — the planned product name for this monorepo, today still **JACMS** in code) on a **Debian desktop server** (16 GB RAM, **GNOME**, wired Ethernet) with **Cloudflare Tunnel** for public HTTPS. These docs complement [Deploy](#deploy) and [Cloudflare Tunnel](#cloudflare-tunnel). **Roadmap:** [Development roadmap](#development-roadmap) milestone **M2**.

#### Who this is for

| Scenario | Start here |
| --- | --- |
| New Debian 16 GB RAM desktop as the office server; dev in **Cursor** on the same machine | [Debian server setup](#debian-server-setup) |
| Survive reboot / power loss without manual steps | [Autostart on boot](#autostart-on-boot) |
| Public URL `https://jacms.bluraymaldives.site` (no router port-forward) | [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms) |
| Planned rename JACMS → JACMS (checklist only — no code change yet) | [JACMS rename plan](#jacms-rename-plan) |
| Future Expo Android preview APK / Metro on this host | [Android preview roadmap](#mobile-expo-android-preview) |

#### Target architecture

```mermaid
flowchart LR
  User[Browser / PWA] -->|HTTPS| CF[Cloudflare edge]
  CF -->|named tunnel| cloudflared
  cloudflared --> Nginx[nginx 127.0.0.1:80]
  Nginx --> App[Node 127.0.0.1:3000]
  App --> PG[(PostgreSQL)]
  Dev[Cursor on Debian host] --> App
```

| Component | Bind | Notes |
| --- | --- | --- |
| Node app | `127.0.0.1:3000` | `HOST` / `PORT` in `.env` — see [.env.example](../../.env.example) |
| nginx | `127.0.0.1:80` (+ optional LAN/Tailscale per [Deploy](#deploy)) | Tunnel origin should be **nginx**, not Node directly |
| PostgreSQL | local socket (+ optional LAN TCP) | Never expose `:5432` through the tunnel |
| cloudflared | outbound to Cloudflare | systemd unit `cloudflared` |

#### Related repo docs

| Doc | Purpose |
| --- | --- |
| [../DEPLOY.md](../DEPLOY.md) | nginx, systemd, Postgres network, day-2 commands |
| [../CLOUDFLARE_TUNNEL.md](../CLOUDFLARE_TUNNEL.md) | Tunnel concepts and `deploy/install-cloudflare-tunnel.sh` |
| [../REMOTE.md](../REMOTE.md) | Optional Tailscale SSH / Cursor remote |
| [../README.md](#table-of-contents) | Docs index |

#### Conventions in these guides

- **Placeholders** for secrets: `YOUR_CLOUDFLARE_TOKEN`, `YOUR_DB_PASSWORD`, etc. Never commit real credentials.
- Paths use today’s layout (`/home/server/dev/jacms`); [JACMS rename plan](#jacms-rename-plan) lists planned renames.
- Commands assume **Debian stable** (current bookworm or successor) and a dedicated `server` (or similarly named) Unix user.
---

<a id="product-map"></a>

<details>
<summary><strong>Product map</strong> (expand)</summary>

JACMS is the office **super app** for a manpower agency that also runs light finance.

**Date display:** everywhere in the UI uses **DD MMM YYYY** (e.g. `04 Nov 2026`). APIs and `<input type="date">` fields still store/send ISO `YYYY-MM-DD`.

#### Agency (core CRM / HR)

Primary navigation: **Workspace** + **Operations**.

| Area | Web routes | Purpose |
| --- | --- | --- |
| Dashboard | `/` | Headcount by client, counts, recent LOAs |
| Companies | `/companies`, `/companies/:id` | Employers & clients; letterhead / seal / signature uploads for LOAs |
| Employees | `/employees`, `/employees/onboard` | Records, photos, Quick Create (OCR or manual) |
| LOAs | `/loas`, `/loas/new` | Appointment letters (immutable snapshots) |
| Clients | `/clients` | Client companies + monthly rates by designation |
| Designations | `/designations` | Office-wide job titles (dropdown catalog for employees, rates, allocations) |
| Allocations | `/allocations` | Secondment + dual monthly rates |
| Attendance | `/attendance` | Monthly P/AB/OD day grid (any year 2000–2100), bulk tools, log, OT |
| Accommodations | `/accommodations` | Housing + charge preview |
| Payroll | `/payroll` | Monthly salary pay runs; export salary sheet + client payment request |
| Documents | `/documents` | Vault / passport flows |
| Work permits | `/work-permits` | Permit tracking |
| Projects | `/projects` | Sites, quota pools, slots |
| Settings | `/settings` (also `/users`, `/admin`) | Office hub: General, People, Roles, Health; OCR / region / currency |

##### Agency rules (product)

- **You are the agency** (e.g. LEO Employment Services). Placement chain: **Legal employer → Project → Site → Quota pool → Slot → Employee**, then optionally **allocated** to a **client** for attendance/payroll. The agency is not the legal-employer column.
- **Clients are not projects.** A client (e.g. Ayada Maldives) is only the secondment / billing destination. Projects, sites, pools, and slots belong to the worker’s **legal employer**, never to the client company.
- **One client, many legal employers:** a client can host allocated workers from different WP holders at the same time. Each allocation keeps its own legal employer; payroll **client batch** opens one draft per employer on that client.
- **Designations** are a shared catalog (Labor, Mason, …). Add them once; pick via dropdown on employee, client rates, allocate, and onboard.
- **Staff salary** (pay worker) and **bill rate** (charge client) are separate monthly amounts by designation.
- **End allocation** quick actions: resign / terminate / lost / transfer out — with reason note. Attendance auto-clears after the last day; **lost** also marks AB from a chosen absent-from date. Mid-period leavers still appear in that month’s payroll through the end date.
- **Attendance** is marked manually per day (P / AB / OD) for any month/year; bulk fill and save-all are supported.
- **Payroll** uses monthly designation salaries: daily = monthly ÷ days-in-month; net = daily × paid days (P+OD) + OT. Full month present pays/bills the full monthly amount. Set rates on the client by designation (or employee defaults); allocate with start/end dates. Unmarked days count as AB. Export salary sheet and client payment request from a pay run.
- Payroll generation: **client batch** (one draft per employer on that client) or **employer × client** (single scoped draft). Locked runs are immutable; drafts can be recalculated or deleted.
- Committed allocations, LOAs, locked pay runs, and files are **immutable** — correct via new events, not silent edits.
- Passport **Quick onboard** uses ChatGPT Vision when an API key is configured in Settings.

#### Finance apps (launcher)

Reached from the sidebar **app icons** above the user menu (`web/src/lib/apps.ts`), not from Operations.

| App | Short | Status | Route | API |
| --- | --- | --- | --- | --- |
| Expenses | EX | **Shipped** | `/apps/expenses` | `/api/v1/expenses` |
| Investments | IN | Planned | `/apps/investments` | `/api/v1/investments` |
| Finance projects | PR | Planned | `/apps/projects` or deepen CRM projects | TBD |

##### Expenses (v1)

- Amount, date, currency (default MVR), note.
- Categories: **Client payment** (optional link to client company), **Investment** (free-text counterparty), **Other**.
- Filters + category totals on the page.

##### Investments (planned)

Dedicated investment register (capital out / returns), separate from expense rows tagged `investment`. Keep expense category for quick cash-out logging until the register ships.

##### Projects (finance lens, planned)

CRM already has operational **projects** (sites/slots). Finance projects may mean budgets, cost centres, or capital projects — decide whether to extend `projects` or add a finance-specific entity when implementing.

#### Clients

| Client | Role |
| --- | --- |
| React web + PWA | Full office UI; installable on mobile browsers |
| Expo mobile | Field / on-the-go agency flows against the same API |

Both must stay API-compatible. Prefer shipping API + web first, then mobile screens.

#### Roadmap sketch

```mermaid
flowchart TB
  subgraph now [Now]
    Agency[Agency CRM HR]
    EX[Expenses app]
    API[Shared /api/v1]
  end
  subgraph next [Next]
    IN[Investments app]
    FP[Finance projects]
    MobileParity[Mobile parity for apps]
  end
  Agency --> API
  EX --> API
  API --> IN
  API --> FP
  API --> MobileParity
```

</details>

<a id="architecture"></a>

<details>
<summary><strong>Architecture</strong> (expand)</summary>

Full product + codebase map: [MASTER_PLAN.md](#development-roadmap).

JACMS is a single Node HTTP server that:

1. Serves the production React SPA from `web/dist` (including PWA assets).
2. Exposes JSON APIs under `/api/v1/*` used by **web** and **mobile**.
3. Talks to **PostgreSQL** via `pg` + Drizzle schema in `lib/schema.ts`.
4. Stores uploads under `FILES_DIR` (default `/home/<user>/JACMS-Files`; metadata in `files` / `file_links`).

#### Monorepo layout

```
jacms/
  app/           HTTP entry (server.ts), routers (*-http.ts), static SPA
  modules/       Domain logic (access, companies, hr, expenses, files, settings, …)
  lib/           db, env, migrate, schema, health
  db/migrations/ Ordered SQL migrations (auto-applied on boot)
  web/           React + Vite office UI (PWA)
  mobile/        Expo client (same API, Tailscale base URL)
  README.md      Single master documentation (product, API, deploy)
  tests/         Node strip-types smoke tests
```

#### Request flow

```mermaid
sequenceDiagram
  participant C as Web or Mobile
  participant S as app/server.ts
  participant A as guardAccess
  participant H as domain *-http.ts
  participant M as modules/*
  participant DB as PostgreSQL

  C->>S: HTTP + session cookie
  S->>A: authorize session + role
  alt API
    A->>H: route /api/v1/...
    H->>M: business rules
    M->>DB: SQL / Drizzle
    H-->>C: JSON
  else SPA asset / navigate
    S-->>C: static web/dist (+ SPA fallback)
  end
```

#### Auth

- Cookie session: `jacms_session` (HttpOnly, SameSite=Lax).
- `POST /login` — body `{ email, password }` (office) or `{ phone, password }` (employee). Returns `location` (`/` or `/ess`), `token`, `mustChangePassword`.
- `POST /logout`, `GET /api/v1/session` (includes `employeeId`, `mustChangePassword` for staff).
- Roles in `roles` / `users` (`system_admin`, `hr_manager`, …). Coarse flags plus per-module View/Create/Edit/Delete in `role_permissions` (`modules/access/permissions.ts`).
- Settings hub routes: `/settings` (also `/users`, `/admin`) → General / People / Roles / Health.

Mobile uses the same cookie/session model against the published API origin (see `mobile/src/lib/config.ts`).

#### Frontend apps

##### Web (`web/`)

- Vite React SPA; production build copied/served from `web/dist`. Soft SPA nav via `web/src/lib/spa-nav.ts` + lazy routes in `App.tsx`.
- Shell: Workspace + Operations + **Settings**; **app icon launcher** above the user footer (`web/src/lib/apps.ts`); mobile bottom nav.
- PWA: `manifest.webmanifest`, `sw.js`, install prompt.
- Integrations UI: OpenAI OCR key, office/region/currency under Settings → General.

##### Mobile (`mobile/`)

- Expo Router tabs + stack screens for core agency flows.
- **Must** call the same `/api/v1` contract — no parallel business logic on device beyond UI.

#### Domain modules (backend)

| Area | Module folder | Notes |
| --- | --- | --- |
| Access | `modules/access` | Sessions, roles, users, permission matrix |
| Companies | `modules/companies` | Employer / client kinds |
| HR / agency | `modules/hr` | Employees, allocations, attendance, payroll, designations, OCR onboard |
| Projects | `modules/projects` | Projects, sites, pools, slots |
| Documents | `modules/documents` | LOAs / letters, snapshots |
| Files | `modules/files` | Upload / download / vault |
| Expenses | `modules/expenses` | Finance app v1 |
| Settings | `modules/settings` | Office prefs + OpenAI OCR |
| Integrations | `modules/integrations` | XPAT sync helpers |

#### Data & migrations

- SQL files in `db/migrations/` (`001_…` through `027_role_permissions.sql`, …).
- `lib/migrate.ts` applies pending files on server start.
- Drizzle mirror: `lib/schema.ts` (keep in sync when adding tables). See [MASTER_PLAN.md](#development-roadmap) for the migration table.

#### Environment

See `.env.example`:

- `DATABASE_URL` — PostgreSQL
- `FILES_DIR` — absolute path for binary storage (`FILE_ROOT` accepted as alias; dev fallback `data/jacms-files`)
- `HOST` / `PORT` — API listen address
- `OPENAI_API_KEY` / `OPENAI_OCR_MODEL` — optional env fallback; preferred store is System settings DB

#### Extending the super app

1. **New agency feature** — module + `*-http.ts` + web page under existing nav; add mobile screen if needed; document in [API reference](#api-reference) in this README.
2. **New finance app** — row in `web/src/lib/apps.ts`, route `/apps/<slug>`, own module + `/api/v1/<resource>`; keep CRM Operations nav clean.
3. **Never** fork business rules into the mobile app — call the API.

</details>

<a id="api-reference"></a>

<details>
<summary><strong>API reference (`/api/v1`)</strong> (expand)</summary>

Shared JSON API for the React web app and Expo mobile app.  
Base URL examples:

- Local: `http://127.0.0.1:3000`
- Tailscale (mobile): `https://server-1.snowy-pride.ts.net` (see `mobile/src/lib/config.ts`)

All authenticated routes require the `jacms_session` cookie from `POST /login`.  
Mutations that change data should be same-origin (browser) / cookie-authenticated (mobile).

Responses are JSON. Errors: `{ "error": "…" }` with 4xx/5xx.

#### Auth & session

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/login` | `{ email, password }` (office) or `{ phone, password }` (employee) → cookie + JSON `location`, `token` |
| POST | `/logout` | Clears session |
| GET | `/api/v1/session` | Current user + role + `employeeId` / `mustChangePassword` when applicable |
| GET | `/health` | Liveness / DB check (no auth) |

#### Employee self-service (`employee_self_service` role only)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/ess/dashboard` | Xpat card, month attendance, last salary, current client |
| GET | `/api/v1/ess/attendance?month=YYYY-MM` | Month calendar (P/AB/OD) |
| GET | `/api/v1/ess/salary/history` | Locked pay-run lines for this employee |
| GET | `/api/v1/ess/salary?month=YYYY-MM` | Single month summary |
| GET | `/api/v1/ess/salary/:payRunId/payslip` | Payslip line (print/PDF in browser) |
| GET | `/api/v1/ess/xpat` | Permits, visa, allocation history |
| GET | `/api/v1/ess/profile` | Phone + flags |
| POST | `/api/v1/ess/profile/phone` | `{ phone, phoneConfirm }` |
| POST | `/api/v1/ess/profile/password` | `{ currentPassword, newPassword }` (min 8) |
| POST | `/api/v1/ess/change-password` | Same as password (first-login gate) |

HR (office roles with employee edit): `POST /api/v1/employees/:id/self-service-account` `{ phone, password }` — admin-set password; employee must change on first login. XPAT data: `POST /api/v1/employees/:id/xpat-sync` (manual **Sync from Xpat**; no auto sync). Optional future portal: `XPAT_PORTAL_*` in `.env.example` + `modules/integrations/xpat-portal-adapter.ts`.

#### Admin (system_admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/admin/access` | Roles + users |
| POST | `/api/v1/admin/roles` | Create role |
| POST | `/api/v1/admin/roles/:id` | Update role |
| POST | `/api/v1/admin/roles/:id/delete` | Delete non-system role |
| POST | `/api/v1/admin/users` | Create user |
| POST | `/api/v1/admin/users/:id` | Update user |
| GET/POST | `/api/v1/admin/settings` | OpenAI OCR key + model (masked on GET) |
| GET | `/api/v1/admin/health` | Live host / DB / disk / app process health (system_admin) |

#### Companies & clients

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/companies` | Optional `?kind=employer\|client` |
| GET | `/api/v1/companies/:id` | Detail + projects + employees + branding file ids |
| POST/PATCH | `/api/v1/companies` / `…/:id` | CRUD |
| POST/DELETE | `/api/v1/companies/:id/assets/{letterhead\|seal\|signature}` | Upload or clear LOA branding images |
| GET | `/api/v1/employers` | Employer companies |
| GET | `/api/v1/clients` | Client companies |
| GET/POST | `/api/v1/clients/:id/rates` | List / upsert designation monthly rates (staff + bill) |
| DELETE | `/api/v1/clients/:id/rates/:rateId` | Remove a designation rate |
| POST | `/api/v1/clients` | Create client |
| GET/POST | `/api/v1/designations` | List / create office-wide designations (`?includeInactive=1`) |
| PATCH/DELETE | `/api/v1/designations/:id` | Update or deactivate a designation |

#### Employees & onboard

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/employees` | List; `?q=` search |
| GET | `/api/v1/employees/options` | Projects/sites/pools for company |
| GET/POST/PATCH | `/api/v1/employees` / `…/:id` | CRUD |
| POST | `/api/v1/employees/:id/photo` | Multipart profile photo |
| GET | `/api/v1/onboard/options` | Employers, clients, houses, OCR status |
| POST | `/api/v1/employees/onboard/scan` | Passport image → ChatGPT Vision fields |
| POST | `/api/v1/employees/onboard` | Commit onboard (+ optional allocation/housing) |
| POST | `/api/v1/employees/:id/passport-ocr` | Per-employee OCR |
| POST | `/api/v1/employees/:id/passport-ocr/apply` | Apply reviewed OCR fields |

List items include `photoFileId` (nullable). Download: `GET /api/v1/files/:id/download`.

#### Agency operations

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/v1/allocations` | Client secondments |
| GET | `/api/v1/allocations/:id` | Detail + events |
| POST | `/api/v1/allocations/:id/end` | End with reason `resign`\|`terminate`\|`lost`\|`transfer_out` + note; auto-adjusts attendance |
| POST | `/api/v1/allocations/:id/resign` | Shortcut for end with reason resign |
| POST | `/api/v1/allocations/:id/rate-change` | New rate event |
| GET | `/api/v1/pay-runs` | List + clients + employers |
| GET | `/api/v1/pay-runs/employers-for-client` | `?clientCompanyId=` employers with active allocations |
| POST | `/api/v1/pay-runs` | Generate: `{ mode: client_batch\|employer_client, clientCompanyId, employerCompanyId?, periodStart, periodEnd }` → `{ payRuns }` (full calendar month only) |
| GET | `/api/v1/pay-runs/:id` | Lines with LOP/OT nets |
| POST | `/api/v1/pay-runs/:id/lock` | Immutable lock |
| POST | `/api/v1/pay-runs/:id/recalculate` | Draft only — re-read attendance + OT |
| DELETE | `/api/v1/pay-runs/:id` | Draft only |
| GET/POST | `/api/v1/accommodations` | Houses |
| GET | `/api/v1/accommodations/charges` | Unallocated stay charge preview |
| PATCH | `/api/v1/accommodations/:id` | Update house |
| POST | `/api/v1/accommodations/:id/check-in` | Check in |
| POST | `/api/v1/accommodations/stays/:id/check-out` | Check out |

#### Projects & work permits

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/projects` | List |
| GET | `/api/v1/projects/:id` | Detail (sites, pools, slots) |
| GET | `/api/v1/work-permits` | List |
| CRUD | work-permit routes via `work-permits-http` | As used by web |

(Prefer matching existing web/mobile callers when extending.)

#### Documents & files

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/v1/letters` | LOAs |
| GET | `/api/v1/letters/:id` | Letter + snapshot |
| GET | `/api/v1/letters/preview-number` | Next document number |
| POST | `/api/v1/letters/:id/signed-copy` | Upload signed LOA |
| GET | `/api/v1/files` | `?entityType=&entityId=` |
| POST | `/api/v1/files` | Multipart upload |
| GET | `/api/v1/files/:id/download` | Stream file |
| GET | `/api/v1/hr/dashboard` | Counts + headcount by client |

#### Attendance

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/attendance` | Filters: from, to, status (`P`\|`AB`\|`OD`), employeeId, companyId, q |
| GET | `/api/v1/attendance/month` | `?year=&month=&companyId=&q=` → employees × day map (years 2000–2100) |
| POST | `/api/v1/attendance/month/employee` | Save one employee month `{ employeeId, year, month, days:{ "1":"P",… } }` |
| POST | `/api/v1/attendance/month/bulk` | Save many `{ year, month, employees:[{ employeeId, days }] }` (max 200) |
| GET | `/api/v1/attendance/period-summary` | `?clientCompanyId=&employerCompanyId?&from=&to=` → P/AB/OD/unmarked per allocation |
| POST | `/api/v1/attendance` | Manual single record `{ employeeId, attendanceDate, status, note? }` |
| POST | `/api/v1/attendance/day` | Upsert many: `{ attendanceDate, status, employeeIds[], note? }` |
| GET/PATCH/DELETE | `/api/v1/attendance/:id` | Read / update / delete |

One row per employee per date. Status: **P** (present), **AB** (absent), or **OD** (off day). Blank day clears the record.

**Payroll (monthly rates):** `staff_salary` / `bill_rate` on allocations are **monthly** rates (from client designation cards, else employee defaults). Daily = monthly ÷ days-in-month. **P** and **OD** paid; **AB** and unmarked unpaid. Net = monthly × paidDays ÷ DIM + OT (full present month = full monthly). Client rates API: `staffMonthRate`, `billMonthRate`.

#### Overtime

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/v1/ot/rates` | List / upsert rate (`scope`: company\|project\|client) |
| DELETE | `/api/v1/ot/rates/:id` | Deactivate rate |
| GET | `/api/v1/ot/resolve` | `?companyId=&projectId=&clientCompanyId=` → effective rate (client → project → company) |
| GET/POST | `/api/v1/ot/entries` | List / create OT hours (amount = hours × rate snapshot) |
| DELETE | `/api/v1/ot/entries/:id` | Delete entry |

#### Finance apps

##### Expenses (`/apps/expenses`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/expenses` | Filters: category, from/to, clientId, q |
| POST | `/api/v1/expenses` | Create |
| GET/PATCH/DELETE | `/api/v1/expenses/:id` | Read / update / delete |

Categories: `client_payment` | `investment` | `other`.  
Client company link only for `client_payment`.

##### Planned

- Investments ledger → `/api/v1/investments` + `/apps/investments`
- Finance projects / capital tracking → align with or extend CRM projects; document when shipped

#### Client conventions

**Web** (`web/src/lib/api.ts`): `getJson`, `sendJson`, `uploadForm`, `postJson` — cookie credentials via same origin.

**Mobile** (`mobile/src/lib/api.ts`): same paths against `BASE_URL`; keep payloads identical so screens stay thin.

When adding an endpoint:

1. Implement module + HTTP handler.
2. Call it from web.
3. Call it from mobile if the screen exists (or leave a TODO in [Product map](#product-map)).
4. Add a row to this file.

</details>

<a id="client-access-scope"></a>

## Client access scope

Restaurant managers are **Client**-scoped office users. Each restaurant is a `companies` row with `kind = client`.

#### Rules

| Actor | Sees |
| --- | --- |
| `system_admin` | All clients, payroll, allocations |
| Other users with `user_clients` rows | Only those clients’ payroll, allocations, client list |
| Other users with **no** assignments | Empty client-scoped lists (assign in Settings → People) |

#### Schema

Migration `030_user_clients.sql`:

- `user_clients (user_id, client_company_id)` PK

Session payload includes `scopedClientIds: string[] | null` (`null` = unrestricted admin).

#### Admin UI

Settings → People → Manage user → **Restaurant clients** checkboxes.

#### APIs filtered

- `GET /api/v1/clients`
- `GET /api/v1/allocations` (+ headcount)
- `GET /api/v1/pay-runs` and pay-run detail / print routes

<a id="agent-quick-reference"></a>

## Agent quick reference

Read this first when joining the repo. **JACMS** (JA CRM) is the product name; code may still say `jacms` until the rename milestone.

#### What this is

Manpower-agency office **super app**: legal **employers** second workers to **clients** with dual monthly rates (staff salary vs bill). One Node API + Postgres serves:

- React web SPA (`web/`) — full office UI / PWA
- Expo mobile (`mobile/`) — field ops against the **same** `/api/v1`

**Public API:** https://jacms.bluraymaldives.site

#### Locked rules (do not invent alternatives)

- Clients are **not** projects. Projects/sites/pools/slots belong to the legal employer.
- Committed LOAs, allocation events, locked pay runs, and files are **immutable** — correct with new events/drafts.
- Attendance (P/AB/OD) drives payroll LOP; ending an allocation auto-adjusts attendance.
- Never fork business logic into mobile — call the API.

#### Where to look

| Need | Path |
| --- | --- |
| **Roadmap & checkboxes** | [Development roadmap](#development-roadmap) (this README) |
| Product map | [Product map](#product-map) |
| Monorepo / auth / extend | [Architecture](#architecture) |
| HTTP surface | [API reference](#api-reference) |
| Deploy / Tailscale | [Deploy](#deploy), [Remote / Tailscale](#remote-access-tailscale) |
| Server guides | [Server architecture (Debian)](#debian-server-architecture) |
| Schema | `lib/schema.ts` + `db/migrations/` |
| HTTP routers | `app/*-http.ts` |
| Domain logic | `modules/` |
| Web shell / SPA nav | `web/src/components/shell.tsx`, `web/src/App.tsx`, `web/src/lib/spa-nav.ts` |
| Settings hub | `web/src/pages/access.tsx` → `/settings` |
| RBAC matrix | `modules/access/permissions.ts`, migration `027_role_permissions.sql` |
| Mobile agent notes | [`mobile/AGENTS.md`](#mobile-expo-agents) |

#### Commands

```bash
npm start                 # API + serves web/dist
cd web && npm run build   # production SPA
npm run check             # backend smoke tests
cd mobile && npm run typecheck
```

Migrations apply on API boot. Do not commit `.env`, passwords, or `deploy/database-network.env`.

#### Change habits

1. Pick the next task from **Milestones** in this README; update checkboxes in the same commit.
2. Agency feature → `modules/` + router + web page (+ mobile if field-needed) + update [API reference](#api-reference) / [Product map](#product-map) in this README.
3. Finance app → `web/src/lib/apps.ts` + `/apps/<slug>` + own module; keep Operations nav clean.
4. Prefer DD MMM YYYY in UI; APIs stay ISO `YYYY-MM-DD`.

<a id="deploy"></a>

<details>
<summary><strong>Deploy</strong> (expand)</summary>

#### What runs where

| Component | Bind | Who reaches it |
| --- | --- | --- |
| Node JACMS | `127.0.0.1:3000` | nginx, Tailscale Serve only |
| nginx HTTP | `127.0.0.1`, `192.168.100.10`, `100.77.125.102` `:80` | Local, LAN, Tailscale |
| nginx HTTPS | `192.168.100.10:443` | Office LAN (LAN TLS cert) |
| Tailscale Serve | `https://server-1.snowy-pride.ts.net` | Tailnet (admin SSH / optional) |
| Cloudflare Tunnel | `https://<your-hostname>` | Public managers (preferred internet HTTPS) — see [CLOUDFLARE_TUNNEL.md](#cloudflare-tunnel); walkthrough for `jacms.bluraymaldives.site`: [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms) |
| PostgreSQL | `*:5432` (auth-limited) | Local, `192.168.100.0/24`, Tailscale `100.64.0.0/10` — never via Tunnel |

```mermaid
flowchart LR
  BrowserLAN[Browser on LAN]
  BrowserTS[Browser / mobile on Tailscale]
  Nginx[nginx]
  TSServe[Tailscale Serve]
  App[Node 127.0.0.1:3000]
  PG[(PostgreSQL)]

  BrowserLAN -->|http/https 192.168.100.10| Nginx
  BrowserTS -->|https server-1...ts.net| TSServe
  BrowserTS -->|http 100.77.125.102| Nginx
  Nginx --> App
  TSServe --> App
  App --> PG
  Tools[psql / GUI] -->|LAN or Tailscale :5432| PG
```

#### Fresh Debian host (recommended)

Idempotent full stack for a new GNOME office server:

```bash
cd /home/server/dev/jacms
sudo bash deploy/setup-fresh-debian.sh
sudo bash deploy/verify-server.sh
```

Environment overrides: `JACMS_SERVER_USER`, `JACMS_REPO_DIR`, `JACMS_FILES_DIR`, `JACMS_INSTALL_TAILSCALE=1`.

#### One-time install (existing host)

From the repo (needs sudo):

```bash
cd /home/server/dev/jacms
cd web && npm run build && cd ..
sudo bash deploy/install-web-nginx.sh
sudo bash deploy/install-postgres-network.sh
```

- Systemd unit: `jacms.service` (`systemctl status jacms`)
- nginx site: `/etc/nginx/sites-available/jacms`
- DB TCP passwords: `deploy/database-network.env` (mode 600 — do not commit)

#### Boot / power-on

On this office desktop host, power-on should bring the stack up without a login or sudo password. Step-by-step for **Debian** and tunnel ordering: [guides/autostart-on-boot.md](#autostart-on-boot).

On this Ubuntu desktop host, power-on brings the stack up without a login or sudo password:

- **GDM autologin** as `server` (`/etc/gdm3/custom.conf`)
- **Passwordless sudo** for `server` (`/etc/sudoers.d/server-nopasswd`)
- **Enabled units:** `jacms`, `postgresql`, `nginx`, `jacms-backup.timer`, `tailscaled`

After reboot, JACMS listens on `127.0.0.1:3000` and nginx publishes it. Screen lock is disabled for the desktop session. Suspend/hibernate are masked so remote SSH stays reachable.

Remote Cursor / SSH: see [REMOTE.md](#remote-access-tailscale) (`server@server-1.snowy-pride.ts.net` over Tailscale).

#### App URLs

| Access | URL |
| --- | --- |
| This machine | http://127.0.0.1/ |
| Office LAN | http://192.168.100.10/ or https://192.168.100.10/ |
| Tailscale | https://server-1.snowy-pride.ts.net/ |

Mobile app `BASE_URL` stays `https://server-1.snowy-pride.ts.net`.

#### Database over the network

Server app keeps socket auth in `.env`:

```text
DATABASE_URL=postgresql:///jacms_dev?host=/var/run/postgresql&user=jacms
```

Remote / GUI clients use TCP + password from `deploy/database-network.env`:

```bash
### LAN example
psql "postgresql://jacms:…@192.168.100.10:5432/jacms_dev"

### Tailscale example
psql "postgresql://jacms:…@100.77.125.102:5432/jacms_dev"
### or MagicDNS
psql "postgresql://jacms:…@server-1.snowy-pride.ts.net:5432/jacms_dev"
```

Allowed networks (pg_hba): localhost, `192.168.100.0/24`, Tailscale CGNAT `100.64.0.0/10`.  
UFW allows 5432 only from those ranges.

##### Rotate DB password

```bash
sudo bash deploy/install-postgres-network.sh
### deletes/reuses deploy/.db-network-password — remove that file first to force a new secret
rm -f deploy/.db-network-password
sudo bash deploy/install-postgres-network.sh
```

#### Day-2 ops

```bash
sudo systemctl restart jacms
sudo systemctl reload nginx
cd /home/server/dev/jacms/web && npm run build && sudo systemctl restart jacms
journalctl -u jacms -f
```

Caddy was used previously for LAN HTTPS; the nginx installer stops it so ports do not clash. Tailscale Serve remains the HTTPS front door on the tailnet.

</details>

<a id="debian-server-setup"></a>

<details>
<summary><strong>Debian server setup</strong> (expand)</summary>

Prepare a **16 GB RAM Debian desktop** as the office server: OS packages, Node.js, PostgreSQL, optional nginx, firewall, and **Cursor** for on-machine development. Public internet access comes later via [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms).

#### Assumptions

- **Debian stable** (e.g. bookworm) **desktop**, **16 GB RAM**, **GNOME**, **wired Ethernet** — frequently power-cycled.
- One primary admin Unix account, e.g. `server`, with the repo at `/home/server/dev/jacms` (path may change after [JACMS rename plan](#jacms-rename-plan)).
- **Development on the server** with **Cursor**; GNOME **auto-login** (no password) + Cursor autostart per [Autostart on boot](#autostart-on-boot).
- App listens on `127.0.0.1:3000`; nginx on `127.0.0.1:80` when installed — see [Deploy](#deploy).
- Public URL **https://jacms.bluraymaldives.site** — [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms).

#### 1. Base system

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

#### 2. Unix user and directories

```bash
sudo adduser server    # follow prompts; strong local password
sudo usermod -aG sudo server
```

Clone or copy the monorepo:

```bash
sudo -u server mkdir -p /home/server/dev
sudo -u server git clone <YOUR_REPO_URL> /home/server/dev/jacms
cd /home/server/dev/jacms
```

Copy environment template (no secrets in git):

```bash
cp .env.example .env
### Edit .env — typical values on this host:
### DATABASE_URL=postgresql:///jacms_dev?host=/var/run/postgresql&user=jacms
### FILES_DIR=/home/server/JACMS-Files
### HOST=127.0.0.1
### PORT=3000
```

Create file storage (or run full setup):

```bash
sudo -u server mkdir -p /home/server/JACMS-Files
# Or idempotent stack (Node, Postgres, nginx, JACMS-Files, systemd):
sudo bash deploy/setup-fresh-debian.sh
sudo bash deploy/verify-server.sh
```

After changing `FILES_DIR` on a host with existing uploads:

```bash
npm run migrate:files          # live migrate
npm run migrate:files -- --dry-run
```

#### 3. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

Create role and database (adjust names when JACMS rename lands):

```bash
sudo -u postgres createuser --createdb jacms || true
sudo -u postgres createdb -O jacms jacms_dev || true
```

Migrations apply on first `npm start` / `systemctl start jacms`.

For LAN/Tailscale TCP access, use the repo installer (writes `deploy/database-network.env`, mode 600):

```bash
cd /home/server/dev/jacms
sudo bash deploy/install-postgres-network.sh
```

#### 4. Node.js

Use Node **22+** (LTS) via [NodeSource](https://github.com/nodesource/distributions) or nvm for the `server` user. Example (NodeSource 22.x on bookworm):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v22.x
```

Install app and build web:

```bash
cd /home/server/dev/jacms
npm install
cd web && npm install && npm run build && cd ..
npm start        # smoke: http://127.0.0.1:3000/health
```

#### 5. nginx + systemd (production-style)

From the repo root:

```bash
cd /home/server/dev/jacms
sudo bash deploy/install-web-nginx.sh
```

This installs `jacms.service`, nginx site `jacms`, and enables units. Details: [Deploy](#deploy).

Verify:

```bash
curl -sS http://127.0.0.1/health
curl -sS http://127.0.0.1:3000/health
```

#### 6. Firewall (UFW)

Default deny incoming; allow SSH and office LAN as needed:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
### Optional office LAN (adjust subnet):
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
sudo ufw enable
```

Do **not** open WAN 80/443 when using Cloudflare Tunnel only — see [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms).

Port `5432` rules for LAN/Tailscale are applied by `install-postgres-network.sh` when UFW is present.

#### 7. Cursor editor on the server

Install [Cursor](https://cursor.com) for Linux (.deb or AppImage) under the `server` user. Development happens **on this machine** (not only over SSH).

- Open the folder `/home/server/dev/jacms` (or `jacms` after rename).
- Use integrated terminal for `npm start`, `cd web && npm run dev`, and `npm run check`.
- **GNOME auto-login** + **Cursor autostart** — required on the owner host; see [Autostart on boot](#autostart-on-boot).
- **BIOS:** set **Restore on AC power loss = Power On** before relying on unattended recovery.

#### 8. Updates and backups

```bash
sudo apt update && sudo apt upgrade -y
```

Schedule Postgres/app backups via your policy; the deploy tree may include `jacms-backup.timer` if enabled by `deploy/ensure-boot.sh` on your host.

#### 9. Next steps

| Step | Guide |
| --- | --- |
| Boot recovery stack | [Autostart on boot](#autostart-on-boot) |
| Public `https://jacms.bluraymaldives.site` | [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms) |
| Rename planning | [JACMS rename plan](#jacms-rename-plan) |

</details>

<a id="autostart-on-boot"></a>

<details>
<summary><strong>Autostart on boot</strong> (expand)</summary>

Goal: after **any** reboot or AC power return, **PostgreSQL**, **nginx**, the **app service** (`jacms` today), **cloudflared**, and optional timers come up **without** a desktop login or manual `sudo` — so `https://jacms.bluraymaldives.site` recovers once DNS, Tunnel, and internet are up.

**Owner decisions (Adhuhaam):**

- **GNOME** desktop on Debian, **passwordless auto-login** for user `server` (GDM).
- **Cursor** starts automatically after that login (for on-machine dev).
- **Background services** (`postgresql`, `jacms`, `nginx`, `cloudflared`) start at boot **without** waiting for login.
- **No network at boot:** JACMS still listens on `127.0.0.1:3000` / nginx locally; **cloudflared** retries until Ethernet + internet return (use `Restart=always` on the connector — see below).
- **BIOS:** **Restore on AC power loss = Power On** so the machine returns after outages.

Builds on [Deploy](#deploy), [Development roadmap](#development-roadmap) (M2), and `deploy/ensure-boot.sh`.

#### Systemd units to enable

| Unit | Role | Depends on |
| --- | --- | --- |
| `postgresql` / `postgresql@*-main` | Database | `network.target` |
| `nginx` | Reverse proxy → `127.0.0.1:3000` | network |
| `jacms` | Node API + static web | `postgresql.service` (`After=` / `Wants=` in unit) |
| `cloudflared` | Cloudflare Tunnel connector | network (after nginx is up in practice) |
| `tailscaled` | Optional admin VPN | per [REMOTE.md](../REMOTE.md) |
| `jacms-backup.timer` | Optional backups | if installed |

App unit excerpt (from `deploy/jacms.service`):

- `Restart=on-failure`, `RestartSec=3`
- `HOST=127.0.0.1`, `PORT=3000`
- `EnvironmentFile=-/home/server/dev/jacms/.env`

#### One-shot boot hardening (repo script)

From the repo on the server:

```bash
cd /home/server/dev/jacms
sudo bash deploy/ensure-boot.sh
```

This script (among other things):

- Disables conflicting **user** `jacms.service` if present (avoids port 3000 races).
- Installs and enables `postgresql`, `postgresql@18-main` (version may differ on Debian — adjust instance name), `nginx`, `jacms`.
- Restarts services and curls `http://127.0.0.1:3000/health` and `http://127.0.0.1/health`.
- Masks sleep/hibernate targets so remote SSH stays reachable.

**Debian note:** PostgreSQL instance may be `postgresql@15-main` or similar. List with:

```bash
systemctl list-units 'postgresql@*'
```

Enable the instance unit that matches your cluster.

#### cloudflared ordering & retries

Install and enable the tunnel **after** nginx and jacms are healthy — [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms).

`deploy/install-cloudflare-tunnel.sh` runs `systemctl enable --now cloudflared`. Recommended drop-ins on the **server** (placeholders — apply on host, not necessarily committed to repo yet):

```ini
### /etc/systemd/system/cloudflared.service.d/reliability.conf
[Unit]
After=nginx.service
Wants=nginx.service
### Do not Requires=network-online.target — cable may come up late

[Service]
Restart=always
RestartSec=5
```

The **app** (`jacms.service`) should **not** hard-require `network-online.target` so PostgreSQL + Node come up on loopback even when WAN is down; only **public** HTTPS waits on cloudflared + internet.

```bash
sudo systemctl daemon-reload
sudo systemctl restart cloudflared
```

#### BIOS / hardware

| Setting | Recommendation |
| --- | --- |
| **Restore on AC power loss** | **Power On** / **Last State** (wording varies) so the PC starts after outage |
| Wake-on-LAN | Optional; not required for Tunnel (connector is outbound) |
| UPS | Recommended for clean shutdowns |

#### GNOME auto-login + Cursor autostart

On the owner’s **Debian GNOME** host, configure **passwordless auto-login** for `server` so the physical console does not block systemd-managed services (they already start independently; autologin is for **Cursor**).

**GDM** (`/etc/gdm3/daemon.conf` or `custom.conf`):

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=server
```

**Cursor** after login — user autostart (example):

```bash
mkdir -p /home/server/.config/autostart
cat >/home/server/.config/autostart/cursor.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Cursor
Exec=/usr/bin/cursor %F
X-GNOME-Autostart-enabled=true
EOF
chown -R server:server /home/server/.config/autostart
```

Adjust `Exec=` to the real Cursor `.desktop` path on the machine. Optional browser autostart: `deploy/jacms-open.desktop` via `ensure-boot.sh`.

Security: auto-login increases physical-access risk; acceptable on a single-purpose office server with disk encryption per site policy.

#### Passwordless sudo (optional ops convenience)

Some hosts use `/etc/sudoers.d/server-nopasswd` for the `server` user so install scripts run without prompts. Limit to trusted single-user desktops.

#### Post-boot health checklist

Run after reboot or power restore (local SSH or console):

```bash
### 1) Core units active?
systemctl is-active postgresql nginx jacms cloudflared

### 2) Enabled for next boot?
systemctl is-enabled postgresql nginx jacms cloudflared

### 3) App health (local)
curl -fsS http://127.0.0.1:3000/health && echo OK-app
curl -fsS http://127.0.0.1/health && echo OK-nginx

### 4) Public (if tunnel configured)
curl -fsS https://jacms.bluraymaldives.site/health && echo OK-public

### 5) Recent errors
journalctl -u jacms -n 30 --no-pager
journalctl -u nginx -n 20 --no-pager
journalctl -u cloudflared -n 30 --no-pager
```

Expected: all `is-active` → `active`; health endpoints return JSON success; `cloudflared` logs show registered tunnel connections.

#### Troubleshooting

##### jacms fails / port 3000 in use

```bash
sudo journalctl -u jacms -n 80 --no-pager
sudo ss -tlnp | grep 3000
sudo systemctl restart jacms
```

Check `.env` and `DATABASE_URL`; Postgres must be up first.

##### nginx 502 / bad gateway

```bash
sudo nginx -t
sudo journalctl -u nginx -n 40 --no-pager
curl -v http://127.0.0.1:3000/health
sudo systemctl restart jacms nginx
```

##### cloudflared inactive

```bash
systemctl status cloudflared
journalctl -u cloudflared -n 100 --no-pager
```

Common fixes:

- Invalid or missing credentials under `/etc/cloudflared/` or `/root/.cloudflared/` — re-run login flow per [Cloudflare Tunnel](#cloudflare-tunnel) (never paste credentials into docs or git).
- Origin down: fix nginx/jacms first (`curl http://127.0.0.1:80/health`).
- Config typo in `/etc/cloudflared/config.yml` — hostname must match DNS route.

##<a id="cloudflare-error-1033"></a>

### Cloudflare **Error 1033** in the browser

**1033** means Cloudflare’s edge cannot reach a healthy **tunnel connector** (cloudflared on your server is down, disconnected, or the tunnel ID/credentials do not match).

1. On the server: `systemctl status cloudflared` → should be `active (running)`.
2. `journalctl -u cloudflared -f` — look for connection errors, auth failures, or certificate issues.
3. Confirm local stack: `curl http://127.0.0.1/health`.
4. In Cloudflare Zero Trust / Tunnels dashboard: tunnel shows **Healthy** with active connectors.
5. After config changes: `sudo systemctl restart cloudflared`.

##### PostgreSQL not ready on fast boot

```bash
systemctl status postgresql
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl restart jacms
```

#### Re-run after deploy changes

```bash
cd /home/server/dev/jacms
cd web && npm run build && cd ..
sudo bash deploy/ensure-boot.sh
```

When JACMS rename changes the unit name to `jacms.service`, update commands accordingly — [JACMS rename plan](#jacms-rename-plan).

</details>

<a id="cloudflare-tunnel"></a>

<details>
<summary><strong>Cloudflare Tunnel (general)</strong> (expand)</summary>

Expose this office app on the internet **without** opening router ports or using Tailscale for managers.

**Hostname walkthrough** (`https://jacms.bluraymaldives.site`): [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms).

#### Why Tunnel

| Approach | Notes |
| --- | --- |
| ISP port-forward / DMZ | Opens the LAN host; fails under CGNAT; certs awkward |
| Tailscale | Great for admins/SSH; managers need the Tailscale app |
| **Cloudflare Tunnel** | Outbound-only connector; HTTPS on your hostname; no Huawei port map |

Node stays on `127.0.0.1:3000`. Tunnel points at local **nginx** `http://127.0.0.1:80`.

```mermaid
flowchart LR
  Manager[Manager_browser] -->|HTTPS| CF[Cloudflare_edge]
  CF -->|tunnel| cloudflared
  cloudflared --> Nginx[nginx_127.0.0.1_80]
  Nginx --> App[Node_127.0.0.1_3000]
```

#### Prerequisites

1. A domain on a Cloudflare account (DNS managed by Cloudflare).
2. This server online with `jacms` + `nginx` healthy.
3. Leave Huawei **DMZ Disable** and do **not** add WAN port mapping for 80/443.

#### One-time install

```bash
cd /home/server/dev/jacms
sudo bash deploy/install-cloudflare-tunnel.sh
```

Then complete Cloudflare login + hostname (interactive once):

```bash
### As the service user (or with sudo -u)
cloudflared tunnel login
### Opens a browser URL — authorize the domain

sudo bash deploy/install-cloudflare-tunnel.sh \
  --hostname jacms.example.com \
  --tunnel-name jacms
```

This creates:

- Named tunnel `jacms`
- Config `/etc/cloudflared/config.yml` → `http://127.0.0.1:80`
- DNS CNAME for the hostname
- systemd unit `cloudflared`

#### Day-2

```bash
systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
curl -sS https://jacms.example.com/health
```

Mobile / managers: set app base URL to `https://jacms.example.com`.

#### Security limits

- App login still required (JACMS sessions).
- Postgres `:5432` stays LAN + Tailscale only — never publish it through the tunnel.
- Do not point the tunnel at Node `:3000` directly if nginx already terminates headers/body size.
- Optional later: Cloudflare Access (email OTP) in front of the hostname.

#### Temporary test without a domain

```bash
cloudflared tunnel --url http://127.0.0.1:80
```

Prints a random `*.trycloudflare.com` URL (ephemeral — not for restaurant managers).

</details>

<a id="cloudflare-tunnel-jacms"></a>

<details>
<summary><strong>Cloudflare Tunnel — `jacms.bluraymaldives.site`</strong> (expand)</summary>

Expose JACMS (today **JACMS** in code) at **`https://jacms.bluraymaldives.site`** without ISP port-forwarding. Traffic path matches [Cloudflare Tunnel](#cloudflare-tunnel): **Cloudflare edge → cloudflared → nginx `http://127.0.0.1:80` → Node `http://127.0.0.1:3000`**.

#### Prerequisites

1. Domain **`bluraymaldives.site`** on a Cloudflare account with **DNS managed by Cloudflare**.
2. Debian server with `jacms` + `nginx` healthy locally ([Debian server setup](#debian-server-setup)).
3. Router: **no** WAN port map for 80/443 (tunnel is outbound-only).
4. Host stack enabled on boot ([Autostart on boot](#autostart-on-boot)).

#### Architecture

```mermaid
flowchart LR
  M[Manager browser] -->|HTTPS jacms.bluraymaldives.site| CF[Cloudflare]
  CF --> C[cloudflared on Debian]
  C --> N[nginx 127.0.0.1:80]
  N --> A[Node 127.0.0.1:3000]
```

| Item | Value |
| --- | --- |
| Public hostname | `jacms.bluraymaldives.site` |
| Tunnel name (default in script) | `jacms` → planned `jacms` — [JACMS rename plan](#jacms-rename-plan) |
| Origin | `http://127.0.0.1:80` (not `:3000` directly) |
| Credentials | `/etc/cloudflared/config.yml` + JSON under `/root/.cloudflared/` — **never commit** |

#### Step 1 — Install cloudflared binary

From repo root:

```bash
cd /home/server/dev/jacms
sudo bash deploy/install-cloudflare-tunnel.sh
```

Without `--hostname`, the script only installs the package and prints next steps (same as [Cloudflare Tunnel](#cloudflare-tunnel)).

#### Step 2 — Authorize Cloudflare (one-time)

Run on the server (opens a browser URL; use a one-time login on a machine with a browser if headless):

```bash
cloudflared tunnel login
```

This creates a certificate under `~/.cloudflared/cert.pem` (often copied to `/root/.cloudflared/cert.pem` for the service). **Do not share** this file.

#### Step 3 — Create named tunnel + DNS

Use the repo installer with your hostname:

```bash
cd /home/server/dev/jacms
sudo bash deploy/install-cloudflare-tunnel.sh \
  --hostname jacms.bluraymaldives.site \
  --tunnel-name jacms
```

What the script does (see `deploy/install-cloudflare-tunnel.sh`):

1. Installs `cloudflared` from Cloudflare’s `.deb` if missing.
2. Creates or reuses tunnel named `jacms`.
3. Writes `/etc/cloudflared/config.yml` similar to:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: jacms.bluraymaldives.site
    service: http://127.0.0.1:80
  - service: http_status:404
```

4. Runs `cloudflared tunnel route dns jacms jacms.bluraymaldives.site` (CNAME to `*.cfargotunnel.com`).
5. `cloudflared service install`, `systemctl enable --now cloudflared`.

Placeholders: real `TUNNEL_UUID` and JSON credentials are generated by Cloudflare — not documented here.

#### Step 4 — Verify

Local:

```bash
curl -fsS http://127.0.0.1/health
curl -fsS http://127.0.0.1:3000/health
systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
```

Public:

```bash
curl -fsS https://jacms.bluraymaldives.site/health
```

Browser: open `https://jacms.bluraymaldives.site/` — JACMS/JACMS login page.

##### Mobile / API base URL

Point Expo and other clients at:

```text
https://jacms.bluraymaldives.site
```

(No trailing path; API is `/api/v1`.)

#### Day-2 operations

```bash
sudo systemctl restart cloudflared
sudo systemctl reload nginx
sudo systemctl restart jacms
journalctl -u cloudflared -f
```

After web UI changes:

```bash
cd /home/server/dev/jacms/web && npm run build
sudo systemctl restart jacms
```

#### Security limits

- App authentication unchanged — tunnel is not a substitute for login.
- **Never** add a tunnel ingress to PostgreSQL `:5432`.
- Prefer nginx in front of Node for headers/body limits ([Cloudflare Tunnel](#cloudflare-tunnel)).
- Optional later: **Cloudflare Access** (email OTP) in front of the hostname.

#### Troubleshooting

| Symptom | Action |
| --- | --- |
| **Cloudflare Error 1033** | Connector down — see [Autostart on boot](#autostart-on-boot) |
| 502 at public URL | Fix `curl http://127.0.0.1/health`; restart `jacms` and `nginx` |
| Wrong site / 404 | Check `hostname` in `/etc/cloudflared/config.yml` matches `jacms.bluraymaldives.site` |
| DNS not proxied | In Cloudflare DNS, CNAME should be **Proxied** (orange cloud) |

#### Ephemeral test (no DNS)

```bash
cloudflared tunnel --url http://127.0.0.1:80
```

Random `*.trycloudflare.com` URL — for debugging only, not production managers.

#### Related

- Generic tunnel doc: [../CLOUDFLARE_TUNNEL.md](../CLOUDFLARE_TUNNEL.md)
- Boot ordering: [Autostart on boot](#autostart-on-boot)
- Product rename (tunnel name `jacms`): [JACMS rename plan](#jacms-rename-plan)

</details>

<a id="remote-access-tailscale"></a>

<details>
<summary><strong>Remote access (Tailscale)</strong> (expand)</summary>

This Ubuntu box is the always-on home server. Reach it from any location through **Tailscale** (no router port-forwarding). Develop with **Cursor Remote SSH**.

#### Connect

| | |
| --- | --- |
| User | `server` |
| Password | `123456` (until you add SSH keys) |
| MagicDNS | `server-1.snowy-pride.ts.net` |
| Tailscale IP | `100.77.125.102` |
| LAN IP | `192.168.100.10` |

SSH is open only on **home LAN** and **Tailscale**, not the public internet.

##### On each laptop / phone location

1. Install [Tailscale](https://tailscale.com/download) and sign in to the same tailnet (`leo.emp.services@` / snowy-pride).
2. Wait until `server-1` shows online.
3. Test: `ssh server@server-1.snowy-pride.ts.net`

##### Cursor (Remote SSH)

1. Install the **Remote - SSH** style workflow Cursor uses (Open Remote / SSH host).
2. Add this to the **client** `~/.ssh/config` (on the laptop you travel with):

```sshconfig
Host jacms-home
  HostName server-1.snowy-pride.ts.net
  User server
  # IdentityFile ~/.ssh/id_ed25519   # optional once you add a key
  ServerAliveInterval 30
  ServerAliveCountMax 6
```

3. In Cursor: connect to host `jacms-home`, open folder `/home/server/dev/jacms`.

You can attach Cursor from multiple machines at once; each needs Tailscale + that SSH config (or the MagicDNS name).

#### Why Tailscale

- Works from office, travel, phone hotspot — same hostname.
- No open WAN SSH.
- App HTTPS stays at `https://server-1.snowy-pride.ts.net`.

#### Server stays up

- Autologin + passwordless sudo for local ops.
- Suspend/hibernate **masked**; GNOME AC sleep off.
- `ssh`, `tailscaled`, `jacms`, `postgresql`, `nginx` enabled on boot.

#### Optional: SSH keys (recommended later)

On a laptop:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub server@server-1.snowy-pride.ts.net
```

After keys work from every device you use, you can set `PasswordAuthentication no` in `/etc/ssh/sshd_config.d/99-local-server.conf` and `sudo systemctl reload ssh`.

</details>

<a id="jacms-rename-plan"></a>

<details>
<summary><strong>JACMS rename plan</strong> (expand — shipped PR #5)</summary>

**JACMS** = **JA CRM**. Code and ops identifiers now use **`jacms`** / **JACMS** (packages, systemd, nginx, PWA, mobile bundle id, default Postgres role/db on fresh install).

#### Fresh install

- `sudo bash deploy/setup-fresh-debian.sh` creates Postgres role **`jacms`** and database **`jacms_dev`**.
- Default checkout path: `/home/server/dev/jacms` (`deploy/jacms.service` `WorkingDirectory`).
- GitHub: https://github.com/adhuhaam/jacms

#### Existing production server (was NexCRM)

1. Owner renames GitHub repo `adhuhaam/nexcrm` → `adhuhaam/jacms`; on server: `git remote set-url origin https://github.com/adhuhaam/jacms.git` and `git pull`.
2. Optional: `mv /home/server/dev/nexcrm /home/server/dev/jacms` or rely on `migrate-rebrand.sh` symlink.
3. `cd web && npm run build`; `npm run check` on the host or in CI.
4. **`sudo bash deploy/migrate-rebrand.sh`** — idempotent: PG role/db rename, `.env` keys, `jacms.service`, nginx site, autostart `.desktop`, retires `nexcrm.service`.
5. `sudo bash deploy/verify-server.sh`
6. **All web users re-login** (`jacms_session` cookie). **Mobile:** reinstall or new build (package `net.snowypride.jacms`).

#### Session and env compatibility (code)

- API accepts legacy cookie `nexcrm_session` until re-login — `lib/session-cookie.ts`.
- Mobile migrates stored `nexcrm_session` → `jacms_session`.
- Env: prefer `JACMS_*`; deprecated `NEXCRM_*` still read with warning — `lib/jacms-env.ts`, `mobile/scripts/api-proxy.mjs`.

#### Cloudflare tunnel

Public hostname **`jacms.bluraymaldives.site`** unchanged. Installer default tunnel name is **`jacms`** (`deploy/install-cloudflare-tunnel.sh`). Rename the tunnel object in Cloudflare only if you want the dashboard label to match; routing can stay as-is.

#### Verification

```bash
rg -i 'nexcrm' --glob '!node_modules' --glob '!package-lock.json'
```

Expect matches only in compat code, `deploy/migrate-rebrand.sh`, `deploy/ensure-boot.sh` (legacy unit retirement), and changelog lines.

#### Related guides

- [README.md](#table-of-contents)
- [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms)
- [../DEPLOY.md](../DEPLOY.md)

</details>

<a id="grok-bot-plan"></a>

## Grok Bot MCP integration — development guide

📝 **PLANNED** — milestone [M6 — Grok Bot](#m6--grok-bot) · task list [P4 — Grok Bot connectivity](#p4--grok-bot-connectivity).  
This section is the **implementation spec** for Cursor agents. **PR #6 is docs-only**; ship runtime code in follow-up PRs against the checkboxes below.

Grok Bot is the **xAI Grok** chat client with **custom remote MCP servers**. JACMS exposes manpower-agency operations as MCP tools so the owner can query and (with approval) mutate production data through natural language.

### Grok Bot client capabilities (verified)

| Capability | Detail |
| --- | --- |
| Transport | **Streamable HTTP** MCP (HTTPS URL) |
| Static auth | HTTP headers, e.g. `Authorization: Bearer <api_key>` |
| OAuth | Optional; pre-registered OAuth client ID |
| Private CA TLS | Optional CA bundle upload in Grok Bot settings |
| Reachability | Remote MCP is invoked from **Grok Bot’s backend** — endpoint must be **internet-reachable** (`https://jacms.bluraymaldives.site/mcp`), not LAN-only |
| Tool discovery | New tools appear on the bot’s **next message** after server update |
| Writes | Grok Bot asks the **owner for approval in chat** before executing write tools (agreed policy; JACMS still enforces RBAC + `confirm` on destructive tools) |

### Implementation checklist (master)

- [ ] Dependencies: `@modelcontextprotocol/sdk`, `zod` (if not already root deps)
- [ ] DB migration: `api_keys`, link to `users.id` for `grokbot`, optional `rate_limit_rpm`
- [ ] Seed: user `grokbot@system.local` (or similar), role `grokbot_agent`, permission rows mirroring scoped HR/ops read + agreed writes
- [ ] Admin UI: create / rotate / revoke API keys (show secret **once**)
- [ ] `app/mcp-http.ts`: Streamable HTTP handler at `POST /mcp` (+ session lifecycle per SDK)
- [ ] Shared `lib/mcp-auth.ts`: validate Bearer → key row → user → session context
- [ ] Tool modules under `modules/mcp/tools/*.ts` calling existing domain services (no duplicate business logic)
- [ ] `deploy/jacms.nginx.conf`: `location /mcp` block committed + documented
- [ ] Deploy + `curl` / MCP Inspector against tunnel URL
- [ ] Owner completes [Connect Grok Bot](#connect-grok-bot)

<a id="grok-bot-architecture"></a>

<details open>
<summary><strong>Architecture</strong></summary>

```mermaid
flowchart LR
  GB[Grok Bot backend] -->|HTTPS Bearer MCP| CF[Cloudflare edge]
  CF --> T[cloudflared on Debian]
  T --> N[nginx :80]
  N -->|/mcp Streamable HTTP| API[Node JACMS :3000]
  N -->|/api/v1 REST| API
  API --> PG[(PostgreSQL)]
  API --> FS[FILES_DIR]
```

| Hop | Responsibility |
| --- | --- |
| Grok Bot | MCP client; owner approval for writes; stores connector URL + API key |
| Cloudflare Tunnel | TLS termination at edge; outbound-only from server |
| nginx | Reverse proxy, body size, **streaming headers for `/mcp`** |
| Node `/mcp` | MCP SDK server — tools map to `modules/*` |
| Node `/api/v1` | Same Bearer keys for REST parity |
| PostgreSQL | RBAC, audit log, hashed API keys |

**Do not** expose Postgres or raw `:3000` on the public hostname — tunnel targets nginx on `127.0.0.1:80` ([Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms)).

</details>

<a id="grok-bot-mcp-server"></a>

<details>
<summary><strong>MCP server (Node + official SDK)</strong></summary>

Use the official **`@modelcontextprotocol/sdk`** TypeScript server with the **Streamable HTTP** transport (not stdio). Mount on the existing HTTP server in `app/server.ts`.

**Suggested layout**

| File | Role |
| --- | --- |
| `app/mcp-http.ts` | Express/Fastify-style route registration for `/mcp` |
| `lib/mcp-server.ts` | `McpServer` instance, tool registration |
| `modules/mcp/auth.ts` | Bearer API key → `grokbot` user context |
| `modules/mcp/tools/*.ts` | One file per tool group (employees, attendance, …) |
| `modules/mcp/schemas/*.ts` | Zod input/output schemas shared with validation |

**Wire-up sketch** (implement in a follow-up PR — not in repo yet):

```typescript
// Pseudocode — match existing app/http patterns
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// On each MCP request: authenticate Bearer, attach req.jacmsActor = { userId, role, keyId }
// Register tools with server.tool(name, { description, inputSchema }, handler)
// handler: check role_permissions, call domain module, write audit_log
```

**Conventions**

- Tool names: `snake_case` matching catalog below (MCP name stability).
- Errors: return MCP tool error content with safe message (no stack traces to client).
- Idempotency: write tools accept optional `idempotency_key` (store dedupe window 24h).
- Reads: no `confirm` flag required.
- Destructive / irreversible writes: `destructive: true` in tool metadata + input `confirm: z.literal(true)`.

</details>

<a id="grok-bot-auth"></a>

<details>
<summary><strong>Auth — <code>grokbot</code> user, role, API keys</strong></summary>

#### Service identity

| Item | Value |
| --- | --- |
| User | Dedicated **`grokbot`** system user (not a human login) |
| Role | e.g. **`grokbot_agent`** — custom permission matrix via `role_permissions` |
| Display name | Audit log actor label **`Grok Bot`** (`actor = grokbot` or fk to user) |
| Human login | Disabled or unknown password — API key only |

#### API keys

- [ ] Table `api_keys`: `id`, `user_id`, `label`, `secret_hash`, `prefix` (for UI), `scopes_json` or role fk, `rate_limit_rpm`, `revoked_at`, `created_at`, `last_used_at`
- [ ] Hash: scrypt or argon2 (match existing password hashing in `modules/access`)
- [ ] **Create / rotate / revoke** in **Settings → API keys** (system_admin only)
- [ ] On create: show full key once; store hash only
- [ ] Rotation: revoke old + issue new; Grok Bot connector updated by owner
- [ ] Per-key **rate limiting** (token bucket or sliding window in middleware)

#### Permission mapping

- Keys inherit the **`grokbot_agent`** role’s `role_permissions` rows (same as web UI matrix).
- Narrow write scope in DB until owner trusts automation (e.g. reads on payroll, writes only attendance).
- Every MCP tool declares required module permission (`view` / `create` / `edit` / `delete`) — reuse `modules/access/permissions.ts`.

#### REST parity

Same `Authorization: Bearer <key>` on `/api/v1/*` as MCP. Prefer one middleware:

```http
Authorization: Bearer jacms_grok_xxxxxxxxxxxxxxxx
```

Mobile session cookies are unrelated — keys are machine-to-machine only.

</details>

<a id="grok-bot-tools"></a>

<details>
<summary><strong>Tool catalog</strong> (Zod schemas · resources optional)</summary>

Implement tools as thin wrappers over existing HTTP/domain layers. Validate all inputs with **Zod**; export JSON Schema for MCP where the SDK expects it.

#### Read tools (no `confirm`)

| Tool | Purpose | Key inputs (Zod) |
| --- | --- | --- |
| `search_employees` | Directory search | `query?: string`, `client_id?: uuid`, `limit?: number` (max 50) |
| `get_employee` | Profile + allocations summary | `employee_id: uuid` |
| `list_clients` | Client companies | `kind?: 'client'`, `active_only?: boolean` |
| `get_attendance` | Month grid | `employee_id?: uuid`, `client_id?: uuid`, `month: YYYY-MM` |
| `get_payroll_summary` | Pay run summary (no bank secrets) | `pay_run_id: uuid` |
| `get_xpat_status` | XPAT sync state for employee | `employee_id: uuid` |
| `get_server_health` | Same signals as admin health (redacted) | `detail?: 'brief' \| 'full'` |

- [ ] Each read tool: permission check → domain call → audit optional (read logging policy: log tool name + actor, omit PII payload)

#### Write tools (destructive flagged · `confirm: true`)

| Tool | Destructive | Key inputs (Zod) |
| --- | --- | --- |
| `create_employee` | no | `payload` (onboard fields), `idempotency_key?` |
| `update_employee` | no | `employee_id`, `patch`, `idempotency_key?` |
| `record_attendance` | no | `employee_id`, `date`, `code` P\|AB\|OD, `confirm: true` |
| `allocate_to_client` | no | `employee_id`, `client_id`, `start_date`, `confirm: true` |
| `upload_link_document` | no | `employee_id`, `file_id` or upload handle, `doc_type`, `confirm: true` |
| `trigger_xpat_sync` | no | `employee_id`, `confirm: true` |
| `run_server_action` | **yes** | `action: enum(restart_jacms, backup_db, ...)`, `confirm: true` |

- [ ] Whitelist `run_server_action` actions in code — reject unknown enums
- [ ] Grok Bot owner approval happens **in Grok chat** before the write RPC; JACMS requires `confirm: true` anyway
- [ ] Return structured success + ids for audit correlation

#### Resources & prompts (optional · phase 2)

| Kind | Example | Notes |
| --- | --- | --- |
| Resource | `jacms://employee/{id}/summary` | Markdown summary for context |
| Resource | `jacms://payroll/{run_id}/summary` | Locked-run aware |
| Prompt | `payroll-period-review` | Injects month + client scope |

- [ ] Defer until core tools stable

</details>

<a id="grok-bot-nginx"></a>

<details>
<summary><strong>nginx, tunnel, health alerts</strong></summary>

#### nginx `location /mcp`

Add to `deploy/jacms.nginx.conf` inside the `server` block(s) that proxy to Node:

```nginx
location /mcp {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Streamable HTTP / SSE — do not buffer
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    proxy_pass http://jacms_upstream;
}
```

- [ ] Reload nginx after deploy: `sudo nginx -t && sudo systemctl reload nginx`
- [ ] Confirm tunnel still points at `http://127.0.0.1:80` (not direct `:3000`)

#### Cloudflare tunnel

No extra ingress rule — `/mcp` is another path on `jacms.bluraymaldives.site`. Optional: Cloudflare **Access** policy in front of `/mcp` (adds second auth layer; Grok Bot must still send Bearer).

#### Health webhook + Grok Bot monitoring

| Signal | Endpoint | Use |
| --- | --- | --- |
| Liveness | `GET https://jacms.bluraymaldives.site/health` | Public; no auth |
| Rich status | `GET /api/v1/admin/health` | system_admin session or scoped key if exposed |
| Partial failure | JACMS emits webhook (future) when DB up but tunnel/nginx down | P4 checkbox |
| External ping | Owner configures **Grok Bot routine** to ping `/health` on interval | Alert when tunnel/host down |

- [ ] Document webhook URL in Settings (no secrets in README)
- [ ] Health JSON must not leak API keys or `.admin-password`

</details>

<a id="grok-bot-security"></a>

<details>
<summary><strong>Security</strong></summary>

| Control | Requirement |
| --- | --- |
| Transport | **HTTPS only** on public URL; tunnel handles edge TLS |
| Secrets | API key in Grok Bot connector + server DB hash — **never** commit to git |
| Network | Optional IP allowlist at nginx or Cloudflare; optional Cloudflare Access |
| Validation | Zod on every tool input; reject oversize payloads |
| PII | Minimize tool responses (no passport images base64 in chat); use ids + summaries |
| RBAC | Same checks as web — keys cannot escalate past `grokbot_agent` role |
| Audit | Every write + sensitive read logs actor **Grok Bot**, tool name, resource ids |
| Idempotency | Writes accept `idempotency_key` to prevent duplicate commits on retry |
| Rate limit | Per API key RPM; 429 with retry-after |

</details>

<a id="grok-bot-testing"></a>

<details>
<summary><strong>Testing</strong> (MCP Inspector · curl)</summary>

#### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to:

```text
https://jacms.bluraymaldives.site/mcp
```

Headers:

```text
Authorization: Bearer <your_jacms_api_key>
```

- [ ] List tools after connect
- [ ] Invoke `get_server_health` with `detail: brief`
- [ ] Verify 401 without header

#### curl (smoke)

```bash
# Health (no auth)
curl -fsS https://jacms.bluraymaldives.site/health

# REST parity (example — adjust route)
curl -fsS -H "Authorization: Bearer $JACMS_GROKBOT_KEY" \
  "https://jacms.bluraymaldives.site/api/v1/employees?limit=1"
```

Streamable HTTP may use session IDs — follow SDK docs for raw curl; prefer Inspector for MCP.

</details>

<a id="connect-grok-bot"></a>

<details open>
<summary><strong>Connect Grok Bot</strong> (owner steps)</summary>

1. **Issue API key** — system_admin → Settings → API keys → create key for **`grokbot`** role; copy secret once.
2. In **Grok Bot**, add a **custom remote MCP server**:
   - **URL:** `https://jacms.bluraymaldives.site/mcp`
   - **Transport:** Streamable HTTP (HTTPS)
   - **Auth:** Static header — `Authorization: Bearer <api_key>`
   - (Optional) OAuth client ID if you later switch auth mode
   - (Optional) CA bundle if using private TLS on a custom hostname
3. Save connector. Send a **new message** in Grok Bot — tools should appear on that turn.
4. Test a **read**: e.g. “Search employees named …” → `search_employees`.
5. Test a **write**: Grok Bot should **ask you to approve** before `record_attendance` or `run_server_action`.
6. Verify **audit log** in JACMS shows actor **Grok Bot**.

**Never** paste the API key into git, Slack logs, or this README.

</details>

<a id="grok-bot-troubleshooting"></a>

<details>
<summary><strong>Troubleshooting</strong></summary>

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Grok Bot: cannot connect to MCP | Tunnel down, nginx down, or wrong URL | `systemctl status cloudflared nginx jacms`; `curl https://jacms.bluraymaldives.site/health` |
| 401 on MCP | Missing/wrong Bearer, revoked key | Rotate key in admin UI; update Grok Bot header |
| Tools missing after deploy | Grok Bot caches tool list per session | Send a **new message**; restart connector |
| 502 / 1033 on hostname | cloudflared disconnected | `journalctl -u cloudflared -n 50`; [Tunnel errors](#cloudflare-tunnel-jacms) |
| MCP hangs / disconnects | nginx buffering or short timeout | Add [`location /mcp`](#grok-bot-nginx) settings; reload nginx |
| Write rejected | RBAC or missing `confirm: true` | Check `grokbot_agent` permissions; tool args must include `confirm: true` |
| Duplicate writes | Retries without idempotency | Pass same `idempotency_key` on retry |
| LAN URL in connector | Grok backend cannot reach LAN | Use **tunnel HTTPS URL only** |
| TLS / custom CA errors | Private cert chain | Upload CA bundle in Grok Bot MCP settings |
| Rate limited | Per-key RPM exceeded | Wait or raise limit in admin UI |

</details>

<a id="ui-redesign-plan"></a>

## UI redesign plan

📝 PLANNED (milestone [M7](#m7--ui-redesign-web--mobile)).

- **Web:** shadcn default, collapsible sidebar, light/dark toggle, bluish navy / black dark mode, white light mode.
- **Mobile:** React Native Reusables + NativeWind; bottom tabs + More; card lists.
- **Tables:** search, filters, sort, Excel + PDF export.
- Match web and mobile visually (post current pre-redesign shadcn).

<a id="mobile-expo-app"></a>

## Mobile Expo app

Standalone Expo client for any reachable JACMS office server.

On connect you enter **API URL**, **email**, and **password**. The app only opens after the server answers and login returns a Bearer token.

#### Feature coverage (vs web)

| Module | Mobile |
| --- | --- |
| Connect / login (any API URL) | Yes |
| Dashboard | Yes (read) |
| Companies (employers) | List, detail, create, edit |
| Employees | List, detail, create, edit |
| Clients | List, create, edit |
| Allocations | List, detail, create, resign, rate change |
| Payroll | List, detail, create, lock |
| Work permits | List, create, edit |
| Projects | List, detail (sites/files read) |
| Expenses | List, create, edit, delete |
| LOAs | List, detail, **simple** create form |
| Admin / roles / settings | No (web only) |
| Accommodations | No |
| Employee onboard / OCR / documents | No |
| LOA rich preview + signed PDF | No |

#### Run

```bash
cd mobile
npm install
npx expo start
```

Web preview: `npx expo start --web` → http://localhost:8081

If the browser blocks CORS to your Tailscale host, run `npm run proxy` and set API URL to `http://127.0.0.1:8787`.

#### EAS APK preview

```bash
npx eas-cli@latest build --profile preview --platform android
```

<a id="mobile-expo-agents"></a>

<details>
<summary><strong>Mobile Expo — agent notes</strong> (expand)</summary>

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

#### Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

#### Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

#### Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

#### Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

</details>

<a id="mobile-expo-android-preview"></a>

<details>
<summary><strong>Mobile Android preview roadmap</strong> (expand)</summary>

**Story for another day:** the Debian server guide set focuses on web + API at `https://jacms.bluraymaldives.site`. Mobile work will likely happen in a **separate Cursor workspace/session** (same monorepo `mobile/` or a dedicated repo — recommendation below). This document is **forward-looking**; it does not require changes on the server today.

#### What exists today

| Item | Location |
| --- | --- |
| Expo app | `mobile/` |
| API contract | Same `/api/v1` as web — [API.md](../API.md) |
| Agent notes | [mobile/AGENTS.md](#mobile-expo-app) |
| Preview APK (EAS) | `npx eas-cli@latest build --profile preview --platform android` — [mobile/README.md](#mobile-expo-app) |

Production API base URL for field devices: **`https://jacms.bluraymaldives.site`** (after tunnel setup).

#### Recommendation: monorepo vs separate mobile repo

| Approach | Pros | Cons |
| --- | --- | --- |
| **Keep `mobile/` in this monorepo** | One API version, shared docs, single clone on server | Larger repo; mobile CI/EAS secrets live beside backend |
| **Dedicated JA CRM mobile monorepo** | Cleaner Expo/EAS lifecycle; app-store identity separate | API version drift; two clones/PRs; duplicate agent docs |

**Recommendation:** keep **`mobile/` in this monorepo** until the team needs distinct release cadence or external contractors only touch mobile. Use **EAS** for APK builds; use the Debian box optionally for **Metro** during office dev. Split to a dedicated repo only when mobile releases decouple from API deploys.

#### Phase 1 — Develop against production API

On a dev machine (or the Debian server):

```bash
cd /home/server/dev/jacms/mobile
npm install
npx expo start
```

In the app, set **API URL** to:

```text
https://jacms.bluraymaldives.site
```

Expo Go or a **development build** is required when using native modules not in Expo Go — see [mobile/AGENTS.md](#mobile-expo-app).

CORS: if the API must allow Expo web or tunnel origins, that is a **future API change** (not covered here).

#### Phase 2 — Expo Metro on the Debian server

Use case: Android phone on the **office LAN** loads JS from Metro on the server while developing.

| Piece | Typical bind | Reachability |
| --- | --- | --- |
| Metro | `0.0.0.0:8081` (Expo default) | LAN `http://<LAN_IP>:8081` |
| API | `127.0.0.1:3000` / public tunnel URL | Phone uses **tunnel HTTPS**, not Metro for API |

Start on server (manual or separate systemd **user** unit — **do not** conflate with `jacms.service`):

```bash
cd /home/server/dev/jacms/mobile
npx expo start --host lan
```

Phone: same Wi‑Fi → Expo Dev Client / QR → packager on server LAN IP.

**Firewall:** if UFW is strict, allow LAN to `8081/tcp` only from office subnet — not from the public internet.

##### Metro via Cloudflare (optional, advanced)

Expo over the public internet is awkward (WebSocket, HMR). Options:

1. **Prefer LAN or Tailscale** for Metro ([REMOTE.md](../REMOTE.md)) — phone on tailnet or office Wi‑Fi.
2. **Separate tunnel hostname** (e.g. `expo-dev.bluraymaldives.site`) with TCP or HTTP2 — higher complexity; not needed for manager APK previews.
3. **USB** `adb reverse` when debugging at the desk.

For **preview APK** distribution, use EAS build artifacts — not Metro through the tunnel.

#### Phase 3 — Preview APK (EAS)

From `mobile/` with Expo Application Services configured (`eas.json`, Expo account):

```bash
npx eas-cli@latest build --profile preview --platform android
```

- **Preview profile**: internal APK/AAB, installable without Play Store.
- Store **credentials** in EAS (keystore), not in git.

**Local build** (alternative, no EAS queue):

```bash
npx expo run:android --variant release
### or eas build --local
```

Requires Android SDK/NDK on the build machine (heavy on Debian desktop — CI or EAS cloud is often easier).

#### Phase 4 — Ship to field staff

1. Build preview/production APK with API URL baked or entered at first launch (today: user-entered URL in app).
2. Distribute APK via link, MDM, or Play internal testing.
3. Document that API is always `https://jacms.bluraymaldives.site`; rotates only if DNS changes.

#### Debian server: what not to autostart

| Service | Boot autostart? |
| --- | --- |
| `jacms` / `jacms` | Yes |
| `cloudflared` | Yes |
| Expo Metro | **No** (dev-only; start manually) |
| EAS build | **No** (cloud or ad-hoc CI) |

#### Checklist before first field pilot

- [ ] Tunnel health: `https://jacms.bluraymaldives.site/health`
- [ ] Mobile login tested on Android with real account
- [ ] Preview APK installed; API URL set
- [ ] Module gaps acceptable vs web — table in [mobile/README.md](#mobile-expo-app)
- [ ] Support plan for app updates (new EAS build)

#### Related

- [README.md](#table-of-contents) — server guides index
- [Tunnel: jacms.bluraymaldives.site](#cloudflare-tunnel-jacms) — public API URL
- [JACMS rename plan](#jacms-rename-plan) — mobile display name JACMS

</details>

<a id="web-app-notes"></a>

## Web app notes

React + Vite + TypeScript office UI for JACMS (PWA-capable). Part of the monorepo — see [Table of contents](#table-of-contents).

#### Develop

```bash
npm install
npm run dev
```

Point the API at the Node server (`npm start` from repo root) or configure the Vite proxy if used.

#### Production

```bash
npm run build
```

Output lands in `dist/`. The API process serves these files (SPA fallback) from `app/static.ts`.

#### Notes

- Shell, apps launcher, and routes live under `src/`.
- Finance apps register in `src/lib/apps.ts` and mount under `/apps/*`.
- Shared API contract: [API reference](#api-reference) in repo README.


---

*Single source of truth: this `README.md`. Update it with every change.*
