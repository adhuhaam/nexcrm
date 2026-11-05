alter table attendance_records drop constraint if exists attendance_records_status_check;
alter table attendance_records add constraint attendance_records_status_check
  check (status in ('P', 'AB', 'OD'));
