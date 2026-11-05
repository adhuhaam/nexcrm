-- Per-client day rates by designation (staff pay + client bill).
create table if not exists client_designation_rates (
  id uuid primary key,
  client_company_id uuid not null references companies (id) on delete cascade,
  designation text not null,
  staff_day_rate numeric(12, 2) not null,
  bill_day_rate numeric(12, 2) not null,
  currency text not null default 'MVR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_designation_rates_designation_nonempty check (length(trim(designation)) > 0)
);

create unique index if not exists client_designation_rates_client_designation_uidx
  on client_designation_rates (client_company_id, lower(trim(designation)));

create index if not exists client_designation_rates_client_idx
  on client_designation_rates (client_company_id);
