# Agent catch-up — NEXCRM

Read this first when joining the repo. Product and API detail live under [`docs/`](docs/README.md).

## What this is

Manpower-agency office **super app**: legal **employers** second workers to **clients** with dual monthly rates (staff salary vs bill). One Node API + Postgres serves:

- React web SPA (`web/`) — full office UI / PWA
- Expo mobile (`mobile/`) — field ops against the **same** `/api/v1`

## Locked rules (do not invent alternatives)

- Clients are **not** projects. Projects/sites/pools/slots belong to the legal employer.
- Committed LOAs, allocation events, locked pay runs, and files are **immutable** — correct with new events/drafts.
- Attendance (P/AB/OD) drives payroll LOP; ending an allocation auto-adjusts attendance.
- Never fork business logic into mobile — call the API.

## Where to look

| Need | Path |
| --- | --- |
| Product map + roadmap | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Full orientation | [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) |
| Monorepo / auth / extend | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| HTTP surface | [`docs/API.md`](docs/API.md) |
| Deploy / Tailscale | [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/REMOTE.md`](docs/REMOTE.md) |
| Schema | `lib/schema.ts` + `db/migrations/` |
| HTTP routers | `app/*-http.ts` |
| Domain logic | `modules/` |
| Web shell / SPA nav | `web/src/components/shell.tsx`, `web/src/App.tsx`, `web/src/lib/spa-nav.ts` |
| Settings hub (People/Roles/General/Health) | `web/src/pages/access.tsx` → `/settings` |
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

1. Agency feature → `modules/` + router + web page (+ mobile only if field-needed) + update `docs/API.md` / `PRODUCT.md` when the surface changes.
2. Finance app → `web/src/lib/apps.ts` + `/apps/<slug>` + own module; keep Operations nav clean.
3. Prefer DD MMM YYYY in UI; APIs stay ISO `YYYY-MM-DD`.
