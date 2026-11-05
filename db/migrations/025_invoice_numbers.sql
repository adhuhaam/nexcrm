-- Uniform tax-invoice serial numbers for client payment requests (INV-000001 …)

create table if not exists invoice_counters (
  id text primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into invoice_counters (id, last_value)
values ('tax_invoice', 0)
on conflict (id) do nothing;

alter table pay_runs add column if not exists invoice_number text;

create unique index if not exists pay_runs_invoice_number_uidx
  on pay_runs (invoice_number)
  where invoice_number is not null;
