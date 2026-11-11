-- 0016_customer_privacy: customer record fields, summary, treatment notes for therapists, export,
-- anonymisation and the retention list. This builds the tools; it does not make a legal judgment.

alter table customers
  add column service_notes text,
  add column anonymised_at timestamptz,
  add constraint customers_phone_format check (phone is null or phone ~ '^(0[0-9]{8,9}|\+[0-9]{6,15})$');
create unique index customers_phone_unique on customers (phone) where phone is not null;

-- anonymised_at can only be set by anonymise_customer(); an emptied record cannot be refilled.
create function private.guard_customer_anonymised() returns trigger
  language plpgsql
as $$
begin
  if new.anonymised_at is distinct from old.anonymised_at
     and coalesce(current_setting('app.anonymising', true), '') <> 'on' then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if old.anonymised_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  return new;
end $$;
create trigger customers_guard_anonymised before update on customers
  for each row execute function private.guard_customer_anonymised();

create function customer_summary(p_customer_id uuid)
  returns table (visits int, cancelled int, no_shows int, first_visit timestamptz, last_visit timestamptz,
                 avg_days_between numeric, top_service_id uuid, upcoming int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return query
  select
    (count(*) filter (where k.status = 'completed'))::int,
    (count(*) filter (where k.status = 'cancelled'))::int,
    (count(*) filter (where k.status = 'no_show'))::int,
    min(lower(k.service_during)) filter (where k.status = 'completed'),
    max(lower(k.service_during)) filter (where k.status = 'completed'),
    case when count(*) filter (where k.status = 'completed') >= 2
         then round((extract(epoch from (max(lower(k.service_during)) filter (where k.status = 'completed')
                                         - min(lower(k.service_during)) filter (where k.status = 'completed'))) / 86400.0)
                    / (count(*) filter (where k.status = 'completed') - 1), 1)
    end,
    (select s.service_id from (
        select x.service_id, count(*) n from bookings x
        where x.customer_id = p_customer_id and x.status = 'completed' group by x.service_id
        order by count(*) desc, x.service_id limit 1) s),
    (count(*) filter (where k.status in ('requested', 'confirmed', 'checked_in') and upper(k.service_during) > now()))::int
  from bookings k where k.customer_id = p_customer_id;
end $$;

-- What a treatment needs, nothing more: never contact details.
create function booking_detail(p_booking_id uuid)
  returns table (booking_id uuid, note text, service_notes text, customer_display_name text)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role app_role := private.current_role();
  v_b bookings;
begin
  if v_role is null then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_b from bookings where id = p_booking_id;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_role = 'therapist'
     and not exists (select 1 from therapists t where t.id = v_b.therapist_id and t.staff_user_id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select v_b.id, v_b.note, c.service_notes, c.display_name from customers c where c.id = v_b.customer_id;
end $$;

create function export_customer(p_customer_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_out jsonb;
begin
  perform private.require_role('owner', 'manager');
  select jsonb_build_object(
    'profile', to_jsonb(c),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at) order by n.created_at)
                       from customer_private_notes n where n.customer_id = c.id), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', k.id, 'starts_at', lower(k.service_during), 'ends_at', upper(k.service_during), 'status', k.status,
                  'service', s.name_th, 'therapist', t.display_name, 'room', r.code,
                  'price_satang', k.price_satang, 'discount_satang', k.discount_satang, 'fee_satang', k.fee_satang, 'note', k.note)
                  order by lower(k.service_during))
                from bookings k join services s on s.id = k.service_id join therapists t on t.id = k.therapist_id
                join rooms r on r.id = k.room_id where k.customer_id = c.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'received_at', p.received_at, 'kind', p.kind, 'amount_satang', p.amount_satang,
                  'method', m.code, 'verified', p.verified_at is not null, 'voided', p.voided_at is not null)
                  order by p.received_at)
                from payments p join payment_methods m on m.id = p.method_id
                join bookings k on k.id = p.booking_id where k.customer_id = c.id), '[]'::jsonb))
  into v_out from customers c where c.id = p_customer_id;
  if v_out is null then raise exception 'NOT_AUTHORIZED'; end if;
  return v_out;
end $$;

-- Irreversible. Removes the person, keeps the business record (bookings and payments stay, linked to an empty record).
-- Deleting the private notes is the one deliberate hard delete in the system.
create function anonymise_customer(p_customer_id uuid, p_reason text) returns customers
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

  update customers set display_name = 'Removed', full_name = null, phone = null, email = null, user_id = null,
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

-- Lists only. Nothing is anonymised automatically.
create function retention_candidates(p_as_of timestamptz default now())
  returns table (customer_id uuid, display_name text, last_activity timestamptz)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner');
  return query
  select c.id, c.display_name, la.at
  from customers c
  cross join lateral (
    select coalesce((select max(upper(k.service_during)) from bookings k where k.customer_id = c.id), c.created_at) as at) la
  where c.anonymised_at is null
    and la.at < p_as_of - make_interval(months => private.setting_int('retention.inactive_months'))
  order by la.at, c.id;
end $$;
