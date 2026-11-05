create table if not exists attendance_records (
  id uuid primary key,
  employee_id uuid not null references employees (id) on delete cascade,
  attendance_date date not null,
  status text not null,
  note text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table attendance_records drop constraint if exists attendance_records_status_check;
alter table attendance_records add constraint attendance_records_status_check
  check (status in ('P', 'AB'));

create unique index if not exists attendance_records_employee_date_uidx
  on attendance_records (employee_id, attendance_date);

create index if not exists attendance_records_date_idx
  on attendance_records (attendance_date desc);

create index if not exists attendance_records_status_idx
  on attendance_records (status);
