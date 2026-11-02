create table if not exists accommodations (
  id uuid primary key,
  name text not null,
  address text,
  capacity integer not null default 1,
  daily_rate numeric(12, 2) not null default 0,
  currency text not null default 'MVR',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accommodations drop constraint if exists accommodations_status_check;
alter table accommodations add constraint accommodations_status_check check (status in ('active', 'inactive'));

alter table accommodations drop constraint if exists accommodations_capacity_check;
alter table accommodations add constraint accommodations_capacity_check check (capacity >= 1);

create table if not exists accommodation_stays (
  id uuid primary key,
  accommodation_id uuid not null references accommodations (id) on delete restrict,
  employee_id uuid not null references employees (id) on delete restrict,
  check_in date not null,
  check_out date,
  daily_rate_snapshot numeric(12, 2) not null,
  currency text not null default 'MVR',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists accommodation_stays_accommodation_idx on accommodation_stays (accommodation_id, check_in);
create index if not exists accommodation_stays_employee_idx on accommodation_stays (employee_id, check_in);

create unique index if not exists accommodation_stays_active_employee_idx
  on accommodation_stays (employee_id)
  where check_out is null;
