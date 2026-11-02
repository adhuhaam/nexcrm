create table if not exists companies (
  id uuid primary key,
  legal_name text not null,
  registration_number text,
  registered_address text,
  country text,
  business_activity text,
  phone text,
  email text,
  document_prefix text,
  signatory_name text,
  signatory_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_preferences (
  scope_key text primary key,
  default_company_id uuid references companies (id) on delete set null,
  selected_company_id uuid references companies (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into company_preferences (scope_key)
values ('local')
on conflict (scope_key) do nothing;

create table if not exists document_snapshots (
  id uuid primary key,
  company_id uuid not null references companies (id) on delete restrict,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists companies_legal_name_idx on companies (legal_name);
create index if not exists document_snapshots_company_idx on document_snapshots (company_id);
