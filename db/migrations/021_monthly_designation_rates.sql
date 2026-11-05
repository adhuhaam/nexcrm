-- Designation rates on clients are monthly salaries (payroll divides by days-in-month).
alter table client_designation_rates rename column staff_day_rate to staff_month_rate;
alter table client_designation_rates rename column bill_day_rate to bill_month_rate;

comment on column client_designation_rates.staff_month_rate is 'Monthly staff pay for this designation; daily = month_rate / days_in_month';
comment on column client_designation_rates.bill_month_rate is 'Monthly client bill for this designation; daily = month_rate / days_in_month';
comment on column client_allocations.staff_salary is 'Monthly staff pay snapshot used by payroll (÷ calendar days in month)';
comment on column client_allocations.bill_rate is 'Monthly client bill snapshot used by payroll (÷ calendar days in month)';
comment on column employees.staff_day_rate is 'Default monthly staff pay (legacy column name); copied to allocations as monthly';
comment on column employees.bill_day_rate is 'Default monthly client bill (legacy column name); copied to allocations as monthly';
