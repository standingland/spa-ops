-- 0007_booking_change: move_booking, set_booking_status, shared slot check, resource-change guards

create function private.lock_resource(p_id uuid) returns void
  language sql as $$ select pg_advisory_xact_lock(hashtextextended(p_id::text, 0)) $$;

-- Maps an exclusion-constraint name to the public error code.
create function private.raise_conflict(p_constraint text) returns void
  language plpgsql as $$
begin
  if p_constraint = 'bookings_therapist_no_overlap' then raise exception 'THERAPIST_BUSY';
  elsif p_constraint = 'bookings_position_no_overlap' then raise exception 'POSITION_TAKEN';
  elsif p_constraint = 'bookings_room_single_party' then raise exception 'ROOM_OTHER_PARTY';
  end if;
end $$;

-- Locks the therapist and the room (lowest uuid first), then validates in a fixed order.
-- p_exclude_booking is accepted for symmetry with available_candidates; booking overlaps
-- themselves are enforced by the exclusion constraints, which ignore the row being updated.
create function private.check_slot(
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

  -- re-read after the lock so concurrent configuration changes are seen
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
end $$;

create or replace function create_booking(
  p_customer_id uuid, p_service_id uuid, p_therapist_id uuid, p_position_id uuid,
  p_start timestamptz, p_source booking_source, p_idempotency_key text,
  p_party_id uuid default null, p_note text default null)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing bookings; v_slot record; v_row bookings; v_constraint text;
begin
  perform private.require_role('owner', 'manager', 'receptionist');

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if p_start < now() - interval '5 minutes' then raise exception 'PAST_START'; end if;

  select * into v_slot from private.check_slot(p_service_id, p_therapist_id, p_position_id, p_start);

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  begin
    insert into bookings(customer_id, service_id, therapist_id, position_id, room_id, party_id,
                         service_during, room_during, status, source, price_satang, note, idempotency_key)
    values (p_customer_id, p_service_id, p_therapist_id, p_position_id, v_slot.o_room_id,
            coalesce(p_party_id, gen_random_uuid()), v_slot.o_service_during, v_slot.o_room_during,
            'confirmed', p_source, v_slot.o_price, p_note, p_idempotency_key)
    returning * into v_row;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_conflict(v_constraint);
      raise;
    when unique_violation then
      select * into v_existing from bookings where idempotency_key = p_idempotency_key;
      if found then return v_existing; end if;
      raise;
  end;

  insert into booking_events(booking_id, kind, after) values (v_row.id, 'created', to_jsonb(v_row));
  return v_row;
end $$;

create function move_booking(p_booking_id uuid, p_start timestamptz, p_therapist_id uuid, p_position_id uuid, p_expected_version int)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old bookings; v_slot record; v_row bookings; v_constraint text;
begin
  perform private.require_role('owner', 'manager', 'receptionist');

  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_old.version <> p_expected_version then raise exception 'STALE_VERSION'; end if;
  if v_old.status not in ('requested', 'confirmed', 'checked_in') then raise exception 'INVALID_TRANSITION'; end if;
  if p_start <> lower(v_old.service_during) and p_start < now() - interval '5 minutes' then
    raise exception 'PAST_START';
  end if;

  select * into v_slot from private.check_slot(v_old.service_id, p_therapist_id, p_position_id, p_start, v_old.id);

  begin
    update bookings set
      therapist_id = p_therapist_id, position_id = p_position_id, room_id = v_slot.o_room_id,
      service_during = v_slot.o_service_during, room_during = v_slot.o_room_during,
      version = version + 1, updated_at = now()
    where id = v_old.id
    returning * into v_row;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform private.raise_conflict(v_constraint);
    raise;
  end;

  insert into booking_events(booking_id, kind, before, after)
  values (v_row.id,
          case when lower(v_row.service_during) <> lower(v_old.service_during) then 'rescheduled' else 'reassigned' end,
          to_jsonb(v_old), to_jsonb(v_row));
  return v_row;
end $$;

create function set_booking_status(p_booking_id uuid, p_to booking_status, p_expected_version int)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role app_role := private.current_role();
  v_old bookings; v_row bookings; v_valid boolean; v_own boolean;
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

  update bookings set status = p_to, version = version + 1, updated_at = now()
  where id = v_old.id returning * into v_row;
  insert into booking_events(booking_id, kind, before, after)
  values (v_row.id, 'status_changed', to_jsonb(v_old), to_jsonb(v_row));
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Resource-change guards. "Active" = requested, confirmed, checked_in, in_treatment;
-- "not ended" = the relevant range ends after now(). They take the same advisory
-- lock as create_booking, so a change and a booking serialise.
-- ---------------------------------------------------------------------------
create function private.guard_room_inactive() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.active and not new.active then
    perform private.lock_resource(old.id);
    if exists (select 1 from bookings b where b.room_id = old.id
               and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.room_during) > now()) then
      raise exception 'CONFLICTS_WITH_BOOKINGS';
    end if;
  end if;
  return new;
end $$;
create trigger rooms_guard before update of active on rooms for each row execute function private.guard_room_inactive();

create function private.guard_position_inactive() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.active and not new.active then
    perform private.lock_resource(old.room_id);
    if exists (select 1 from bookings b where b.position_id = old.id
               and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.room_during) > now()) then
      raise exception 'CONFLICTS_WITH_BOOKINGS';
    end if;
  end if;
  return new;
end $$;
create trigger room_positions_guard before update of active on room_positions for each row execute function private.guard_position_inactive();

create function private.guard_therapist_inactive() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.active and not new.active then
    perform private.lock_resource(old.id);
    if exists (select 1 from bookings b where b.therapist_id = old.id
               and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.service_during) > now()) then
      raise exception 'CONFLICTS_WITH_BOOKINGS';
    end if;
  end if;
  return new;
end $$;
create trigger therapists_guard before update of active on therapists for each row execute function private.guard_therapist_inactive();

create function private.guard_service_inactive() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.active and not new.active then
    perform private.lock_resource(old.id);
    if exists (select 1 from bookings b where b.service_id = old.id
               and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.service_during) > now()) then
      raise exception 'CONFLICTS_WITH_BOOKINGS';
    end if;
  end if;
  return new;
end $$;
create trigger services_guard before update of active on services for each row execute function private.guard_service_inactive();

-- Inserting or widening a room block.
create function private.guard_room_block() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.room_id = new.room_id and old.during @> new.during then
    return new;
  end if;
  perform private.lock_resource(new.room_id);
  if exists (select 1 from bookings b where b.room_id = new.room_id
             and b.status in ('requested','confirmed','checked_in','in_treatment')
             and upper(b.room_during) > now() and b.room_during && new.during) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return new;
end $$;
create trigger room_blocks_guard before insert or update on room_blocks for each row execute function private.guard_room_block();

-- Inserting or widening time off.
create function private.guard_time_off() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.therapist_id = new.therapist_id and old.during @> new.during then
    return new;
  end if;
  perform private.lock_resource(new.therapist_id);
  if exists (select 1 from bookings b where b.therapist_id = new.therapist_id
             and b.status in ('requested','confirmed','checked_in','in_treatment')
             and upper(b.service_during) > now() and b.service_during && new.during) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return new;
end $$;
create trigger therapist_time_off_guard before insert or update on therapist_time_off for each row execute function private.guard_time_off();

-- Shrinking or deleting a shift: refuse if a live booking would no longer sit inside any shift.
create function private.guard_shift() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.therapist_id = new.therapist_id and new.during @> old.during then
    return new;
  end if;
  perform private.lock_resource(old.therapist_id);
  if exists (
    select 1 from bookings b
    where b.therapist_id = old.therapist_id
      and b.status in ('requested','confirmed','checked_in','in_treatment')
      and upper(b.service_during) > now()
      and old.during @> b.service_during
      and not (tg_op = 'UPDATE' and new.therapist_id = old.therapist_id and new.during @> b.service_during)
      and not exists (select 1 from therapist_shifts s where s.therapist_id = old.therapist_id
                      and s.id <> old.id and s.during @> b.service_during)) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger therapist_shifts_guard before update or delete on therapist_shifts for each row execute function private.guard_shift();

create function private.guard_therapist_service() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.lock_resource(old.therapist_id);
  if exists (select 1 from bookings b where b.therapist_id = old.therapist_id and b.service_id = old.service_id
             and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.service_during) > now()) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return old;
end $$;
create trigger therapist_services_guard before delete on therapist_services for each row execute function private.guard_therapist_service();
