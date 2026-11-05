alter table employees
  add column if not exists xpat_synced_at timestamptz,
  add column if not exists xpat_status text,
  add column if not exists xpat_state_name text;

create index if not exists employees_xpat_synced_at_idx on employees (xpat_synced_at);
