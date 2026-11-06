-- Other staff/client deductions for a pay period (boat, meal, etc.)
-- Survives pay-run recalculate; amounts are copied onto pay_run_items at generate time.

create table if not exists payroll_period_deductions (
  id uuid primary key,
  client_company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  staff_amount numeric(12, 2) not null default 0,
  bill_amount numeric(12, 2) not null default 0,
  note text,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_period_deductions_amounts_nonneg
    check (staff_amount >= 0 and bill_amount >= 0)
);

create unique index if not exists payroll_period_deductions_scope_uidx
  on payroll_period_deductions (client_company_id, employee_id, period_start, period_end);

create index if not exists payroll_period_deductions_client_period_idx
  on payroll_period_deductions (client_company_id, period_start, period_end);

alter table pay_run_items add column if not exists other_deduct_staff numeric(12, 2) not null default 0;
alter table pay_run_items add column if not exists other_deduct_bill numeric(12, 2) not null default 0;
alter table pay_run_items add column if not exists deduction_note text;
