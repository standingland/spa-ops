-- 0024_public_reads: what the public booking page may read. Every public_* function is for the service role only
-- (called from server code after the app has checked the request); none is callable by anon or authenticated.

-- 1. The availability rules, without the staff-role check, so the public path reuses exactly the same rules.
create function private.available_candidates_core(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)
  returns table (therapist_id uuid, position_id uuid, room_id uuid, therapist_minutes_today int, room_sort int)
  language plpgsql stable set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_svc services;
  v_end timestamptz;
  v_service tstzrange;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
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
revoke execute on function private.available_candidates_core(uuid, timestamptz, uuid) from public, anon, authenticated;

-- 2. The staff function now checks the role and calls the core. Same rules, same result.
create or replace function available_candidates(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)
  returns table (therapist_id uuid, position_id uuid, room_id uuid, therapist_minutes_today int, room_sort int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return query select * from private.available_candidates_core(p_service_id, p_start, p_exclude_booking);
end $$;

-- 3. Public reads.
create function public_therapists()
  returns table (id uuid, display_name text, bio_th text, bio_en text, specialties text[], has_photo boolean)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id, t.display_name, t.bio_th, t.bio_en, t.specialties, t.photo_path is not null
  from therapists t where t.public and t.active order by t.sort_order, t.id
$$;

create function public_therapist_services(p_therapist_id uuid)
  returns table (service_id uuid, name_th text, name_en text, duration_min int, price_satang int)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select s.id, s.name_th, s.name_en, s.duration_min, s.price_satang
  from therapists t
  join therapist_services ts on ts.therapist_id = t.id
  join services s on s.id = ts.service_id
  where t.id = p_therapist_id and t.public and t.active and s.active and s.bookable_online
  order by s.sort_order, s.id
$$;

-- Thirty-minute starts on a Bangkok day when this therapist could take this service, by the same rules as staff
-- booking, inside the lead time and horizon settings. Empty unless online booking is open for this pair.
create function public_free_times(p_therapist_id uuid, p_service_id uuid, p_day date)
  returns table (starts_at timestamptz)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_day_start timestamptz := (p_day::timestamp) at time zone 'Asia/Bangkok';
  v_earliest timestamptz := now() + make_interval(mins => private.setting_int('online.min_lead_min'));
  v_latest timestamptz := now() + make_interval(days => private.setting_int('online.max_ahead_days'));
begin
  if not private.setting_bool('online.enabled') then return; end if;
  if not exists (select 1 from public_therapist_services(p_therapist_id) s where s.service_id = p_service_id) then return; end if;
  return query
  select g.s
  from generate_series(v_day_start, v_day_start + interval '23 hours 30 minutes', interval '30 minutes') g(s)
  where g.s >= v_earliest and g.s <= v_latest
    and exists (select 1 from private.available_candidates_core(p_service_id, g.s) c where c.therapist_id = p_therapist_id)
  order by g.s;
end $$;

create function public_therapist_photo_path(p_therapist_id uuid) returns text
  language sql stable security definer set search_path = public, pg_temp
as $$ select t.photo_path from therapists t where t.id = p_therapist_id and t.public and t.active $$;

revoke execute on function public_therapists(), public_therapist_services(uuid), public_free_times(uuid, uuid, date),
  public_therapist_photo_path(uuid) from public, anon, authenticated;
grant execute on function public_therapists(), public_therapist_services(uuid), public_free_times(uuid, uuid, date),
  public_therapist_photo_path(uuid) to service_role;
