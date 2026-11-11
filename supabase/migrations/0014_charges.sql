-- 0014_charges: what a booking costs. Price and discount live on the booking; a cancellation or no-show fee is
-- computed once, when the status changes, from the policy settings then in force, and is never recalculated.

alter table bookings
  add column fee_satang int not null default 0 check (fee_satang >= 0),
  add column charge_reason text;

alter table booking_events drop constraint booking_events_kind_check;
alter table booking_events add constraint booking_events_kind_check
  check (kind in ('created','status_changed','rescheduled','reassigned','charge_adjusted'));

-- The amount a customer owes for a booking: the fee once it is cancelled or a no-show, the discounted price otherwise.
create function private.booking_charge(b bookings) returns int
  language sql immutable
as $$
  select case when b.status in ('cancelled', 'no_show') then b.fee_satang else b.price_satang - b.discount_satang end
$$;

create or replace function set_booking_status(p_booking_id uuid, p_to booking_status, p_expected_version int)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role app_role := private.current_role();
  v_old bookings; v_row bookings; v_valid boolean; v_own boolean;
  v_room rooms; v_service tstzrange; v_roomr tstzrange;
  v_fee int := 0;
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
  elsif p_to = 'cancelled' then
    if now() > lower(v_old.service_during) - make_interval(mins => private.setting_int('policy.cancel_free_min')) then
      v_fee := round(((v_old.price_satang - v_old.discount_satang)::numeric * private.setting_int('policy.cancel_fee_percent')) / 100)::int;
    end if;
  elsif p_to = 'no_show' then
    v_fee := round(((v_old.price_satang - v_old.discount_satang)::numeric * private.setting_int('policy.no_show_fee_percent')) / 100)::int;
  end if;

  update bookings set
    status = p_to, version = version + 1, updated_at = now(),
    checked_in_at = case when p_to = 'checked_in' then now() else checked_in_at end,
    started_at = case when p_to = 'in_treatment' then now() else started_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end,
    fee_satang = case when p_to in ('cancelled', 'no_show') then v_fee else fee_satang end,
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

-- Owner or manager sets a discount and / or overrides the fee. A null amount leaves that field as it is.
create function adjust_booking_charge(
  p_booking_id uuid, p_discount_satang int, p_fee_satang int, p_reason text, p_expected_version int)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old bookings; v_row bookings; v_disc int; v_fee int;
begin
  perform private.require_role('owner', 'manager');
  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_old.version <> p_expected_version then raise exception 'STALE_VERSION'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;

  v_disc := coalesce(p_discount_satang, v_old.discount_satang);
  v_fee := coalesce(p_fee_satang, v_old.fee_satang);
  if v_disc < 0 or v_disc > v_old.price_satang then raise exception 'INVALID_AMOUNT'; end if;
  if v_fee < 0 or v_fee > v_old.price_satang - v_disc then raise exception 'INVALID_AMOUNT'; end if;

  update bookings set discount_satang = v_disc, fee_satang = v_fee, charge_reason = btrim(p_reason),
    version = version + 1, updated_at = now()
  where id = v_old.id returning * into v_row;

  insert into booking_events(booking_id, kind, before, after)
  values (v_row.id, 'charge_adjusted', to_jsonb(v_old), to_jsonb(v_row));
  return v_row;
end $$;
grant execute on function adjust_booking_charge(uuid, int, int, text, int) to authenticated;
