-- Employee self-service: phone login, linked employee, forced password change role.

insert into roles (id, slug, name, can_preview, can_edit, can_delete, system_role)
values (gen_random_uuid(), 'employee_self_service', 'Employee self-service', true, false, false, true)
on conflict (slug) do nothing;

alter table users
  add column if not exists phone text,
  add column if not exists employee_id uuid references employees (id) on delete cascade,
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists users_phone_unique on users (phone) where phone is not null;
create unique index if not exists users_employee_id_unique on users (employee_id) where employee_id is not null;
