create table system_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
