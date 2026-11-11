-- 0021_maintenance: owner-controlled retention maintenance. Nothing is deleted until the owner turns pruning on.

create or replace function private.setting_spec()
  returns table (key text, kind text, lo int, hi int, def jsonb)
  language sql immutable
as $$
  values
    ('ops.arrival_window_min',       'int',    5,  240, '60'::jsonb),
    ('ops.late_arrival_min',         'int',    1,  120, '10'::jsonb),
    ('ops.ending_soon_min',          'int',    1,   60, '10'::jsonb),
    ('ops.room_prep_warn_min',       'int',    1,  120, '15'::jsonb),
    ('ops.reserved_lead_min',        'int',    0,  240, '30'::jsonb),
    ('policy.cancel_free_min',       'int',    0, 10080, '120'::jsonb),
    ('policy.cancel_fee_percent',    'int',    0,  100, '0'::jsonb),
    ('policy.no_show_fee_percent',   'int',    0,  100, '0'::jsonb),
    ('payments.receptionist_can_record', 'bool', null, null, 'true'::jsonb),
    ('reports.manager_can_view',     'bool',   null, null, 'true'::jsonb),
    ('retention.inactive_months',    'int',    6,  120, '24'::jsonb),
    ('retention.audit_months',       'int',   12,  120, '24'::jsonb),
    ('retention.prune_enabled',      'bool',   null, null, 'false'::jsonb)
$$;

-- Called by the scheduler (service role) only. With pruning off it deletes nothing. With pruning on it deletes:
--   * audit_log rows older than retention.audit_months months,
--   * notification_outbox rows that were sent more than 90 days ago.
-- It never touches bookings, payments, customers or booking_events.
create function run_maintenance() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_audit int; v_outbox int;
begin
  if not private.setting_bool('retention.prune_enabled') then
    return jsonb_build_object('enabled', false);
  end if;
  delete from audit_log where at < now() - make_interval(months => private.setting_int('retention.audit_months'));
  get diagnostics v_audit = row_count;
  delete from notification_outbox where status = 'sent' and coalesce(sent_at, created_at) < now() - interval '90 days';
  get diagnostics v_outbox = row_count;
  return jsonb_build_object('enabled', true, 'audit_deleted', v_audit, 'outbox_deleted', v_outbox);
end $$;
revoke execute on function run_maintenance() from public, anon, authenticated;
grant execute on function run_maintenance() to service_role;
