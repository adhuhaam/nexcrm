-- Universal designation catalog for employees, client rates, and allocations.
create table if not exists designations (
  id uuid primary key,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint designations_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists designations_name_uidx
  on designations (lower(trim(name)));

create index if not exists designations_active_sort_idx
  on designations (active, sort_order, lower(trim(name)));

-- Seed common roles plus any names already used in the office.
insert into designations (id, name, sort_order, active)
select gen_random_uuid(), seed.name, seed.sort_order, true
from (
  values
    ('Labor', 10),
    ('Mason', 20),
    ('Steward', 30),
    ('Helper', 40),
    ('Technician', 50)
) as seed(name, sort_order)
where not exists (
  select 1 from designations d where lower(trim(d.name)) = lower(seed.name)
);

insert into designations (id, name, sort_order, active)
select gen_random_uuid(), src.name, 100, true
from (
  select distinct trim(name) as name
  from (
    select designation as name from employees where designation is not null and length(trim(designation)) > 0
    union
    select designation from client_allocations where designation is not null and length(trim(designation)) > 0
    union
    select designation from client_designation_rates where length(trim(designation)) > 0
  ) u
) src
where not exists (
  select 1 from designations d where lower(trim(d.name)) = lower(src.name)
);
