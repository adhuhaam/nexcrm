-- Calendar-day LOP payroll: generation modes + item breakdown columns

alter table pay_runs add column if not exists generation_mode text not null default 'employer_client';

alter table pay_runs drop constraint if exists pay_runs_generation_mode_check;
alter table pay_runs add constraint pay_runs_generation_mode_check
  check (generation_mode in ('client_batch', 'employer_client'));

create unique index if not exists pay_runs_client_employer_period_uidx
  on pay_runs (client_company_id, employer_company_id, period_start, period_end);

alter table pay_run_items add column if not exists calendar_days integer not null default 0;
alter table pay_run_items add column if not exists paid_days integer not null default 0;
alter table pay_run_items add column if not exists absent_days integer not null default 0;
alter table pay_run_items add column if not exists off_days integer not null default 0;
alter table pay_run_items add column if not exists unmarked_days integer not null default 0;
alter table pay_run_items add column if not exists gross_staff numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists lop_staff numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists ot_staff numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists net_staff numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists gross_bill numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists lop_bill numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists ot_bill numeric(12,2) not null default 0;
alter table pay_run_items add column if not exists net_bill numeric(12,2) not null default 0;
