-- 0020_performance: indexes the load budgets (tests/perf/budgets.test.ts, a year of data) showed to be necessary.

-- report_summary / customer_summary / customer search: a customer's bookings, and "had a completed booking before X".
create index bookings_customer_idx on bookings (customer_id);
create index bookings_customer_status_start_idx on bookings (customer_id, status, (lower(service_during)));
-- every report and the day / week boards select bookings by the day their service starts.
create index bookings_start_idx on bookings ((lower(service_during)));
-- available_candidates: a therapist's minutes on one day (the range index above cannot serve lower()).
create index bookings_therapist_start_idx on bookings (therapist_id, (lower(service_during)));
-- room_busy_now (called per room by available_candidates and create / move): only treatments in progress matter.
create index bookings_in_treatment_idx on bookings (room_id) where status = 'in_treatment';
-- stranded_bookings, Today and the arrivals list: live bookings that have not ended yet.
create index bookings_live_end_idx on bookings ((upper(service_during))) where status in ('requested', 'confirmed', 'checked_in');
-- report_summary reschedules, booking history.
create index booking_events_booking_idx on booking_events (booking_id);
-- retention maintenance and audit review by date.
create index audit_log_at_idx on audit_log (at);
-- stranded_bookings and report_therapist_utilization: time off and blocks by resource and time.
create index therapist_time_off_during_idx on therapist_time_off using gist (therapist_id, during);
create index room_blocks_during_idx on room_blocks using gist (room_id, during);
-- report_room_utilization: turnovers by start time.
create index room_turnovers_started_idx on room_turnovers (started_at);

-- available_candidates (budget: 250 ms on 60 therapists x 42 positions): same rules and same result, but the
-- therapist rules and the room rules are each applied once per therapist / room (not once per therapist x position
-- pair), the day's minutes are computed once per therapist, and the two sets are joined at the end.
create or replace function available_candidates(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)
  returns table (therapist_id uuid, position_id uuid, room_id uuid, therapist_minutes_today int, room_sort int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_svc services;
  v_end timestamptz;
  v_service tstzrange;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  select * into v_svc from services s where s.id = p_service_id and s.active;
  if not found then return; end if;
  v_end := p_start + make_interval(mins => v_svc.duration_min);
  v_service := tstzrange(p_start, v_end, '[)');
  v_day_start := date_trunc('day', p_start at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  v_day_end := v_day_start + interval '1 day';

  return query
  with th as materialized (
    select t.id as tid,
      coalesce((
        select sum(extract(epoch from upper(b.service_during) - lower(b.service_during)) / 60)::int
        from bookings b
        where b.therapist_id = t.id
          and b.status in ('requested', 'confirmed', 'checked_in', 'in_treatment')
          and lower(b.service_during) >= v_day_start and lower(b.service_during) < v_day_end
          and b.id is distinct from p_exclude_booking), 0) as mins
    from therapists t
    join therapist_services ts on ts.therapist_id = t.id and ts.service_id = p_service_id
    where t.active
      and exists (select 1 from therapist_shifts sh where sh.therapist_id = t.id and sh.during @> v_service)
      and not exists (select 1 from therapist_time_off o where o.therapist_id = t.id and o.during && v_service)
      and not exists (select 1 from bookings b where b.therapist_id = t.id and b.status not in ('cancelled', 'no_show')
                        and b.service_during && v_service and b.id is distinct from p_exclude_booking)
  ), rm as materialized (
    select r.id as rid, r.sort_order as sort_order
    from rooms r
    where r.active
      and (not exists (select 1 from service_room_categories sc where sc.service_id = p_service_id)
           or exists (select 1 from service_room_categories sc where sc.service_id = p_service_id and sc.room_category_id = r.category_id))
      and r.equipment @> v_svc.required_equipment
      and not exists (select 1 from room_blocks rb where rb.room_id = r.id
                        and rb.during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)'))
      and not exists (select 1 from bookings b where b.room_id = r.id and b.status not in ('cancelled', 'no_show')
                        and b.room_during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)')
                        and b.id is distinct from p_exclude_booking)
      and not private.room_busy_now(r.id, p_start, p_exclude_booking)
  )
  select th.tid, pp.id, rm.rid, th.mins, rm.sort_order
  from th cross join rm join room_positions pp on pp.room_id = rm.rid and pp.active;
end $$;
