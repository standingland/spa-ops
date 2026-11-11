-- 0009_turnover: treatment timestamps, room turnover, start/complete rules, mark_room_ready

alter table bookings
  add column checked_in_at timestamptz,
  add column started_at timestamptz,
  add column completed_at timestamptz;

create table room_turnovers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms,
  booking_id uuid not null unique references bookings,
  started_at timestamptz not null default now(),
  due_at timestamptz not null,
  ready_at timestamptz,
  ready_by uuid
);
create unique index room_turnovers_one_open on room_turnovers (room_id) where ready_at is null;

alter table room_turnovers enable row level security;
create policy room_turnovers_select on room_turnovers for select to authenticated
  using (private.current_role() is not null);
create trigger room_turnovers_audit after insert or update or delete on room_turnovers
  for each row execute function private.audit();

-- True when a start within the next five minutes would run into a room that is being cleaned
-- or still occupied by an overrunning treatment.
create function private.room_busy_now(p_room_id uuid, p_start timestamptz, p_exclude_booking uuid)
  returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $$
  select p_start < now() + interval '5 minutes' and (
    exists (select 1 from room_turnovers t where t.room_id = p_room_id and t.ready_at is null)
    or exists (select 1 from bookings b where b.room_id = p_room_id and b.status = 'in_treatment'
               and b.id is distinct from p_exclude_booking and upper(b.room_during) <= p_start))
$$;

-- check_slot: Plan 1 checks in their order, then ROOM_NOT_READY.
create or replace function private.check_slot(
  p_service_id uuid, p_therapist_id uuid, p_position_id uuid, p_start timestamptz, p_exclude_booking uuid default null,
  out o_room_id uuid, out o_service_during tstzrange, out o_room_during tstzrange, out o_price int)
  language plpgsql set search_path = public, pg_temp
as $$
declare
  v_svc services; v_pos room_positions; v_room rooms; v_th therapists; v_end timestamptz;
begin
  select * into v_svc from services where id = p_service_id;
  select * into v_pos from room_positions where id = p_position_id;
  select * into v_room from rooms where id = v_pos.room_id;
  select * into v_th from therapists where id = p_therapist_id;
  if v_svc.id is null or v_pos.id is null or v_room.id is null or v_th.id is null then
    raise exception 'RESOURCE_INACTIVE';
  end if;

  perform private.lock_resource(least(v_th.id, v_room.id));
  perform private.lock_resource(greatest(v_th.id, v_room.id));

  select * into v_svc from services where id = p_service_id;
  select * into v_pos from room_positions where id = p_position_id;
  select * into v_room from rooms where id = v_room.id;
  select * into v_th from therapists where id = p_therapist_id;

  v_end := p_start + make_interval(mins => v_svc.duration_min);
  o_service_during := tstzrange(p_start, v_end, '[)');
  o_room_during := tstzrange(p_start, v_end + make_interval(mins => v_room.turnover_min), '[)');
  o_room_id := v_room.id;
  o_price := v_svc.price_satang;

  if not (v_svc.active and v_th.active and v_room.active and v_pos.active) then raise exception 'RESOURCE_INACTIVE'; end if;
  if not exists (select 1 from therapist_services where therapist_id = v_th.id and service_id = v_svc.id) then
    raise exception 'THERAPIST_NOT_QUALIFIED';
  end if;
  if not ((not exists (select 1 from service_room_categories where service_id = v_svc.id)
           or exists (select 1 from service_room_categories where service_id = v_svc.id and room_category_id = v_room.category_id))
          and v_room.equipment @> v_svc.required_equipment) then
    raise exception 'ROOM_INCOMPATIBLE';
  end if;
  if not exists (select 1 from therapist_shifts where therapist_id = v_th.id and during @> o_service_during) then
    raise exception 'THERAPIST_OFF_SHIFT';
  end if;
  if exists (select 1 from therapist_time_off where therapist_id = v_th.id and during && o_service_during) then
    raise exception 'THERAPIST_TIME_OFF';
  end if;
  if exists (select 1 from room_blocks where room_id = v_room.id and during && o_room_during) then
    raise exception 'ROOM_BLOCKED';
  end if;
  if private.room_busy_now(v_room.id, p_start, p_exclude_booking) then
    raise exception 'ROOM_NOT_READY';
  end if;
end $$;

-- available_candidates: as Plan 1, and rooms that are not ready for an immediate start are left out.
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
  select t.id, pp.id, r.id,
    coalesce((
      select sum(extract(epoch from upper(b.service_during) - lower(b.service_during)) / 60)::int
      from bookings b
      where b.therapist_id = t.id
        and b.status in ('requested', 'confirmed', 'checked_in', 'in_treatment')
        and lower(b.service_during) >= v_day_start and lower(b.service_during) < v_day_end
        and b.id is distinct from p_exclude_booking), 0),
    r.sort_order
  from therapists t
  join therapist_services ts on ts.therapist_id = t.id and ts.service_id = p_service_id
  cross join (rooms r join room_positions pp on pp.room_id = r.id)
  where t.active and r.active and pp.active
    and exists (select 1 from therapist_shifts sh where sh.therapist_id = t.id and sh.during @> v_service)
    and not exists (select 1 from therapist_time_off o where o.therapist_id = t.id and o.during && v_service)
    and not exists (select 1 from bookings b where b.therapist_id = t.id and b.status not in ('cancelled', 'no_show')
                      and b.service_during && v_service and b.id is distinct from p_exclude_booking)
    and (not exists (select 1 from service_room_categories sc where sc.service_id = p_service_id)
         or exists (select 1 from service_room_categories sc where sc.service_id = p_service_id and sc.room_category_id = r.category_id))
    and r.equipment @> v_svc.required_equipment
    and not exists (select 1 from room_blocks rb where rb.room_id = r.id
                      and rb.during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)'))
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status not in ('cancelled', 'no_show')
                      and b.room_during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)')
                      and b.id is distinct from p_exclude_booking)
    and not private.room_busy_now(r.id, p_start, p_exclude_booking);
end $$;

create or replace function set_booking_status(p_booking_id uuid, p_to booking_status, p_expected_version int)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role app_role := private.current_role();
  v_old bookings; v_row bookings; v_valid boolean; v_own boolean;
  v_room rooms; v_service tstzrange; v_roomr tstzrange;
begin
  if v_role is null then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_old.version <> p_expected_version then raise exception 'STALE_VERSION'; end if;

  v_valid := (v_old.status, p_to) in (
    ('requested', 'confirmed'), ('requested', 'cancelled'),
    ('confirmed', 'checked_in'), ('confirmed', 'cancelled'), ('confirmed', 'no_show'),
    ('checked_in', 'in_treatment'), ('checked_in', 'cancelled'),
    ('in_treatment', 'completed'));
  if not v_valid then raise exception 'INVALID_TRANSITION'; end if;

  if v_role = 'therapist' then
    v_own := exists (select 1 from therapists t where t.id = v_old.therapist_id and t.staff_user_id = auth.uid());
    if not v_own or (v_old.status, p_to) not in (('checked_in', 'in_treatment'), ('in_treatment', 'completed')) then
      raise exception 'NOT_AUTHORIZED';
    end if;
  end if;

  select * into v_room from rooms where id = v_old.room_id;
  v_service := v_old.service_during;
  v_roomr := v_old.room_during;

  if p_to = 'in_treatment' then
    perform private.lock_resource(least(v_old.therapist_id, v_old.room_id));
    perform private.lock_resource(greatest(v_old.therapist_id, v_old.room_id));
    if exists (select 1 from room_turnovers t where t.room_id = v_old.room_id and t.ready_at is null)
       or exists (select 1 from bookings b where b.room_id = v_old.room_id and b.status = 'in_treatment'
                  and b.party_id <> v_old.party_id) then
      raise exception 'ROOM_NOT_READY';
    end if;
    if exists (select 1 from bookings b where b.therapist_id = v_old.therapist_id and b.status = 'in_treatment' and b.id <> v_old.id) then
      raise exception 'THERAPIST_BUSY';
    end if;
  elsif p_to = 'completed' then
    perform private.lock_resource(v_old.room_id);
    if lower(v_service) < now() and now() < upper(v_service) then
      v_service := tstzrange(lower(v_service), now(), '[)');
      v_roomr := tstzrange(lower(v_roomr), least(upper(v_roomr), now() + make_interval(mins => v_room.turnover_min)), '[)');
    end if;
  end if;

  update bookings set
    status = p_to, version = version + 1, updated_at = now(),
    checked_in_at = case when p_to = 'checked_in' then now() else checked_in_at end,
    started_at = case when p_to = 'in_treatment' then now() else started_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end,
    service_during = v_service, room_during = v_roomr
  where id = v_old.id returning * into v_row;

  if p_to = 'completed'
     and not exists (select 1 from bookings b where b.room_id = v_old.room_id and b.status = 'in_treatment' and b.id <> v_old.id) then
    insert into room_turnovers(room_id, booking_id, due_at)
    values (v_old.room_id, v_old.id, now() + make_interval(mins => v_room.turnover_min))
    on conflict do nothing;
  end if;

  insert into booking_events(booking_id, kind, before, after)
  values (v_row.id, 'status_changed', to_jsonb(v_old), to_jsonb(v_row));
  return v_row;
end $$;

create function mark_room_ready(p_room_id uuid) returns room_turnovers
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_turn room_turnovers; v_b bookings;
begin
  perform private.require_role('owner', 'manager', 'receptionist', 'therapist');
  perform private.lock_resource(p_room_id);
  select * into v_turn from room_turnovers where room_id = p_room_id and ready_at is null for update;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update room_turnovers set ready_at = now(), ready_by = auth.uid() where id = v_turn.id returning * into v_turn;

  select * into v_b from bookings where id = v_turn.booking_id;
  if now() < upper(v_b.room_during) then
    update bookings set room_during = tstzrange(lower(room_during), greatest(upper(service_during), now()), '[)')
    where id = v_b.id;
  end if;
  return v_turn;
end $$;
