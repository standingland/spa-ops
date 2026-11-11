-- 0018_reports_ops: utilisation and demand reports. Same access rule as the money reports.
--
-- The period is [p_from 00:00, p_to + 1 day 00:00) in Bangkok time; every duration is clipped to it.
--
-- DEFINITIONS
--   Open minutes          The minutes in the period covered by at least one therapist shift (the union of all shifts).
--                         The spa is "open" when someone is rostered.
--   Room utilisation      Booked room minutes / (open minutes - minutes of maintenance or closed blocks on that room
--                         inside open time). Booked room minutes = service time of bookings that are not cancelled or
--                         no-show (overlapping bookings of one couple are counted once). The reported open_minutes is
--                         that denominator.
--   Therapist utilisation Booked minutes / (shift minutes - time-off minutes inside shifts).
--   Turnover efficiency   For turnovers started in the period: the average minutes from start to ready, and the share
--                         marked ready at or before the due time. Both are empty while no turnover has been marked ready.
--   Peak periods          Bookings that are not cancelled or no-show, by ISO weekday (1 = Monday) and hour of the
--                         Bangkok start time.

create function private.mr_minutes(m tstzmultirange) returns int
  language sql immutable
as $$
  select coalesce(round(sum(extract(epoch from upper(r) - lower(r))) / 60), 0)::int from unnest(m) r
$$;

create function private.report_period(p_from date, p_to date) returns tstzrange
  language sql immutable
as $$
  select tstzrange((p_from::timestamp at time zone 'Asia/Bangkok'), ((p_to + 1)::timestamp at time zone 'Asia/Bangkok'), '[)')
$$;

create function report_room_utilization(p_from date, p_to date)
  returns table (room_id uuid, zone text, category_id uuid, open_minutes int, booked_minutes int, utilization numeric,
                 turnovers int, avg_turnover_min numeric, on_time_rate numeric)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_period tstzrange := private.report_period(p_from, p_to);
  v_open tstzmultirange;
begin
  perform private.require_reports();
  select coalesce(range_agg(s.during * v_period), '{}'::tstzmultirange) into v_open from therapist_shifts s;

  return query
  select r.id, r.zone, r.category_id,
         x.open_min, x.booked_min,
         round(coalesce(x.booked_min::numeric / nullif(x.open_min, 0), 0), 4),
         t.n, t.avg_min, t.on_time
  from rooms r
  cross join lateral (
    select private.mr_minutes(v_open) - private.mr_minutes(v_open * coalesce(
             (select range_agg(rb.during * v_period) from room_blocks rb
              where rb.room_id = r.id and rb.kind in ('maintenance', 'closed')), '{}'::tstzmultirange)) as open_min,
           private.mr_minutes(coalesce(
             (select range_agg(k.service_during * v_period) from bookings k
              where k.room_id = r.id and k.status not in ('cancelled', 'no_show') and k.service_during && v_period),
             '{}'::tstzmultirange)) as booked_min
  ) x
  cross join lateral (
    select count(*)::int as n,
           round((avg(extract(epoch from tt.ready_at - tt.started_at) / 60) filter (where tt.ready_at is not null))::numeric, 1) as avg_min,
           round((avg((tt.ready_at <= tt.due_at)::int) filter (where tt.ready_at is not null))::numeric, 4) as on_time
    from room_turnovers tt where tt.room_id = r.id and v_period @> tt.started_at
  ) t
  where r.active or exists (select 1 from bookings k where k.room_id = r.id and k.service_during && v_period)
  order by r.zone nulls last, r.sort_order, r.code;
end $$;

create function report_therapist_utilization(p_from date, p_to date)
  returns table (therapist_id uuid, shift_minutes int, time_off_minutes int, booked_minutes int, utilization numeric)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_period tstzrange := private.report_period(p_from, p_to);
begin
  perform private.require_reports();
  return query
  select th.id, x.shift_min, x.off_min, x.booked_min,
         round(coalesce(x.booked_min::numeric / nullif(x.shift_min - x.off_min, 0), 0), 4)
  from therapists th
  cross join lateral (
    select coalesce(range_agg(s.during * v_period), '{}'::tstzmultirange) as shifts
    from therapist_shifts s where s.therapist_id = th.id
  ) sh
  cross join lateral (
    select private.mr_minutes(sh.shifts) as shift_min,
           private.mr_minutes(sh.shifts * coalesce(
             (select range_agg(o.during * v_period) from therapist_time_off o where o.therapist_id = th.id),
             '{}'::tstzmultirange)) as off_min,
           private.mr_minutes(coalesce(
             (select range_agg(k.service_during * v_period) from bookings k
              where k.therapist_id = th.id and k.status not in ('cancelled', 'no_show') and k.service_during && v_period),
             '{}'::tstzmultirange)) as booked_min
  ) x
  where x.shift_min > 0 or x.booked_min > 0
  order by th.sort_order, th.display_name, th.id;
end $$;

create function report_peak_periods(p_from date, p_to date)
  returns table (dow int, hour int, bookings int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_reports();
  return query
  select extract(isodow from lower(k.service_during) at time zone 'Asia/Bangkok')::int,
         extract(hour from lower(k.service_during) at time zone 'Asia/Bangkok')::int,
         count(*)::int
  from bookings k
  where k.status not in ('cancelled', 'no_show')
    and private.bangkok_day(lower(k.service_during)) between p_from and p_to
  group by 1, 2 order by 1, 2;
end $$;
