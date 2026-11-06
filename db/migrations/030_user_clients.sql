-- Restaurant managers: bind office users to one or more client companies

create table if not exists user_clients (
  user_id uuid not null references users (id) on delete cascade,
  client_company_id uuid not null references companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_company_id)
);

create index if not exists user_clients_client_idx on user_clients (client_company_id);
