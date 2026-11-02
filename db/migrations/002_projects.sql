create table if not exists employees (
  id uuid primary key,
  company_id uuid not null references companies (id) on delete restrict,
  legal_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  company_id uuid not null references companies (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sites (
  id uuid primary key,
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists quota_pools (
  id uuid primary key,
  site_id uuid not null references sites (id) on delete cascade,
  name text not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create table if not exists slots (
  id uuid primary key,
  project_id uuid not null references projects (id) on delete cascade,
  quota_pool_id uuid not null references quota_pools (id) on delete restrict,
  employee_id uuid not null references employees (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

create table if not exists project_documents (
  id uuid primary key,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists projects_company_idx on projects (company_id);
create index if not exists slots_pool_idx on slots (quota_pool_id);
