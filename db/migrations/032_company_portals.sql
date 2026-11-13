-- Legal employer and client company portals (admin-provisioned logins, company-scoped).

insert into roles (id, slug, name, can_preview, can_edit, can_delete, system_role)
values
  (gen_random_uuid(), 'legal_employer', 'Legal employer portal', true, false, false, true),
  (gen_random_uuid(), 'portal_client', 'Client portal', true, false, false, true)
on conflict (slug) do nothing;

alter table users
  add column if not exists portal_company_id uuid references companies (id) on delete cascade;

create index if not exists users_portal_company_idx on users (portal_company_id) where portal_company_id is not null;
