# Restaurant client scope

Restaurant managers are **Client**-scoped office users. Each restaurant is a `companies` row with `kind = client`.

## Rules

| Actor | Sees |
| --- | --- |
| `system_admin` | All clients, payroll, allocations |
| Other users with `user_clients` rows | Only those clients’ payroll, allocations, client list |
| Other users with **no** assignments | Empty client-scoped lists (assign in Settings → People) |

## Schema

Migration `030_user_clients.sql`:

- `user_clients (user_id, client_company_id)` PK

Session payload includes `scopedClientIds: string[] | null` (`null` = unrestricted admin).

## Admin UI

Settings → People → Manage user → **Restaurant clients** checkboxes.

## APIs filtered

- `GET /api/v1/clients`
- `GET /api/v1/allocations` (+ headcount)
- `GET /api/v1/pay-runs` and pay-run detail / print routes
