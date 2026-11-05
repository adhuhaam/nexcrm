create table if not exists ot_rates (
  id uuid primary key,
  scope text not null,
  company_id uuid references companies (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  client_company_id uuid references companies (id) on delete cascade,
  hourly_rate numeric(12, 2) not null,
  currency text not null default 'MVR',
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ot_rates drop constraint if exists ot_rates_scope_check;
alter table ot_rates add constraint ot_rates_scope_check
  check (scope in ('company', 'project', 'client'));

alter table ot_rates drop constraint if exists ot_rates_amount_check;
alter table ot_rates add constraint ot_rates_amount_check check (hourly_rate >= 0);

alter table ot_rates drop constraint if exists ot_rates_scope_target_check;
alter table ot_rates add constraint ot_rates_scope_target_check check (
  (scope = 'company' and company_id is not null and project_id is null and client_company_id is null)
  or (scope = 'project' and project_id is not null and client_company_id is null)
  or (scope = 'client' and client_company_id is not null and project_id is null)
);

create unique index if not exists ot_rates_company_uidx
  on ot_rates (company_id) where scope = 'company' and active = true;
create unique index if not exists ot_rates_project_uidx
  on ot_rates (project_id) where scope = 'project' and active = true;
create unique index if not exists ot_rates_client_uidx
  on ot_rates (client_company_id) where scope = 'client' and active = true;

create table if not exists ot_entries (
  id uuid primary key,
  employee_id uuid not null references employees (id) on delete cascade,
  work_date date not null,
  hours numeric(8, 2) not null,
  company_id uuid references companies (id) on delete set null,
  project_id uuid references projects (id) on delete set null,
  client_company_id uuid references companies (id) on delete set null,
  hourly_rate numeric(12, 2) not null,
  currency text not null default 'MVR',
  amount numeric(12, 2) not null,
  note text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ot_entries drop constraint if exists ot_entries_hours_check;
alter table ot_entries add constraint ot_entries_hours_check check (hours > 0);

create index if not exists ot_entries_date_idx on ot_entries (work_date desc);
create index if not exists ot_entries_employee_idx on ot_entries (employee_id);
create index if not exists ot_entries_client_idx on ot_entries (client_company_id);
create index if not exists ot_entries_project_idx on ot_entries (project_id);
