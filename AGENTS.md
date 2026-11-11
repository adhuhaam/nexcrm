# Agent catch-up — JACMS

> ## ⚠️ MANDATORY RULE FOR CURSOR AND EVERY AI AGENT
>
> **YOU MUST MAINTAIN DOCUMENTATION AS PART OF EVERY CHANGE.** Before work: `git pull` and read [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md), [`docs/`](docs/README.md), and [`docs/guides/`](docs/guides/README.md). After work: update the master plan and relevant guides in the **same commit**. Adhuhaam edits docs from many locations — pull/rebase first and **never overwrite** his changes.

Read this first when joining the repo. **JACMS** (JA CRM) is the product name; code may still say `nexcrm` until the rename milestone.

## What this is

Manpower-agency office **super app**: legal **employers** second workers to **clients** with dual monthly rates (staff salary vs bill). One Node API + Postgres serves:

- React web SPA (`web/`) — full office UI / PWA
- Expo mobile (`mobile/`) — field ops against the **same** `/api/v1`

**Public API:** https://server.bluraymaldives.site

## Locked rules (do not invent alternatives)

- Clients are **not** projects. Projects/sites/pools/slots belong to the legal employer.
- Committed LOAs, allocation events, locked pay runs, and files are **immutable** — correct with new events/drafts.
- Attendance (P/AB/OD) drives payroll LOP; ending an allocation auto-adjusts attendance.
- Never fork business logic into mobile — call the API.

## Where to look

| Need | Path |
| --- | --- |
| **Roadmap & checkboxes** | [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) |
| Product map | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Monorepo / auth / extend | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| HTTP surface | [`docs/API.md`](docs/API.md) |
| Deploy / Tailscale | [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/REMOTE.md`](docs/REMOTE.md) |
| Server guides | [`docs/guides/README.md`](docs/guides/README.md) |
| Schema | `lib/schema.ts` + `db/migrations/` |
| HTTP routers | `app/*-http.ts` |
| Domain logic | `modules/` |
| Web shell / SPA nav | `web/src/components/shell.tsx`, `web/src/App.tsx`, `web/src/lib/spa-nav.ts` |
| Settings hub | `web/src/pages/access.tsx` → `/settings` |
| RBAC matrix | `modules/access/permissions.ts`, migration `027_role_permissions.sql` |
| Mobile agent notes | [`mobile/AGENTS.md`](mobile/AGENTS.md) |

## Commands

```bash
npm start                 # API + serves web/dist
cd web && npm run build   # production SPA
npm run check             # backend smoke tests
cd mobile && npm run typecheck
```

Migrations apply on API boot. Do not commit `.env`, passwords, or `deploy/database-network.env`.

## Change habits

1. Pick the next task from **Milestones** in `docs/MASTER_PLAN.md`; update checkboxes in the same commit.
2. Agency feature → `modules/` + router + web page (+ mobile if field-needed) + update `docs/API.md` / `PRODUCT.md` when the surface changes.
3. Finance app → `web/src/lib/apps.ts` + `/apps/<slug>` + own module; keep Operations nav clean.
4. Prefer DD MMM YYYY in UI; APIs stay ISO `YYYY-MM-DD`.
