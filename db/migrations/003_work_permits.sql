alter table employees
  add column if not exists work_permit_number text,
  add column if not exists nationality text,
  add column if not exists country text,
  add column if not exists gender text,
  add column if not exists date_of_birth date,
  add column if not exists passport_number text,
  add column if not exists passport_expiry date,
  add column if not exists occupation text,
  add column if not exists issued_on date,
  add column if not exists expires_on date,
  add column if not exists fee_paid_until date,
  add column if not exists medical_expiry date,
  add column if not exists insurance_expiry date,
  add column if not exists origin text,
  add column if not exists salary numeric(12, 2),
  add column if not exists arrival_date date,
  add column if not exists work_visa_number text,
  add column if not exists work_visa_expiry date,
  add column if not exists contract_expiry date;

create unique index if not exists employees_work_permit_number_idx
  on employees (work_permit_number)
  where work_permit_number is not null;

alter table sites
  add column if not exists site_type text,
  add column if not exists address text,
  add column if not exists state text not null default 'active';

alter table quota_pools
  add column if not exists pool_number text;

alter table slots alter column employee_id drop not null;
alter table slots add column if not exists slot_number integer;
alter table slots add column if not exists occupation text;
alter table slots add column if not exists status text not null default 'open';
alter table slots add column if not exists expires_on date;

update slots set status = 'occupied' where employee_id is not null;

with numbered as (
  select id, row_number() over (partition by quota_pool_id order by created_at, id) as n
  from slots
  where slot_number is null
)
update slots
set slot_number = numbered.n
from numbered
where slots.id = numbered.id;

alter table slots drop constraint if exists slots_status_check;
alter table slots add constraint slots_status_check check (status in ('open', 'occupied'));
