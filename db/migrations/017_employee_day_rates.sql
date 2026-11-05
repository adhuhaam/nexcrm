-- Default designation + dual per-day rates on the employee (copied onto allocations / payroll).
alter table employees add column if not exists designation text;
alter table employees add column if not exists staff_day_rate numeric(12, 2);
alter table employees add column if not exists bill_day_rate numeric(12, 2);

comment on column employees.staff_day_rate is 'Agency pays this MVR (or currency) amount per paid attendance day';
comment on column employees.bill_day_rate is 'Client is billed this amount per paid attendance day';
comment on column client_allocations.staff_salary is 'Staff pay rate per day (snapshot used by payroll)';
comment on column client_allocations.bill_rate is 'Client bill rate per day (snapshot used by payroll)';
