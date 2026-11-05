-- Uniform salary-sheet serial numbers (PAY-000001 …)

insert into invoice_counters (id, last_value)
values ('salary_sheet', 0)
on conflict (id) do nothing;

alter table pay_runs add column if not exists salary_sheet_number text;

create unique index if not exists pay_runs_salary_sheet_number_uidx
  on pay_runs (salary_sheet_number)
  where salary_sheet_number is not null;
