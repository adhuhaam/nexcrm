-- End-of-allocation reasons + richer event types for payroll-friendly offboarding

alter table client_allocations add column if not exists end_reason text;
alter table client_allocations add column if not exists end_note text;

alter table client_allocations drop constraint if exists client_allocations_end_reason_check;
alter table client_allocations add constraint client_allocations_end_reason_check
  check (end_reason is null or end_reason in ('resign', 'terminate', 'lost', 'transfer_out'));

alter table allocation_events drop constraint if exists allocation_events_type_check;
alter table allocation_events add constraint allocation_events_type_check
  check (event_type in ('join', 'rate_change', 'resign', 'terminate', 'lost', 'transfer', 'transfer_out'));
