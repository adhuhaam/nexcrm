create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  primary key (role_id, module)
);

create index role_permissions_module_idx on role_permissions (module);
