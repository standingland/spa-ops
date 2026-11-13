-- 0028_public_booking_hardening: findings from the final review of the public booking page.
--  * a booking key only ever returns that guest's own live booking, and is re-checked after the guest's lock
--  * starts must be on the 30-minute grid the page offers
--  * a guest's cancel charges the same fee a staff cancel would
--  * a therapist's photo is served only while online booking is on

create or replace function public_book(
  p_line_user_id text, p_line_name text, p_therapist_id uuid, p_service_id uuid, p_start timestamptz, p_idempotency_key text)
  returns table (booking_id uuid, starts_at timestamptz)
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing bookings; v_cust uuid; v_row bookings; v_cand record;
begin
  if coalesce(trim(p_line_user_id), '') = '' then raise exception 'NOT_AUTHORIZED'; end if;

  -- A retry of the same request returns that guest's own live booking. Any other booking with this key (someone else's,
  -- or one that was cancelled) is refused: a key is never a way to read or reuse another booking.
  select id into v_cust from customers where line_user_id = p_line_user_id;
  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.customer_id is not distinct from v_cust and v_existing.source = 'online' and v_existing.status <> 'cancelled' then
      return query select v_existing.id, lower(v_existing.service_during); return;
    end if;
    raise exception 'INVALID_INPUT';
  end if;

  if not private.setting_bool('online.enabled')
     or not exists (select 1 from public_therapist_services(p_therapist_id) s where s.service_id = p_service_id) then
    raise exception 'ONLINE_CLOSED';
  end if;
  if p_start < now() + make_interval(mins => private.setting_int('online.min_lead_min'))
     or p_start > now() + make_interval(days => private.setting_int('online.max_ahead_days'))
     or extract(second from p_start) <> 0
     or (extract(minute from p_start at time zone 'Asia/Bangkok')::int % 30) <> 0 then
    raise exception 'OUT_OF_WINDOW';
  end if;

  -- one guest's concurrent submissions are handled one after another, so the cap below cannot be raced
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_user_id, 0));

  -- the same request may have finished while this one waited for the lock (two tabs): answer both with the one booking
  select id into v_cust from customers where line_user_id = p_line_user_id;
  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.customer_id is not distinct from v_cust and v_existing.source = 'online' and v_existing.status <> 'cancelled' then
      return query select v_existing.id, lower(v_existing.service_during); return;
    end if;
    raise exception 'INVALID_INPUT';
  end if;

  insert into customers(display_name, line_user_id, comms_consent, consent_recorded_at)
  values (coalesce(nullif(trim(p_line_name), ''), 'LINE guest'), p_line_user_id, true, now())
  on conflict (line_user_id) do nothing;
  select id into v_cust from customers where line_user_id = p_line_user_id;

  if (select count(*) from bookings k where k.customer_id = v_cust and k.source = 'online'
        and k.status in ('requested', 'confirmed', 'checked_in', 'in_treatment') and upper(k.service_during) > now())
     >= private.setting_int('online.max_upcoming') then
    raise exception 'TOO_MANY_BOOKINGS';
  end if;

  for v_cand in
    select c.position_id from private.available_candidates_core(p_service_id, p_start) c
    where c.therapist_id = p_therapist_id order by c.room_sort, c.position_id
  loop
    begin
      v_row := private.create_booking_core(v_cust, p_service_id, p_therapist_id, v_cand.position_id, p_start, 'online', p_idempotency_key);
      return query select v_row.id, lower(v_row.service_during);
      return;
    exception when others then
      if sqlerrm not in ('POSITION_TAKEN', 'ROOM_OTHER_PARTY') then raise; end if;   -- try the next position
    end;
  end loop;
  raise exception 'SLOT_TAKEN';
end $$;

-- Cancels a guest's own online booking before the cutoff, charging the same late-cancellation fee as a staff cancel.
create or replace function public_cancel(p_booking_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old bookings; v_row bookings; v_fee int := 0;
begin
  select * into v_old from bookings where id = p_booking_id for update;
  if not found or v_old.source <> 'online' then raise exception 'NOT_AUTHORIZED'; end if;
  if v_old.status <> 'confirmed' then raise exception 'INVALID_TRANSITION'; end if;
  if lower(v_old.service_during) - make_interval(mins => private.setting_int('online.cancel_cutoff_min')) < now() then
    raise exception 'CANCEL_TOO_LATE';
  end if;
  -- the same rule set_booking_status applies to a staff cancel
  if now() > lower(v_old.service_during) - make_interval(mins => private.setting_int('policy.cancel_free_min')) then
    v_fee := round(((v_old.price_satang - v_old.discount_satang)::numeric * private.setting_int('policy.cancel_fee_percent')) / 100)::int;
  end if;
  update bookings set status = 'cancelled', fee_satang = v_fee, version = version + 1, updated_at = now()
  where id = v_old.id returning * into v_row;
  insert into booking_events(booking_id, kind, before, after, via)
  values (v_row.id, 'status_changed', to_jsonb(v_old), to_jsonb(v_row), 'guest_online');
end $$;

create or replace function public_therapist_photo_path(p_therapist_id uuid) returns text
  language sql stable security definer set search_path = public, pg_temp
as $$
  select t.photo_path from therapists t
  where t.id = p_therapist_id and t.public and t.active and private.setting_bool('online.enabled')
$$;
