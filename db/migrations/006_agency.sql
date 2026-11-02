-- Company kind: employer (legal employer / agency) vs client
alter table companies
  add column if not exists kind text not null default 'employer';

alter table companies drop constraint if exists companies_kind_check;
alter table companies add constraint companies_kind_check check (kind in ('employer', 'client'));

update companies set kind = 'employer' where kind is null or kind = '';

-- Files vault (bytes on disk under FILE_ROOT)
create table if not exists files (
  id uuid primary key,
  original_name text not null,
  stored_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  kind text not null,
  sha256 text,
  uploaded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table files drop constraint if exists files_kind_check;
alter table files add constraint files_kind_check
  check (kind in ('passport_scan', 'passport_ocr_json', 'loa_signed', 'employee_doc', 'other'));

create table if not exists file_links (
  id uuid primary key,
  file_id uuid not null references files (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists file_links_entity_idx on file_links (entity_type, entity_id);
create index if not exists file_links_file_id_idx on file_links (file_id);

-- Employments: person ↔ legal employer
create table if not exists employments (
  id uuid primary key,
  employee_id uuid not null references employees (id) on delete restrict,
  employer_company_id uuid not null references companies (id) on delete restrict,
  employee_number text,
  join_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table employments drop constraint if exists employments_status_check;
alter table employments add constraint employments_status_check check (status in ('active', 'ended'));

create unique index if not exists employments_active_employee_idx
  on employments (employee_id)
  where status = 'active';

create index if not exists employments_employer_idx on employments (employer_company_id);

-- Backfill employment from employees.company_id
insert into employments (id, employee_id, employer_company_id, join_date, status)
select gen_random_uuid(), e.id, e.company_id, e.created_at::date, 'active'
from employees e
where not exists (
  select 1 from employments em where em.employee_id = e.id and em.status = 'active'
);

-- Client allocations (secondment)
create table if not exists client_allocations (
  id uuid primary key,
  employee_id uuid not null references employees (id) on delete restrict,
  employer_company_id uuid not null references companies (id) on delete restrict,
  client_company_id uuid not null references companies (id) on delete restrict,
  join_date date not null,
  resign_date date,
  designation text,
  staff_salary numeric(12, 2) not null,
  bill_rate numeric(12, 2) not null,
  currency text not null default 'MVR',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_allocations drop constraint if exists client_allocations_status_check;
alter table client_allocations add constraint client_allocations_status_check
  check (status in ('active', 'ended'));

create unique index if not exists client_allocations_active_employee_idx
  on client_allocations (employee_id)
  where status = 'active';

create index if not exists client_allocations_client_idx on client_allocations (client_company_id);
create index if not exists client_allocations_employer_idx on client_allocations (employer_company_id);

create table if not exists allocation_events (
  id uuid primary key,
  allocation_id uuid not null references client_allocations (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table allocation_events drop constraint if exists allocation_events_type_check;
alter table allocation_events add constraint allocation_events_type_check
  check (event_type in ('join', 'rate_change', 'resign', 'transfer'));

create index if not exists allocation_events_allocation_idx on allocation_events (allocation_id, created_at);

-- Per-client payroll
create table if not exists pay_runs (
  id uuid primary key,
  employer_company_id uuid not null references companies (id) on delete restrict,
  client_company_id uuid not null references companies (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  created_by uuid references users (id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table pay_runs drop constraint if exists pay_runs_status_check;
alter table pay_runs add constraint pay_runs_status_check check (status in ('draft', 'locked'));

create index if not exists pay_runs_client_period_idx on pay_runs (client_company_id, period_start, period_end);

create table if not exists pay_run_items (
  id uuid primary key,
  pay_run_id uuid not null references pay_runs (id) on delete cascade,
  allocation_id uuid not null references client_allocations (id) on delete restrict,
  employee_id uuid not null references employees (id) on delete restrict,
  employee_name text not null,
  designation text,
  staff_salary numeric(12, 2) not null,
  bill_rate numeric(12, 2) not null,
  currency text not null default 'MVR',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pay_run_items_pay_run_idx on pay_run_items (pay_run_id);

-- LOA signed copy linkage
alter table letters
  add column if not exists status text not null default 'issued',
  add column if not exists signed_file_id uuid references files (id) on delete set null;

alter table letters drop constraint if exists letters_status_check;
alter table letters add constraint letters_status_check
  check (status in ('issued', 'signed_archived'));
