-- 0026_public_booking: guests who book themselves, verified by LINE. All public_* functions are service-role only.


-- A guest is identified by their LINE user id. Never merged with an existing customer.
alter table customers add column line_user_id text unique;
-- booking_events.actor is the signed-in staff user; "via" says an action came from the public page.
alter table booking_events add column via text;

-- A guest who has a LINE id can be messaged even without a phone number or email.
create or replace function private.enqueue_notification() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_template text;
  v_b bookings;
  v_c customers;
begin
  v_template := case
    when new.kind = 'created' then 'booking_confirmed'
    when new.kind = 'rescheduled' then 'booking_changed'
    when new.kind = 'status_changed' and new.after ->> 'status' = 'cancelled' then 'booking_cancelled'
  end;
  if v_template is null then return null; end if;

  select * into v_b from bookings where id = new.booking_id;
  select * into v_c from customers where id = v_b.customer_id;
  if not v_c.comms_consent
     or (coalesce(trim(v_c.phone), '') = '' and coalesce(trim(v_c.email), '') = '' and v_c.line_user_id is null) then
    return null;
  end if;

  insert into notification_outbox(booking_id, customer_id, template, payload, dedupe_key)
  values (v_b.id, v_c.id, v_template,
          jsonb_build_object('booking_id', v_b.id, 'starts_at', lower(v_b.service_during)),
          new.id::text)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;

-- Anonymising a customer also removes their LINE id.
create or replace function anonymise_customer(p_customer_id uuid, p_reason text) returns customers
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cust customers; v_row customers; v_ids uuid[];
begin
  perform private.require_role('owner');
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into v_cust from customers where id = p_customer_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_cust.anonymised_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from bookings k where k.customer_id = p_customer_id
             and k.status in ('requested', 'confirmed', 'checked_in', 'in_treatment') and upper(k.service_during) > now()) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;

  perform set_config('app.anonymising', 'on', true);
  select coalesce(array_agg(id), '{}') into v_ids from bookings where customer_id = p_customer_id;

  update customers set display_name = 'Removed', full_name = null, phone = null, email = null, user_id = null, line_user_id = null,
    preferred_therapist_id = null, service_notes = null, comms_consent = false, anonymised_at = now()
  where id = p_customer_id returning * into v_row;

  delete from customer_private_notes where customer_id = p_customer_id;
  update bookings set note = null where id = any (v_ids) and note is not null;
  update booking_events set before = before - 'note', after = after - 'note' where booking_id = any (v_ids);
  update notification_outbox set status = 'dead', last_error = 'customer anonymised'
  where customer_id = p_customer_id and status in ('pending', 'failed');

  -- the audit trail must not keep what was removed
  update audit_log set old = null, new = null
  where (table_name = 'customers' and row_id = p_customer_id)
     or (table_name = 'customer_private_notes' and (old ->> 'customer_id' = p_customer_id::text or new ->> 'customer_id' = p_customer_id::text));
  update audit_log set old = old - 'note', new = new - 'note'
  where table_name = 'bookings' and row_id = any (v_ids);

  insert into audit_log(actor, table_name, row_id, action, new)
  values (auth.uid(), 'customers', p_customer_id, 'ANONYMISE', jsonb_build_object('reason', btrim(p_reason)));
  return v_row;
end $$;

-- create_booking's body without the staff-role check, shared by staff booking and public booking.
create function private.create_booking_core(
  p_customer_id uuid, p_service_id uuid, p_therapist_id uuid, p_position_id uuid,
  p_start timestamptz, p_source booking_source, p_idempotency_key text,
  p_party_id uuid default null, p_note text default null)
  returns bookings
  language plpgsql set search_path = public, pg_temp
as $$
declare
  v_existing bookings; v_slot record; v_row bookings; v_constraint text;
begin
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
revoke execute on function private.create_booking_core(uuid, uuid, uuid, uuid, timestamptz, booking_source, text, uuid, text) from public, anon, authenticated;

create or replace function create_booking(
  p_customer_id uuid, p_service_id uuid, p_therapist_id uuid, p_position_id uuid,
  p_start timestamptz, p_source booking_source, p_idempotency_key text,
  p_party_id uuid default null, p_note text default null)
  returns bookings
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return private.create_booking_core(p_customer_id, p_service_id, p_therapist_id, p_position_id, p_start, p_source, p_idempotency_key, p_party_id, p_note);
end $$;

-- A guest books a service with a public therapist. Errors: ONLINE_CLOSED, OUT_OF_WINDOW, TOO_MANY_BOOKINGS,
-- SLOT_TAKEN (nobody is free any more), and the staff booking codes such as THERAPIST_BUSY.
create function public_book(
  p_line_user_id text, p_line_name text, p_therapist_id uuid, p_service_id uuid, p_start timestamptz, p_idempotency_key text)
  returns table (booking_id uuid, starts_at timestamptz)
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_existing bookings; v_cust uuid; v_row bookings; v_cand record; v_tried boolean := false;
begin
  if coalesce(trim(p_line_user_id), '') = '' then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then return query select v_existing.id, lower(v_existing.service_during); return; end if;

  if not private.setting_bool('online.enabled')
     or not exists (select 1 from public_therapist_services(p_therapist_id) s where s.service_id = p_service_id) then
    raise exception 'ONLINE_CLOSED';
  end if;
  if p_start < now() + make_interval(mins => private.setting_int('online.min_lead_min'))
     or p_start > now() + make_interval(days => private.setting_int('online.max_ahead_days')) then
    raise exception 'OUT_OF_WINDOW';
  end if;

  -- one guest's concurrent submissions are handled one after another, so the cap below cannot be raced
  perform pg_advisory_xact_lock(hashtextextended('line:' || p_line_user_id, 0));

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
    v_tried := true;
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

-- Cancels a guest's own online booking before the cutoff. The caller (server code) has already checked the signed token.
create function public_cancel(p_booking_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old bookings; v_row bookings;
begin
  select * into v_old from bookings where id = p_booking_id for update;
  if not found or v_old.source <> 'online' then raise exception 'NOT_AUTHORIZED'; end if;
  if v_old.status <> 'confirmed' then raise exception 'INVALID_TRANSITION'; end if;
  if lower(v_old.service_during) - make_interval(mins => private.setting_int('online.cancel_cutoff_min')) < now() then
    raise exception 'CANCEL_TOO_LATE';
  end if;
  update bookings set status = 'cancelled', version = version + 1, updated_at = now()
  where id = v_old.id returning * into v_row;
  insert into booking_events(booking_id, kind, before, after, via)
  values (v_row.id, 'status_changed', to_jsonb(v_old), to_jsonb(v_row), 'guest_online');
end $$;

-- The minimum the confirmation page needs, for online bookings only.
create function public_booking_view(p_booking_id uuid)
  returns table (starts_at timestamptz, ends_at timestamptz, status booking_status, service_name_th text, service_name_en text, therapist_name text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select lower(b.service_during), upper(b.service_during), b.status, s.name_th, s.name_en, t.display_name
  from bookings b join services s on s.id = b.service_id join therapists t on t.id = b.therapist_id
  where b.id = p_booking_id and b.source = 'online'
$$;

revoke execute on function public_book(text, text, uuid, uuid, timestamptz, text), public_cancel(uuid), public_booking_view(uuid)
  from public, anon, authenticated;
grant execute on function public_book(text, text, uuid, uuid, timestamptz, text), public_cancel(uuid), public_booking_view(uuid)
  to service_role;
