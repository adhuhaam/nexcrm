alter table employees
  add column if not exists preferred_name text,
  add column if not exists permanent_address text,
  add column if not exists emergency_contact text,
  add column if not exists passport_issue_date date,
  add column if not exists employment_status text,
  add column if not exists project_id uuid references projects (id) on delete set null,
  add column if not exists site_id uuid references sites (id) on delete set null,
  add column if not exists quota_pool_id uuid references quota_pools (id) on delete set null,
  add column if not exists benefits text,
  add column if not exists paid_vacation text,
  add column if not exists working_hours text,
  add column if not exists contract_duration text,
  add column if not exists work_site text,
  add column if not exists site_code text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists employees_company_passport_idx
  on employees (company_id, lower(regexp_replace(passport_number, '\s+', '', 'g')))
  where passport_number is not null and btrim(passport_number) <> '';

create table if not exists document_sequences (
  company_id uuid not null references companies (id) on delete cascade,
  doc_type text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (company_id, doc_type, year)
);

create table if not exists letters (
  id uuid primary key,
  company_id uuid not null references companies (id) on delete restrict,
  employee_id uuid references employees (id) on delete set null,
  document_number text not null,
  letter_date date not null,
  fingerprint text not null,
  snapshot jsonb not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists letters_company_document_number_idx
  on letters (company_id, document_number);

create index if not exists letters_company_id_idx on letters (company_id);
create index if not exists letters_employee_id_idx on letters (employee_id);
create index if not exists letters_fingerprint_idx on letters (fingerprint);
create index if not exists letters_created_at_idx on letters (created_at desc);
