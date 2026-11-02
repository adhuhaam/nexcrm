alter table employees
  add column if not exists photo_file_id uuid references files (id) on delete set null;

create index if not exists employees_photo_file_id_idx on employees (photo_file_id);
