-- Company document branding images for LOA and other letters.
alter table companies
  add column if not exists letterhead_file_id uuid references files (id) on delete set null,
  add column if not exists seal_file_id uuid references files (id) on delete set null,
  add column if not exists signature_file_id uuid references files (id) on delete set null;

create index if not exists companies_letterhead_file_idx on companies (letterhead_file_id);
create index if not exists companies_seal_file_idx on companies (seal_file_id);
create index if not exists companies_signature_file_idx on companies (signature_file_id);

alter table files drop constraint if exists files_kind_check;
alter table files add constraint files_kind_check
  check (kind in (
    'passport_scan',
    'passport_ocr_json',
    'loa_signed',
    'employee_doc',
    'employee_photo',
    'company_letterhead',
    'company_seal',
    'company_signature',
    'other'
  ));
