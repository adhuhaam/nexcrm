# API (`/api/v1`)

Shared JSON API for the React web app and Expo mobile app.  
Base URL examples:

- Local: `http://127.0.0.1:3000`
- Tailscale (mobile): `https://server-1.snowy-pride.ts.net` (see `mobile/src/lib/config.ts`)

All authenticated routes require the `nexcrm_session` cookie from `POST /login`.  
Mutations that change data should be same-origin (browser) / cookie-authenticated (mobile).

Responses are JSON. Errors: `{ "error": "…" }` with 4xx/5xx.

## Auth & session

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/login` | `{ email, password }` → sets cookie |
| POST | `/logout` | Clears session |
| GET | `/api/v1/session` | Current user + role |
| GET | `/health` | Liveness / DB check (no auth) |

## Admin (system_admin)

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

## Companies & clients

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

## Employees & onboard

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

## Agency operations

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

## Projects & work permits

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/projects` | List |
| GET | `/api/v1/projects/:id` | Detail (sites, pools, slots) |
| GET | `/api/v1/work-permits` | List |
| CRUD | work-permit routes via `work-permits-http` | As used by web |

(Prefer matching existing web/mobile callers when extending.)

## Documents & files

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

## Attendance

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

## Overtime

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/v1/ot/rates` | List / upsert rate (`scope`: company\|project\|client) |
| DELETE | `/api/v1/ot/rates/:id` | Deactivate rate |
| GET | `/api/v1/ot/resolve` | `?companyId=&projectId=&clientCompanyId=` → effective rate (client → project → company) |
| GET/POST | `/api/v1/ot/entries` | List / create OT hours (amount = hours × rate snapshot) |
| DELETE | `/api/v1/ot/entries/:id` | Delete entry |

## Finance apps

### Expenses (`/apps/expenses`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/expenses` | Filters: category, from/to, clientId, q |
| POST | `/api/v1/expenses` | Create |
| GET/PATCH/DELETE | `/api/v1/expenses/:id` | Read / update / delete |

Categories: `client_payment` | `investment` | `other`.  
Client company link only for `client_payment`.

### Planned

- Investments ledger → `/api/v1/investments` + `/apps/investments`
- Finance projects / capital tracking → align with or extend CRM projects; document when shipped

## Client conventions

**Web** (`web/src/lib/api.ts`): `getJson`, `sendJson`, `uploadForm`, `postJson` — cookie credentials via same origin.

**Mobile** (`mobile/src/lib/api.ts`): same paths against `BASE_URL`; keep payloads identical so screens stay thin.

When adding an endpoint:

1. Implement module + HTTP handler.
2. Call it from web.
3. Call it from mobile if the screen exists (or leave a TODO in `docs/PRODUCT.md`).
4. Add a row to this file.
