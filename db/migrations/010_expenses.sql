create table if not exists expenses (
  id uuid primary key,
  expense_date date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'MVR',
  category text not null,
  client_company_id uuid references companies (id) on delete restrict,
  counterparty text,
  note text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expenses drop constraint if exists expenses_amount_check;
alter table expenses add constraint expenses_amount_check check (amount > 0);

alter table expenses drop constraint if exists expenses_category_check;
alter table expenses add constraint expenses_category_check
  check (category in ('client_payment', 'investment', 'other'));

alter table expenses drop constraint if exists expenses_client_link_check;
alter table expenses add constraint expenses_client_link_check
  check (
    (category = 'client_payment')
    or (client_company_id is null)
  );

create index if not exists expenses_date_idx on expenses (expense_date desc);
create index if not exists expenses_category_idx on expenses (category);
create index if not exists expenses_client_idx on expenses (client_company_id);
