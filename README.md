# JACMS

> ## ⚠️ MANDATORY RULE FOR CURSOR AND EVERY AI AGENT
>
> **YOU MUST MAINTAIN DOCUMENTATION AS PART OF EVERY CHANGE.** Before work: `git pull` and read [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md), [`docs/`](docs/README.md), and [`docs/guides/`](docs/guides/README.md). After work: update the master plan and relevant guides in the **same commit**. Adhuhaam edits docs from many locations — pull/rebase first and **never overwrite** his changes.

Office **super app** for manpower agencies: legal **employers** second staff to **clients** with dual monthly rates (staff salary vs bill). One Node API + PostgreSQL serves a React **PWA** and an Expo **mobile** client on the same `/api/v1`.

**Production URL:** https://server.bluraymaldives.site (via Cloudflare Tunnel)

**Note:** Documentation and product name use **JACMS** (JA CRM). Code, npm package, and systemd unit still use `nexcrm` until the [rename milestone](docs/MASTER_PLAN.md#m3--jacms-rename-code--ops) — see [docs/guides/jacms-rename-plan.md](docs/guides/jacms-rename-plan.md).

---

## Development roadmap

**Start here for all product and ops work:** [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) — checklist inventory (✅ shipped), owner-planned features (📝), and milestones **M1–M8** for Cursor agents.

| Layer | Stack | Location |
| --- | --- | --- |
| API + static host | Node (TypeScript), Drizzle, PostgreSQL | `app/`, `modules/`, `lib/`, `db/` |
| Web | React + Vite + shadcn (PWA) | `web/` |
| Mobile | Expo (React Native) | `mobile/` |

### Shipped highlights (see master plan for full checkboxes)

- Agency CRM: employers, clients, employees, LOAs, allocations (incl. end + attendance), attendance P/AB/OD, OT, payroll LOP, accommodations, documents, projects, work permits, XPAT sync
- Finance: **Expenses** app (`/apps/expenses`)
- Access: email/password, 9 roles, per-module permission matrix, partial client scoping
- Ops: nginx + systemd, optional Tailscale, Cloudflare Tunnel installer
- Mobile: partial API parity (companies, employees, clients, allocations, LOAs, payroll, permits, projects, expenses)

---

## Quick start (dev)

```bash
cp .env.example .env   # DATABASE_URL, FILE_ROOT, optional OPENAI_*
npm install
npm start              # http://127.0.0.1:3000

cd web && npm install && npm run dev   # Vite dev server

npm run check          # backend smoke tests
```

Mobile: `npm run mobile:install && npm run mobile` — see [`mobile/README.md`](mobile/README.md). API base URL for field use: `https://server.bluraymaldives.site`.

---

## Production server (Debian desktop)

| Topic | Guide |
| --- | --- |
| OS, Postgres, Node, nginx | [docs/guides/debian-server-setup.md](docs/guides/debian-server-setup.md) |
| Boot / power loss | [docs/guides/autostart-on-boot.md](docs/guides/autostart-on-boot.md) |
| Public HTTPS | [docs/guides/cloudflare-tunnel-server-bluraymaldives.md](docs/guides/cloudflare-tunnel-server-bluraymaldives.md) |
| Reference deploy | [docs/DEPLOY.md](docs/DEPLOY.md) |

```bash
sudo systemctl status nexcrm nginx postgresql cloudflared
cd web && npm run build && sudo systemctl restart nexcrm
```

---

## Documentation

| Doc | Purpose |
| --- | --- |
| [**docs/MASTER_PLAN.md**](docs/MASTER_PLAN.md) | **Main roadmap** — features, milestones, mandatory maintenance |
| [AGENTS.md](AGENTS.md) | Agent catch-up (rules, paths, commands) |
| [docs/README.md](docs/README.md) | Docs index |
| [docs/guides/README.md](docs/guides/README.md) | Server setup guides |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product map |
| [docs/API.md](docs/API.md) | `/api/v1` surface |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monorepo layout |
| [mobile/AGENTS.md](mobile/AGENTS.md) | Expo agent notes |

## Design rules (locked)

- One API for all clients — no separate mobile backend.
- Clients are **not** projects; projects belong to the legal employer.
- Committed LOAs, allocations, locked pay runs, and files are **immutable** — correct with new events/drafts.
- Attendance (P/AB/OD) drives payroll LOP; ending an allocation auto-adjusts attendance.
