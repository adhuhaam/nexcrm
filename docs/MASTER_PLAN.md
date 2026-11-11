# JACMS Master Plan — development roadmap

> ## ⚠️ MANDATORY RULE FOR CURSOR AND EVERY AI AGENT
>
> **YOU MUST MAINTAIN THIS DOCUMENTATION AS PART OF EVERY CHANGE.**
>
> - **Before starting work:** `git pull` and read this plan, [`docs/`](README.md), and [`docs/guides/`](guides/README.md) for latest status.
> - **After every change:** update this plan and relevant guides in the **same commit**. Move items ✅ / 🚧 / 📝; add a dated changelog line.
> - **New owner ideas** → add under **Planned** or **Open items** immediately.
> - **Never leave docs stale.** Code and docs must agree.
> - **Commit and push docs often.** Adhuhaam edits from many devices — always pull/rebase first; **never overwrite** his doc edits.
> - **Everyone stays aligned through these docs.**

**JACMS** (JA CRM) — manpower-agency office super app. **Public domain:** https://server.bluraymaldives.site  
**Repo:** https://github.com/adhuhaam/nexcrm (package/service names still `nexcrm` in code until [M3](#m3-jacms-rename-code--ops)).  
**Status legend:** ✅ DONE · 🚧 IN PROGRESS · 📝 PLANNED

Companion references: [PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) · [DEPLOY.md](DEPLOY.md) · [guides/README.md](guides/README.md)

---

## Changelog

| Date | Note |
| --- | --- |
| 2026-11-11 | Master plan rebrand: merged feature plan, checkbox inventory, milestones M1–M8; server guides in `docs/guides/`. |

---

## How to use this plan (Cursor agents)

1. Pull latest `main` or feature branch; read **Milestones** below.
2. Pick the **first milestone** with unchecked `- [ ]` tasks that match your assignment.
3. Mark task 🚧 in this file when you start; ✅ when shipped **in the same commit** as code/docs updates.
4. If scope is unclear, read pointers (`modules/…`, `web/src/pages/…`) under **Shipped inventory**.

---

## Shipped inventory (current codebase)

Each item is **implemented today** unless noted. Use pointers for implementation detail.

### Platform, API, and deploy

- [x] **Monorepo layout** — Node API `app/`, domain `modules/`, Drizzle `lib/schema.ts`, SQL `db/migrations/`, React `web/`, Expo `mobile/` — [ARCHITECTURE.md](ARCHITECTURE.md)
- [x] **HTTP server** — `app/server.ts`: migrate on boot, seed admin if empty, static SPA, `/health` — `app/server.ts`
- [x] **Shared JSON API** — `/api/v1/*` contract — [API.md](API.md)
- [x] **Env config** — `DATABASE_URL`, `FILE_ROOT`, `HOST=127.0.0.1`, `PORT=3000`, `DISPLAY_TIME_ZONE`, OpenAI OCR vars — `.env.example`
- [x] **Migrations 001–027+** — applied on API start under advisory lock — `db/migrations/`, [MASTER_PLAN historical table in git history]
- [x] **Smoke tests** — `npm run check` — `tests/*.test.ts`
- [x] **systemd unit `nexcrm.service`** — Node serves app on loopback — `deploy/nexcrm.service`, [DEPLOY.md](DEPLOY.md)
- [x] **nginx reverse proxy** — local/LAN `:80` → app `:3000` — `deploy/install-web-nginx.sh`, `deploy/nexcrm.nginx.conf`
- [x] **Postgres network install helper** — `deploy/install-postgres-network.sh`, `deploy/database-network.env` (not in git)
- [x] **Boot stack script** — `deploy/ensure-boot.sh` enables postgresql, nginx, nexcrm
- [x] **Cloudflare Tunnel installer** — `deploy/install-cloudflare-tunnel.sh` → nginx origin — [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)
- [x] **Debian/server guides** — `docs/guides/*` (boot, tunnel hostname, rename checklist, mobile roadmap)
- [x] **Tailscale Serve / REMOTE** — optional admin path — [REMOTE.md](REMOTE.md)

### Auth, roles, and access (as built today)

- [x] **Email + password login** — scrypt, ~12h session — `modules/access/access.ts`, `POST /login`, cookie `nexcrm_session`
- [x] **Bearer token for mobile** — `Authorization: Bearer` on same session token — `app/*-http.ts`
- [x] **Nine built-in system roles** — `system_admin`, `company`, `manager`, `hr_manager`, `hr_staff`, `client`, `vendor`, `agent`, `investor_guest` — `modules/access/access.ts` (`seedRoles`)
- [x] **Per-module permission matrix** — view/create/edit/delete per module key — `modules/access/permissions.ts`, migration `027_role_permissions.sql`
- [x] **Roles UI** — matrix editor in Settings — `web/src/pages/access.tsx`
- [x] **Users CRUD** — Settings → People — `app/access-http.ts`, `web/src/pages/users.tsx`
- [x] **Client assignment table** — `user_clients` + `setUserClients` — `modules/access/client-scope.ts` (enforcement **incomplete** on many routes — see Planned)
- [x] **System admin-only modules** — users, roles, settings, health flags — `ACCESS_ONLY_MODULES` in `permissions.ts`
- [x] **First-boot admin seed** — random password → `.admin-password` — `modules/access/seed.ts`

### Companies, clients, designations, branding

- [x] **Employer & client companies** — `kind` employer\|client — `modules/companies/companies.ts`, `web/src/pages/companies.tsx`, `clients.tsx`
- [x] **Company detail** — projects list, employees, branding file ids — `web/src/pages/company-detail.tsx`, `client-detail.tsx`
- [x] **Client designation monthly rates** — staff + bill month rates — `modules/hr/client-rates.ts`, `/api/v1/clients/:id/rates`
- [x] **Designations catalog** — office-wide job titles — `modules/hr/designations.ts`, `web/src/pages/designations.tsx`
- [x] **LOA branding assets** — letterhead, seal, signature upload — company routes in API.md

### Employees, onboard, OCR, photos

- [x] **Employee CRUD** — directory, search, filters — `modules/hr/employees.ts`, `web/src/pages/employees.tsx`
- [x] **Profile photos** — multipart upload — `POST /api/v1/employees/:id/photo`
- [x] **Quick onboard** — scan passport, commit employee + optional allocation/housing — `modules/hr/onboard.ts`, `web/src/pages/employee-onboard.tsx`
- [x] **Passport OCR (OpenAI Vision)** — scan + apply — `modules/hr/passport-ocr.ts`, Settings stores key — `modules/settings/settings.ts`
- [x] **XPAT integration** — preview, import, sync one/all — `app/xpat-http.ts`, `modules/integrations/xpat*.ts`, UI in `employees.tsx`, `XpatStatusBadge`

### LOAs (letters)

- [x] **LOA list & editor** — immutable snapshots on commit — `modules/documents/letters.ts`, `web/src/pages/loas.tsx`, `loa-editor.tsx`
- [x] **Signed LOA upload** — `POST /api/v1/letters/:id/signed-copy`
- [x] **Document numbering preview** — `GET /api/v1/letters/preview-number`

### Allocations (secondment)

- [x] **Allocate staff to client** — dual monthly rates — `modules/hr/allocations.ts`, `web/src/pages/allocations.tsx`
- [x] **Rate change events** — `POST …/rate-change`
- [x] **End allocation** — resign, terminate, lost, transfer_out + attendance hook — `POST …/end`, `modules/hr/attendance.ts` `applyAllocationEndAttendance`
- [x] **Allocation detail & events** — `GET /api/v1/allocations/:id`

### Attendance & overtime

- [x] **Daily attendance P / AB / OD** — manual + bulk — `modules/hr/attendance.ts`, `app/attendance-http.ts`
- [x] **Month grid** — years 2000–2100, per-employee save, bulk save — `web/src/pages/attendance.tsx`
- [x] **Period summary** — per allocation P/AB/OD/unmarked — `GET /api/v1/attendance/period-summary`
- [x] **OT rates** — company / project / client scope — `modules/hr/ot.ts`, `app/ot-http.ts`
- [x] **OT entries** — feed payroll — attendance page OT tab

### Payroll

- [x] **Pay run generation** — `client_batch` \| `employer_client`, full calendar month — `modules/hr/payroll.ts`
- [x] **LOP math** — monthly rates, P+OD paid, AB/unmarked unpaid, + OT — [API.md](API.md) attendance section
- [x] **Lock / recalculate / delete draft** — immutable locked runs
- [x] **Payroll UI** — list, detail, lines — `web/src/pages/payroll.tsx`
- [x] **Salary sheet export** — `payroll-salary-sheet.tsx`
- [x] **Client payment request export** — `payroll-payment-request.tsx`
- [x] **Payslips view** — `payroll-payslips.tsx`

### Accommodations

- [x] **Houses & stays** — check-in/out — `modules/hr/accommodations.ts`, `web/src/pages/accommodations.tsx`
- [x] **Unallocated stay charge preview** — `GET /api/v1/accommodations/charges`

### Documents & files vault

- [x] **File storage on disk** — `FILE_ROOT` — `modules/files/storage.ts`
- [x] **Upload / download / entity filter** — `web/src/pages/documents.tsx`

### Projects & work permits

- [x] **Projects, sites, quota pools, slots** — `modules/projects/projects.ts`, `web/src/pages/projects.tsx`
- [x] **Work permits CRUD** — `modules/hr/work-permits.ts`, `web/src/pages/work-permits.tsx`

### Finance app (Expenses)

- [x] **Expenses launcher app** — `/apps/expenses` — `web/src/lib/apps.ts`, `modules/expenses/expenses.ts`, `web/src/pages/expenses.tsx`
- [x] **Categories** — client_payment, investment, other — [PRODUCT.md](PRODUCT.md)

### Settings, preferences, and admin API

- [x] **Office preferences** — region, currency — `modules/companies/preferences.ts`, Settings → General
- [x] **System settings KV** — OpenAI OCR key/model (masked GET) — `modules/settings/settings.ts`, `app/access-http.ts`
- [x] **Admin access JSON** — roles + users payload — `GET /api/v1/admin/access`
- [x] **Role CRUD** — create/update/delete non-system roles — admin routes in [API.md](API.md)
- [x] **HR dashboard API** — counts, headcount — `GET /api/v1/hr/dashboard`, `modules/hr/dashboard-finance.ts`

### Web SPA shell & UX (current)

- [x] **Workspace + Operations nav** — `web/src/components/shell.tsx`
- [x] **Finance app icons** — sidebar launcher — `web/src/lib/apps.ts`
- [x] **Soft routing / lazy pages** — `web/src/App.tsx`, `web/src/lib/spa-nav.ts`
- [x] **Command palette** — `web/src/components/command-palette.tsx`
- [x] **PWA manifest** — still named NEXCRM in `web/public/manifest.webmanifest`
- [x] **shadcn/ui components** — `web/src/components/ui/*` (pre-redesign styling)
- [x] **Login page** — `web/src/pages/login.tsx`
- [x] **Dashboard** — headcount + finance cards — `web/src/pages/dashboard.tsx`, `modules/hr/dashboard-finance.ts`
- [x] **Settings hub** — General, People, Roles, Health tabs — `web/src/pages/access.tsx`
- [x] **Server health page (v1)** — system_admin, auto-refresh 2.5s — `web/src/pages/settings-health.tsx`, `GET /api/v1/admin/health`

### Mobile (Expo)

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

### Mobile gaps (not shipped — do not check as done)

- Attendance month sheet, accommodations, onboard/OCR, rich LOA PDF, admin/settings/roles, permission-aware menus (see [mobile/README.md](../mobile/README.md))

### Domain rules (locked — always enforce)

- [x] Clients ≠ projects; projects belong to legal employer — [AGENTS.md](../AGENTS.md)
- [x] Immutable committed LOAs, allocation events, locked pay runs, files — correct via new events/drafts
- [x] Attendance drives payroll LOP; allocation end auto-adjusts attendance
- [x] Single API for web + mobile — no forked business logic in mobile

---

## Planned work (owner decisions)

Items below are **not done** in code unless marked 🚧. Breakdown supports milestone checklists.

### P1 — Server auto-start (Debian desktop)

- [ ] Document & verify BIOS **Restore on AC power loss = Power On** — [guides/autostart-on-boot.md](guides/autostart-on-boot.md)
- [ ] **GNOME auto-login** (no password) for desktop user `server`
- [ ] **Cursor opens automatically** after GNOME login (autostart `.desktop`)
- [ ] systemd: `postgresql`, `nexcrm`, `nginx`, `cloudflared` enabled **without user login**
- [ ] App starts when **no network** at boot; **cloudflared** `Restart=always` / retry until tunnel up (no hard `Requires=network-online` on app)
- [ ] Optional drop-in for `cloudflared` After=nginx — guide documents pattern
- [ ] Post-boot checklist automated or scripted (health curls)

### P2 — Role-based login (7 roles)

- [ ] Collapse to **7 roles**: system_admin, hr_manager, hr_staff, manager, client, employee_self_service, agency — merge/remove company, vendor, investor_guest, agent
- [ ] **Employee self-service**: phone + password sign-in
- [ ] **Agency role**: own candidates, passport upload, permit/visa tracking
- [ ] **Client role dashboard**: allocated workers, attendance, OT, worker docs — no invoices/pay runs
- [ ] **Per-role landing dashboard** after login (web + mobile)
- [ ] **Fix client scoping on every endpoint** — allocations by id, mutations, client rates, `companies?kind=client`, dashboard, employees, attendance, OT, documents, work permits, … — `modules/access/client-scope.ts` + routers
- [ ] **Hide menus/pages** by module permissions (web shell + mobile) — not aggregate flags only
- [ ] **Mobile session loads** permission matrix + client scope
- [ ] **Admin-only password reset** (no self-service email link)
- [ ] **Login rate limiting / lockout**
- [ ] **Audit log** — logins, role changes, record changes, bot actions — system_admin UI

### P3 — Server health & status (enhanced)

- [ ] Auto-refresh every **10 seconds** (today 2.5s partial) — `settings-health.tsx`
- [ ] Show CPU, RAM, disk, temperature (where available)
- [ ] Status: JACMS API, PostgreSQL, nginx, **Cloudflare tunnel** connector
- [ ] Uptime, last boot, network/internet reachability
- [ ] Recent errors / log tail; **last DB backup** status
- [ ] Parity on **mobile** for system_admin (optional phase)

### P4 — Grok Bot connectivity

- [ ] Dedicated **Grok Bot** user + role + **revocable API key** (system_admin UI)
- [ ] **MCP server** at `https://server.bluraymaldives.site/mcp` (via tunnel)
- [ ] **REST** `/api/v1` with same API key
- [ ] Bot actions respect RBAC; audit entries as "Grok Bot"
- [ ] **Approval gate**: mutating/server actions require owner approval in Grok chat; reads immediate
- [ ] **Down alerts**: webhook on partial failure; external ping on full outage
- [ ] Key storage server-side only; never in repo

### P5 — Full UI redesign

- [ ] **Web**: shadcn default — collapsible left sidebar, light/dark toggle, navy/black dark palette
- [ ] **Mobile**: React Native Reusables + NativeWind; bottom tabs + More menu
- [ ] **Tables**: search, filters, sort, export Excel + PDF
- [ ] **Mobile lists**: card layout; visual parity with web

### P6 — Living documentation

- [x] Mandatory rule in `docs/MASTER_PLAN.md`, README, `docs/README.md`, guides README, `AGENTS.md`, `.cursor/rules/docs-maintenance.mdc`
- [ ] Enforce in PR review / agent workflow: every feature PR touches checkboxes + changelog

### P7 — JACMS rename (code)

- [ ] Follow [guides/jacms-rename-plan.md](guides/jacms-rename-plan.md) — package, service, tunnel name, PWA, DB optional

### P8 — Mobile Android preview

- [ ] EAS **preview** APK with base URL `https://server.bluraymaldives.site`
- [ ] Office Metro on Debian LAN (dev-only) — [guides/mobile-expo-android-preview.md](guides/mobile-expo-android-preview.md)
- [ ] Attendance + permissions parity milestones (separate tasks under P2/P5)

---

## Milestones (build order)

Pick the next unchecked task in the earliest incomplete milestone.

### M1 — Master documentation & guides

**Goal:** Single checklist-driven roadmap; server ops docs; JACMS naming in docs; Cursor always loads maintenance rule.

**Checklist**

- [x] `docs/MASTER_PLAN.md` (this file) with shipped inventory + planned + milestones
- [x] `docs/guides/*` + cross-links DEPLOY / CLOUDFLARE_TUNNEL
- [x] README rebrand + link master plan
- [x] `.cursor/rules/docs-maintenance.mdc` (`alwaysApply: true`)
- [x] Mandatory rule in AGENTS.md, docs README, guides README

**Acceptance:** Owner can open README → MASTER_PLAN → pick an unchecked `- [ ]`; agents pull rule without extra setup.

---

### M2 — Boot resilience (Debian GNOME server)

**Goal:** After power loss, stack serves LAN + tunnel URL without manual login; Cursor ready on console.

**Checklist**

- [ ] BIOS AC-restore documented and verified on hardware
- [ ] GNOME passwordless auto-login for `server`
- [ ] Cursor autostart on login
- [ ] All systemd units enabled (postgres, nexcrm, nginx, cloudflared)
- [ ] App local without WAN; cloudflared retries
- [ ] `deploy/ensure-boot.sh` or successor updated if unit names/paths change
- [ ] Guides match live host: [autostart-on-boot.md](guides/autostart-on-boot.md), [debian-server-setup.md](guides/debian-server-setup.md)

**Acceptance:** Reboot test: `curl https://server.bluraymaldives.site/health` within N minutes without typing password; `systemctl is-active` all green.

---

### M3 — JACMS rename (code & ops)

**Goal:** Product strings and ops artifacts say JACMS; minimal downtime.

**Checklist**

- [ ] Execute [jacms-rename-plan.md](guides/jacms-rename-plan.md)
- [ ] Update MASTER_PLAN checkboxes for any renamed paths
- [ ] Tunnel hostname unchanged

**Acceptance:** PWA title JACMS; `systemctl status jacms` (or agreed name); docs and commands consistent.

---

### M4 — RBAC v2 (7 roles, scoping, menus)

**Goal:** Correct data isolation especially for **client** and **agency**; menus match permissions.

**Checklist**

- [ ] All **P2** role/scoping tasks
- [ ] Migration for new roles / user phone login
- [ ] API.md + PRODUCT.md updated
- [ ] Tests for client-scope on critical routes

**Acceptance:** Client user cannot `GET` another client’s allocation by ID; web/mobile menus hide forbidden modules.

---

### M5 — Operations health dashboard v2

**Goal:** system_admin sees live server + tunnel + backup every 10s.

**Checklist**

- [ ] All **P3** tasks
- [ ] Backend aggregates tunnel status (read cloudflared/nginx/pg)
- [ ] No secret leakage in health JSON

**Acceptance:** Health page matches checklist; manual failover of cloudflared reflected within 10s.

---

### M6 — Grok Bot

**Goal:** Owner-approved agent automation against production with audit trail.

**Checklist**

- [ ] All **P4** tasks
- [ ] MCP route deployed behind tunnel
- [ ] Approval UX documented in MASTER_PLAN

**Acceptance:** Read works with key; write blocked until approval; audit row exists.

---

### M7 — UI redesign (web + mobile)

**Goal:** Cohesive shadcn / RN Reusables experience.

**Checklist**

- [ ] All **P5** tasks module-by-module (suggest payroll → allocations → employees first)
- [ ] Dark/light toggle persisted

**Acceptance:** Design review on dashboard + one operations module + one mobile tab.

---

### M8 — Mobile field release

**Goal:** Preview APK for managers; API URL production.

**Checklist**

- [ ] EAS preview build in CI or documented manual release
- [ ] Permission-aware mobile (depends M4)
- [ ] [mobile-expo-android-preview.md](guides/mobile-expo-android-preview.md) updated with actual artifact flow

**Acceptance:** APK installs; login to `https://server.bluraymaldives.site`; smoke list screens.

---

## Open items

_Add Adhuhaam’s new ideas here with date bullets; promote into Planned when scoped._

- (none yet in repo)

---

## Agent quick reference

| Need | Path |
| --- | --- |
| Master roadmap | This file |
| HTTP routes | [API.md](API.md) |
| Permissions modules | `modules/access/permissions.ts` |
| Web routes | `web/src/App.tsx` |
| Mobile routes | `mobile/src/app/` |
| Deploy | [DEPLOY.md](DEPLOY.md), `deploy/` |
| Server setup | [guides/README.md](guides/README.md) |

```bash
npm start                      # API + web/dist
cd web && npm run build
npm run check                  # backend smoke tests
cd mobile && npm run typecheck
```
