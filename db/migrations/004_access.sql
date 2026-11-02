create table roles (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  can_preview boolean not null,
  can_edit boolean not null,
  can_delete boolean not null,
  system_role boolean not null default false,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  role_id uuid not null references roles (id) on delete restrict,
  name text not null,
  email text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
