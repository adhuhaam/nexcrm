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
