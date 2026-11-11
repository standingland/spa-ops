-- 0012_notifications: customer message outbox with retries
-- The row holds no phone number, email or name; the sender looks the contact up at send time.

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings,
  customer_id uuid not null references customers,
  template text not null check (template in ('booking_confirmed', 'booking_changed', 'booking_cancelled')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'failed', 'sent', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_outbox_due on notification_outbox (next_attempt_at) where status in ('pending', 'failed');

alter table notification_outbox enable row level security;
create policy notification_outbox_select on notification_outbox for select to authenticated
  using (private.current_role() in ('owner', 'manager'));

create function private.enqueue_notification() returns trigger
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
  if not v_c.comms_consent or (coalesce(trim(v_c.phone), '') = '' and coalesce(trim(v_c.email), '') = '') then
    return null;
  end if;

  insert into notification_outbox(booking_id, customer_id, template, payload, dedupe_key)
  values (v_b.id, v_c.id, v_template,
          jsonb_build_object('booking_id', v_b.id, 'starts_at', lower(v_b.service_during)),
          new.id::text)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger booking_events_enqueue after insert on booking_events
  for each row execute function private.enqueue_notification();

-- Picks due messages; the visibility timeout makes a message claimable again if the sender died.
create function claim_notifications(p_limit int) returns setof notification_outbox
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query
  with c as (
    select n.id from notification_outbox n
    where n.status in ('pending', 'failed') and n.next_attempt_at <= now()
    order by n.created_at, n.id
    limit p_limit
    for update skip locked
  )
  update notification_outbox n
  set attempts = n.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  from c where n.id = c.id
  returning n.*;
end $$;

create function complete_notification(p_id uuid, p_ok boolean, p_error text default null) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v notification_outbox;
begin
  select * into v from notification_outbox where id = p_id for update;
  if not found or v.status = 'sent' then return; end if;     -- a sent message is never touched again
  if p_ok then
    update notification_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  elsif v.attempts >= 5 then
    update notification_outbox set status = 'dead', last_error = p_error where id = p_id;
  else
    update notification_outbox set status = 'failed', last_error = p_error,
      next_attempt_at = now() + make_interval(mins => case v.attempts when 1 then 1 when 2 then 5 when 3 then 30 else 120 end)
    where id = p_id;
  end if;
end $$;

create function retry_notification(p_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.require_role('owner', 'manager');
  update notification_outbox set status = 'pending', attempts = 0, next_attempt_at = now()
  where id = p_id and status in ('failed', 'dead');
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

revoke execute on function claim_notifications(int) from public, anon, authenticated;
revoke execute on function complete_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function claim_notifications(int) to service_role;
grant execute on function complete_notification(uuid, boolean, text) to service_role;
