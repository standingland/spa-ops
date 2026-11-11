-- 0006_booking_create: availability search and create_booking

create function available_candidates(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)
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
    -- therapist: on shift, not on time off, not busy
    and exists (select 1 from therapist_shifts sh where sh.therapist_id = t.id and sh.during @> v_service)
    and not exists (select 1 from therapist_time_off o where o.therapist_id = t.id and o.during && v_service)
    and not exists (select 1 from bookings b where b.therapist_id = t.id and b.status not in ('cancelled', 'no_show')
                      and b.service_during && v_service and b.id is distinct from p_exclude_booking)
    -- room: compatible, not blocked, position not taken, room not held by another party
    and (not exists (select 1 from service_room_categories sc where sc.service_id = p_service_id)
         or exists (select 1 from service_room_categories sc where sc.service_id = p_service_id and sc.room_category_id = r.category_id))
    and r.equipment @> v_svc.required_equipment
    and not exists (select 1 from room_blocks rb where rb.room_id = r.id
                      and rb.during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)'))
    and not exists (select 1 from bookings b where b.room_id = r.id and b.status not in ('cancelled', 'no_show')
                      and b.room_during && tstzrange(p_start, v_end + make_interval(mins => r.turnover_min), '[)')
                      and b.id is distinct from p_exclude_booking);
end $$;

create function create_booking(
  p_customer_id uuid, p_service_id uuid, p_therapist_id uuid, p_position_id uuid,
  p_start timestamptz, p_source booking_source, p_idempotency_key text,
  p_party_id uuid default null, p_note text default null)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing bookings;
  v_svc services;
  v_pos room_positions;
  v_room rooms;
  v_th therapists;
  v_end timestamptz;
  v_service tstzrange;
  v_roomr tstzrange;
  v_row bookings;
  v_constraint text;
begin
  perform private.require_role('owner', 'manager', 'receptionist');

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if p_start < now() - interval '5 minutes' then raise exception 'PAST_START'; end if;

  select * into v_svc from services where id = p_service_id;
  select * into v_pos from room_positions where id = p_position_id;
  select * into v_room from rooms where id = v_pos.room_id;
  select * into v_th from therapists where id = p_therapist_id;
  if v_svc.id is null or v_pos.id is null or v_room.id is null or v_th.id is null then
    raise exception 'RESOURCE_INACTIVE';
  end if;

  -- lock the therapist and the room, lowest uuid first
  perform pg_advisory_xact_lock(hashtextextended(least(v_th.id, v_room.id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_th.id, v_room.id)::text, 0));

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  v_end := p_start + make_interval(mins => v_svc.duration_min);
  v_service := tstzrange(p_start, v_end, '[)');
  v_roomr := tstzrange(p_start, v_end + make_interval(mins => v_room.turnover_min), '[)');

  if not (v_svc.active and v_th.active and v_room.active and v_pos.active) then raise exception 'RESOURCE_INACTIVE'; end if;
  if not exists (select 1 from therapist_services where therapist_id = v_th.id and service_id = v_svc.id) then
    raise exception 'THERAPIST_NOT_QUALIFIED';
  end if;
  if not ((not exists (select 1 from service_room_categories where service_id = v_svc.id)
           or exists (select 1 from service_room_categories where service_id = v_svc.id and room_category_id = v_room.category_id))
          and v_room.equipment @> v_svc.required_equipment) then
    raise exception 'ROOM_INCOMPATIBLE';
  end if;
  if not exists (select 1 from therapist_shifts where therapist_id = v_th.id and during @> v_service) then
    raise exception 'THERAPIST_OFF_SHIFT';
  end if;
  if exists (select 1 from therapist_time_off where therapist_id = v_th.id and during && v_service) then
    raise exception 'THERAPIST_TIME_OFF';
  end if;
  if exists (select 1 from room_blocks where room_id = v_room.id and during && v_roomr) then
    raise exception 'ROOM_BLOCKED';
  end if;

  begin
    insert into bookings(customer_id, service_id, therapist_id, position_id, room_id, party_id,
                         service_during, room_during, status, source, price_satang, note, idempotency_key)
    values (p_customer_id, v_svc.id, v_th.id, v_pos.id, v_room.id, coalesce(p_party_id, gen_random_uuid()),
            v_service, v_roomr, 'confirmed', p_source, v_svc.price_satang, p_note, p_idempotency_key)
    returning * into v_row;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'bookings_therapist_no_overlap' then raise exception 'THERAPIST_BUSY';
    elsif v_constraint = 'bookings_position_no_overlap' then raise exception 'POSITION_TAKEN';
    elsif v_constraint = 'bookings_room_single_party' then raise exception 'ROOM_OTHER_PARTY';
    end if;
    raise;
  end;

  insert into booking_events(booking_id, kind, after) values (v_row.id, 'created', to_jsonb(v_row));
  return v_row;
end $$;
