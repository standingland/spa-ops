-- Guest care. Public guest RPCs are server/service-role only; staff writes use checked RPCs.
alter function private.setting_spec() rename to setting_spec_before_guest_care;
create function private.setting_spec() returns table(key text,kind text,lo int,hi int,def jsonb)
language sql immutable set search_path = public, pg_temp as $$
  select * from private.setting_spec_before_guest_care()
  union all values
    ('care.reminders_enabled','bool',null,null,'false'::jsonb),
    ('care.reminder_first_min','int',1,10080,'1440'::jsonb),
    ('care.reminder_second_min','int',1,10080,'120'::jsonb),
    ('care.waitlist_enabled','bool',null,null,'false'::jsonb),
    ('care.offer_lifetime_min','int',5,60,'15'::jsonb)
$$;

create table customer_preferences (
  customer_id uuid primary key references customers,
  pressure text not null default '' check(pressure in ('','light','medium','firm')),
  oil text not null default '' check(length(oil)<=120),
  room text not null default '' check(length(room)<=200),
  notes text not null default '' check(length(notes)<=500),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
alter table customer_preferences enable row level security;
revoke all on customer_preferences from anon,authenticated;
grant select on customer_preferences to authenticated;
grant all on customer_preferences to service_role;
create policy desk_read on customer_preferences for select to authenticated
using(private.current_role() in ('owner','manager','receptionist'));

-- An API client cannot attach a customer's record to an arbitrary LINE account.
create or replace function private.guard_customer_anonymised() returns trigger language plpgsql as $$
begin
  if new.anonymised_at is distinct from old.anonymised_at and coalesce(current_setting('app.anonymising',true),'')<>'on' then raise exception 'NOT_AUTHORIZED'; end if;
  if (new.user_id is distinct from old.user_id or new.line_user_id is distinct from old.line_user_id) and current_user in ('authenticated','anon') then raise exception 'NOT_AUTHORIZED'; end if;
  if old.anonymised_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  return new;
end $$;

create function private.guard_line_identity_insert() returns trigger language plpgsql as $$
begin
  if new.line_user_id is not null and current_user in ('authenticated','anon') then raise exception 'NOT_AUTHORIZED'; end if;
  return new;
end $$;
create trigger customers_guard_line_identity before insert on customers for each row execute function private.guard_line_identity_insert();

create function save_customer_preferences(p_customer_id uuid,p_pressure text,p_oil text,p_room text,p_notes text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager','receptionist');
  perform 1 from customers where id=p_customer_id and anonymised_at is null for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if p_pressure is null or p_pressure not in ('','light','medium','firm') or p_oil is null or length(p_oil)>120
    or p_room is null or length(p_room)>200 or p_notes is null or length(p_notes)>500 then raise exception 'INVALID_INPUT'; end if;
  insert into customer_preferences(customer_id,pressure,oil,room,notes) values(p_customer_id,p_pressure,btrim(p_oil),btrim(p_room),btrim(p_notes))
  on conflict(customer_id) do update set pressure=excluded.pressure,oil=excluded.oil,room=excluded.room,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
  return p_customer_id;
end $$;
create function booking_preferences(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b bookings; r app_role:=private.current_role();
begin
  select * into b from bookings where id=p_booking_id;
  if b.id is null or r is null or (r='therapist' and not exists(select 1 from therapists where id=b.therapist_id and staff_user_id=auth.uid())) then raise exception 'NOT_AUTHORIZED'; end if;
  return coalesce((select jsonb_build_object('pressure',pressure,'oil',oil,'room',room,'notes',notes) from customer_preferences where customer_id=b.customer_id),'{}'::jsonb);
end $$;

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers,
  therapist_id uuid not null references therapists, service_id uuid not null references services,
  starts_window tstzrange not null check(not isempty(starts_window) and lower(starts_window) is not null and upper(starts_window) is not null
    and upper(starts_window)-lower(starts_window)<=interval '1 day'),
  status text not null default 'waiting' check(status in ('waiting','offered','accepted','expired','cancelled')),
  offered_start timestamptz, position_id uuid references room_positions, offer_expires_at timestamptz,
  offer_count int not null default 0,
  booking_id uuid references bookings, created_at timestamptz not null default now(),
  check(status<>'offered' or (offered_start is not null and position_id is not null and offer_expires_at is not null)),
  unique(customer_id,therapist_id,service_id,starts_window)
);
create index waitlist_queue on waitlist_entries(created_at,id) where status='waiting';
create index waitlist_holds on waitlist_entries(therapist_id,offer_expires_at) where status='offered';
create index waitlist_customer on waitlist_entries(customer_id,created_at);
alter table waitlist_entries enable row level security;
revoke all on waitlist_entries from anon,authenticated;
grant select on waitlist_entries to authenticated;
grant all on waitlist_entries to service_role;
create policy desk_read on waitlist_entries for select to authenticated using(private.current_role() in ('owner','manager','receptionist'));

-- Filter live offers from both staff and public availability. The original resource rules stay authoritative.
alter function private.available_candidates_core(uuid,timestamptz,uuid) rename to available_candidates_before_waitlist;
create function private.available_candidates_core(p_service_id uuid,p_start timestamptz,p_exclude_booking uuid default null)
returns table(therapist_id uuid,position_id uuid,room_id uuid,therapist_minutes_today int,room_sort int)
language sql stable set search_path = public, pg_temp as $$
  select c.* from private.available_candidates_before_waitlist(p_service_id,p_start,p_exclude_booking) c
  join services s on s.id=p_service_id join rooms r on r.id=c.room_id
  where not exists(select 1 from waitlist_entries w join services ws on ws.id=w.service_id join room_positions wp on wp.id=w.position_id join rooms wr on wr.id=wp.room_id
    where w.status='offered' and w.offer_expires_at>now() and private.setting_bool('care.waitlist_enabled') and private.setting_bool('online.enabled') and (
      (w.therapist_id=c.therapist_id and tstzrange(w.offered_start,w.offered_start+make_interval(mins=>ws.duration_min),'[)') && tstzrange(p_start,p_start+make_interval(mins=>s.duration_min),'[)'))
      or (wp.room_id=c.room_id and tstzrange(w.offered_start,w.offered_start+make_interval(mins=>ws.duration_min+wr.turnover_min),'[)') && tstzrange(p_start,p_start+make_interval(mins=>s.duration_min+r.turnover_min),'[)'))))
$$;
alter function private.check_slot(uuid,uuid,uuid,timestamptz,uuid) rename to check_slot_before_waitlist;
create function private.check_slot(p_service_id uuid,p_therapist_id uuid,p_position_id uuid,p_start timestamptz,p_exclude_booking uuid default null,
  out o_room_id uuid,out o_service_during tstzrange,out o_room_during tstzrange,out o_price int)
language plpgsql set search_path = public, pg_temp as $$
begin
  select * into o_room_id,o_service_during,o_room_during,o_price from private.check_slot_before_waitlist(p_service_id,p_therapist_id,p_position_id,p_start,p_exclude_booking);
  if exists(select 1 from waitlist_entries w join services s on s.id=w.service_id join room_positions p on p.id=w.position_id join rooms r on r.id=p.room_id
    where w.status='offered' and w.offer_expires_at>now() and private.setting_bool('care.waitlist_enabled') and private.setting_bool('online.enabled') and (
      (w.therapist_id=p_therapist_id and tstzrange(w.offered_start,w.offered_start+make_interval(mins=>s.duration_min),'[)') && o_service_during)
      or (p.room_id=o_room_id and tstzrange(w.offered_start,w.offered_start+make_interval(mins=>s.duration_min+r.turnover_min),'[)') && o_room_during))) then raise exception 'SLOT_HELD'; end if;
end $$;

create function public_join_waitlist(p_line_user_id text,p_line_name text,p_therapist_id uuid,p_service_id uuid,p_from timestamptz,p_to timestamptz,p_notify_consent boolean) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cust uuid; result uuid;
begin
  if coalesce(btrim(p_line_user_id),'')='' then raise exception 'NOT_AUTHORIZED'; end if;
  if p_notify_consent is distinct from true then raise exception 'INVALID_INPUT'; end if;
  if not private.setting_bool('online.enabled') or not private.setting_bool('care.waitlist_enabled')
    or not exists(select 1 from public_therapist_services(p_therapist_id) where service_id=p_service_id) then raise exception 'ONLINE_CLOSED'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>interval '23 hours 30 minutes'
    or (p_from at time zone 'Asia/Bangkok')::date<>(p_to at time zone 'Asia/Bangkok')::date
    or p_from<now()+make_interval(mins=>private.setting_int('online.min_lead_min'))
    or p_to>now()+make_interval(days=>private.setting_int('online.max_ahead_days'))
    or extract(second from p_from)<>0 or extract(second from p_to)<>0
    or extract(minute from p_from)::int%30<>0 or extract(minute from p_to)::int%30<>0 then raise exception 'OUT_OF_WINDOW'; end if;
  perform pg_advisory_xact_lock(hashtextextended('line:'||p_line_user_id,0));
  insert into customers(display_name,line_user_id,comms_consent,consent_recorded_at) values(coalesce(nullif(btrim(p_line_name),''),'LINE guest'),p_line_user_id,true,now()) on conflict(line_user_id) do nothing;
  select id into cust from customers where line_user_id=p_line_user_id and anonymised_at is null;
  update customers set comms_consent=true,consent_recorded_at=now() where id=cust and not comms_consent;
  select id into result from waitlist_entries where customer_id=cust and therapist_id=p_therapist_id and service_id=p_service_id and starts_window=tstzrange(p_from,p_to+interval '1 second','[)');
  if found and exists(select 1 from waitlist_entries where id=result and status in ('waiting','offered','accepted')) then return result; end if;
  if (select count(*) from waitlist_entries where customer_id=cust and status in ('waiting','offered'))>=5 then raise exception 'WAITLIST_LIMIT'; end if;
  insert into waitlist_entries(customer_id,therapist_id,service_id,starts_window) values(cust,p_therapist_id,p_service_id,tstzrange(p_from,p_to+interval '1 second','[)'))
  on conflict(customer_id,therapist_id,service_id,starts_window) do update set status='waiting',created_at=now(),offered_start=null,position_id=null,offer_expires_at=null,booking_id=null returning id into result;
  return result;
end $$;

-- Notification rows may refer to an offer before there is a booking.
alter table notification_outbox alter column booking_id drop not null;
alter table notification_outbox add column waitlist_id uuid references waitlist_entries;
alter table notification_outbox drop constraint notification_outbox_template_check;
alter table notification_outbox add constraint notification_outbox_template_check check(template in ('booking_confirmed','booking_changed','booking_cancelled','booking_reminder','waitlist_offer'));
alter table notification_outbox add constraint notification_reference check((template='waitlist_offer' and waitlist_id is not null) or (template<>'waitlist_offer' and booking_id is not null));

create function process_guest_care(p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w waitlist_entries; slot record; candidate record; offers int:=0; reminders int:=0;
begin
  -- Multiple scheduler invocations cannot generate competing offers.
  if not pg_try_advisory_xact_lock(hashtextextended('guest-care-dispatch',0)) then return jsonb_build_object('offers',0,'reminders',0); end if;
  update waitlist_entries set status='expired' where (status='offered' and offer_expires_at<=now()) or (status='waiting' and upper(starts_window)<=now()+make_interval(mins=>private.setting_int('online.min_lead_min')));
  if private.setting_bool('care.waitlist_enabled') and private.setting_bool('online.enabled') then
    for w in select e.* from waitlist_entries e join customers c on c.id=e.customer_id
      where e.status='waiting' and c.anonymised_at is null and c.comms_consent and c.line_user_id is not null
      and exists(select 1 from public_therapist_services(e.therapist_id) where service_id=e.service_id)
      and exists(select 1 from public_free_times(e.therapist_id,e.service_id,(lower(e.starts_window) at time zone 'Asia/Bangkok')::date) f where e.starts_window @> f.starts_at)
      and (select count(*) from bookings b where b.customer_id=e.customer_id and b.source='online' and b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.service_during)>now())<private.setting_int('online.max_upcoming')
      order by e.created_at,e.id limit greatest(1,least(p_limit,200)) for update of e skip locked loop
      if exists(select 1 from waitlist_entries held where held.customer_id=w.customer_id and held.status='offered' and held.offer_expires_at>now()) then continue; end if;
      for slot in select f.starts_at from public_free_times(w.therapist_id,w.service_id,(lower(w.starts_window) at time zone 'Asia/Bangkok')::date) f where w.starts_window @> f.starts_at loop
        select * into candidate from private.available_candidates_core(w.service_id,slot.starts_at) where therapist_id=w.therapist_id order by room_sort,position_id limit 1;
        if not found then continue; end if;
        perform private.lock_resource(least(w.therapist_id,candidate.room_id));
        perform private.lock_resource(greatest(w.therapist_id,candidate.room_id));
        if not exists(select 1 from private.available_candidates_core(w.service_id,slot.starts_at) where therapist_id=w.therapist_id and position_id=candidate.position_id) then continue; end if;
        update waitlist_entries set status='offered',offered_start=slot.starts_at,position_id=candidate.position_id,offer_count=offer_count+1,
          offer_expires_at=least(now()+make_interval(mins=>private.setting_int('care.offer_lifetime_min')),slot.starts_at-make_interval(mins=>private.setting_int('online.min_lead_min'))) where id=w.id;
        insert into notification_outbox(customer_id,waitlist_id,template,payload,dedupe_key)
        values(w.customer_id,w.id,'waitlist_offer',jsonb_build_object('waitlist_id',w.id,'starts_at',slot.starts_at,'offer_count',w.offer_count+1),'waitlist:'||w.id||':'||(w.offer_count+1)) on conflict do nothing;
        offers:=offers+1; exit;
      end loop;
    end loop;
  end if;
  if private.setting_bool('care.reminders_enabled') then
    insert into notification_outbox(booking_id,customer_id,template,payload,dedupe_key)
    select b.id,b.customer_id,'booking_reminder',jsonb_build_object('booking_id',b.id,'starts_at',lower(b.service_during),'lead_min',leads.m),
      'reminder:'||b.id||':'||extract(epoch from lower(b.service_during))||':'||leads.m
    from bookings b join customers c on c.id=b.customer_id
    cross join (select distinct private.setting_int(k) m from unnest(array['care.reminder_first_min','care.reminder_second_min']) k) leads
    where b.status='confirmed' and c.comms_consent and c.anonymised_at is null and c.line_user_id is not null
      and lower(b.service_during)>now() and lower(b.service_during)-make_interval(mins=>leads.m)<=now()
      and lower(b.service_during)-make_interval(mins=>leads.m)>now()-interval '15 minutes'
      and not exists(select 1 from unnest(array[private.setting_int('care.reminder_first_min'),private.setting_int('care.reminder_second_min')]) smaller(m)
        where smaller.m<leads.m and lower(b.service_during)-make_interval(mins=>smaller.m)<=now())
    on conflict(dedupe_key) do nothing;
    get diagnostics reminders=row_count;
  end if;
  return jsonb_build_object('offers',offers,'reminders',reminders);
end $$;

-- Revalidate optional notifications before every attempt, including manual retries.
create or replace function claim_notifications(p_limit int) returns setof notification_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update notification_outbox n set status='dead',last_error='STALE_GUEST_CARE'
  where n.status in ('pending','failed') and n.template in ('booking_reminder','waitlist_offer') and (
    not exists(select 1 from customers c where c.id=n.customer_id and c.comms_consent and c.anonymised_at is null and c.line_user_id is not null)
    or (n.template='booking_reminder' and (not private.setting_bool('care.reminders_enabled') or not exists(select 1 from bookings b where b.id=n.booking_id and b.status='confirmed' and lower(b.service_during)>now() and lower(b.service_during)=(n.payload->>'starts_at')::timestamptz)))
    or (n.template='waitlist_offer' and (not private.setting_bool('online.enabled') or not private.setting_bool('care.waitlist_enabled') or not exists(select 1 from waitlist_entries w where w.id=n.waitlist_id and w.status='offered' and w.offer_expires_at>now() and w.offer_count=(n.payload->>'offer_count')::int))));
  return query with c as (
    select n.id from notification_outbox n where n.status in ('pending','failed') and n.next_attempt_at<=now()
    order by n.created_at,n.id limit greatest(1,least(p_limit,200)) for update skip locked
  ) update notification_outbox n set attempts=n.attempts+1,next_attempt_at=now()+interval '5 minutes' from c where n.id=c.id returning n.*;
end $$;

create function guest_notification_valid(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n notification_outbox;
begin
  select * into n from notification_outbox where id=p_id;
  if not found then return false; end if;
  if n.template not in ('booking_reminder','waitlist_offer') then return true; end if;
  if not exists(select 1 from customers c where c.id=n.customer_id and c.comms_consent and c.anonymised_at is null and c.line_user_id is not null) then return false; end if;
  if n.template='booking_reminder' then
    return private.setting_bool('care.reminders_enabled') and exists(select 1 from bookings b where b.id=n.booking_id and b.status='confirmed' and lower(b.service_during)>now() and lower(b.service_during)=(n.payload->>'starts_at')::timestamptz);
  end if;
  return private.setting_bool('online.enabled') and private.setting_bool('care.waitlist_enabled') and exists(select 1 from waitlist_entries w where w.id=n.waitlist_id and w.status='offered' and w.offer_expires_at>now() and w.offer_count=(n.payload->>'offer_count')::int);
end $$;
revoke all on function guest_notification_valid(uuid) from public,anon,authenticated;
grant execute on function guest_notification_valid(uuid) to service_role;

create function public_my_appointments(p_line_user_id text,p_page int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cust uuid; result jsonb;
begin
  if coalesce(btrim(p_line_user_id),'')='' then raise exception 'NOT_AUTHORIZED'; end if;
  select id into cust from customers where line_user_id=p_line_user_id and anonymised_at is null;
  with rows as (select b.id,b.source,b.status,lower(b.service_during) starts_at,upper(b.service_during) ends_at,b.therapist_id,b.service_id,
    t.display_name therapist_name,s.name_th service_name_th,s.name_en service_name_en,
    b.status in ('requested','confirmed','checked_in','in_treatment') and upper(b.service_during)>now() upcoming,
    t.public and t.active and s.active and s.bookable_online repeatable
    from bookings b join therapists t on t.id=b.therapist_id join services s on s.id=b.service_id where b.customer_id=cust)
  select jsonb_build_object('upcoming',coalesce((select jsonb_agg(x order by x.starts_at) from (select * from rows where upcoming) x),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(x order by x.starts_at desc,x.id) from (select * from rows where not upcoming order by starts_at desc,id limit 20 offset greatest(0,least(coalesce(p_page,0),100000))*20) x),'[]'::jsonb),
    'history_count',(select count(*) from rows where not upcoming),
    'waitlist',coalesce((select jsonb_agg(x order by x.created_at desc) from (select w.id,w.status,lower(w.starts_window) window_from,upper(w.starts_window)-interval '1 second' window_to,
      w.offered_start,w.offer_expires_at,w.created_at,t.display_name therapist_name,s.name_th service_name_th,s.name_en service_name_en
      from waitlist_entries w join therapists t on t.id=w.therapist_id join services s on s.id=w.service_id where w.customer_id=cust and w.status in ('waiting','offered') order by w.created_at desc limit 20) x),'[]'::jsonb)) into result;
  return result;
end $$;

create function public_cancel_waitlist(p_line_user_id text,p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update waitlist_entries w set status='cancelled' from customers c where w.id=p_id and w.customer_id=c.id and c.line_user_id=p_line_user_id and c.anonymised_at is null and w.status in ('waiting','offered');
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
end $$;
create function cancel_waitlist(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager','receptionist');
  update waitlist_entries set status='cancelled' where id=p_id and status in ('waiting','offered');
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;
create function public_accept_waitlist(p_line_user_id text,p_line_name text,p_id uuid) returns table(booking_id uuid,starts_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare w waitlist_entries; result record;
begin
  perform pg_advisory_xact_lock(hashtextextended('line:'||p_line_user_id,0));
  select e.* into w from waitlist_entries e join customers c on c.id=e.customer_id where e.id=p_id and c.line_user_id=p_line_user_id and c.anonymised_at is null for update of e;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if w.status='accepted' then return query select b.id,lower(b.service_during) from bookings b where b.id=w.booking_id; return; end if;
  if w.status<>'offered' or w.offer_expires_at<=now() or not private.setting_bool('care.waitlist_enabled') then raise exception 'OFFER_EXPIRED'; end if;
  update waitlist_entries set status='accepted' where id=w.id;
  select * into result from public_book(p_line_user_id,p_line_name,w.therapist_id,w.service_id,w.offered_start,'waitlist:'||w.id);
  update waitlist_entries set booking_id=result.booking_id where id=w.id;
  return query select result.booking_id,result.starts_at;
end $$;

-- Preferences are erased by the existing anonymisation workflow, in the same transaction.
create function private.clear_guest_care() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.anonymised_at is not null and old.anonymised_at is null then
    delete from customer_preferences where customer_id=new.id;
    update waitlist_entries set status='cancelled' where customer_id=new.id and status in ('waiting','offered');
  end if;
  return null;
end $$;
create trigger customers_clear_care after update on customers for each row execute function private.clear_guest_care();
alter function export_customer(uuid) rename to export_customer_before_guest_care;
revoke all on function export_customer_before_guest_care(uuid) from public,anon,authenticated;
create function export_customer(p_customer_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager');
  return export_customer_before_guest_care(p_customer_id)||jsonb_build_object('preferences',coalesce((select to_jsonb(p)-'updated_by' from customer_preferences p where customer_id=p_customer_id),'{}'::jsonb),
    'waitlist',coalesce((select jsonb_agg(to_jsonb(w)) from waitlist_entries w where customer_id=p_customer_id),'[]'::jsonb));
end $$;

-- Commission snapshots, delta adjustments and per-therapist payout acknowledgements.
create table commission_batches (
  id uuid primary key default gen_random_uuid(),from_day date not null,to_day date not null,
  approved_at timestamptz not null default now(),approved_by uuid not null default auth.uid(),
  request_key uuid not null unique,check(to_day>=from_day and to_day-from_day<=366)
);
create table commission_batch_items (
  id uuid primary key default gen_random_uuid(),batch_id uuid not null references commission_batches,
  commission_id uuid not null references booking_commissions,therapist_id uuid not null references therapists,
  amount_satang bigint not null,target_satang bigint not null,unique(batch_id,commission_id)
);
create index commission_items_accrual on commission_batch_items(commission_id);
create table commission_payouts (
  id uuid primary key default gen_random_uuid(),batch_id uuid not null references commission_batches,
  therapist_id uuid not null references therapists,amount_satang bigint not null,
  paid_at timestamptz not null default now(),paid_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),
  reference text not null check(length(btrim(reference)) between 1 and 200),unique(batch_id,therapist_id)
);
do $$ declare tbl text; begin
  foreach tbl in array array['commission_batches','commission_batch_items','commission_payouts'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('revoke all on %I from anon,authenticated',tbl);
    execute format('grant select on %I to authenticated',tbl);
    execute format('grant all on %I to service_role',tbl);
    execute format('create policy management_read on %I for select to authenticated using(private.current_role() in (''owner'',''manager''))',tbl);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function private.audit()',tbl||'_audit',tbl);
  end loop;
end $$;

create function private.commission_deltas(p_from date,p_to date) returns table(commission_id uuid,therapist_id uuid,target_satang bigint,amount_satang bigint)
language sql stable set search_path = public, pg_temp as $$
  with base as (select c.*,b.price_satang-b.discount_satang gross,
    coalesce((select sum(p.amount_satang) from payments p where p.booking_id=b.id and p.kind='refund' and p.voided_at is null),0) refunds,
    coalesce((select sum(i.amount_satang) from commission_batch_items i where i.commission_id=c.id),0) settled
    from booking_commissions c join bookings b on b.id=c.booking_id
    where c.completed_at >= (p_from::timestamp at time zone 'Asia/Bangkok') and c.completed_at<((p_to+1)::timestamp at time zone 'Asia/Bangkok')),
  calc as (select *,round(case when mode='percent' then greatest(0,gross-refunds)*rate_bps/10000.0
    when gross>0 then fixed_satang*greatest(0,gross-refunds)/gross::numeric else 0 end)::bigint target from base)
  select id,therapist_id,target,(target-settled)::bigint from calc where target<>settled
$$;
create function commission_settlement_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform private.require_role('owner','manager');
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'INVALID_INPUT'; end if;
  with deltas as (select * from private.commission_deltas(p_from,p_to))
  select jsonb_build_object('revision',md5(coalesce((select jsonb_agg(d order by commission_id)::text from deltas d),'[]')),
    'count',(select count(*) from deltas),'total_satang',coalesce((select sum(amount_satang) from deltas),0),
    'summary',coalesce((select jsonb_agg(x order by therapist_name) from (select d.therapist_id,t.display_name therapist_name,sum(d.amount_satang)::bigint amount_satang,count(*)::int treatments from deltas d join therapists t on t.id=d.therapist_id group by d.therapist_id,t.display_name) x),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(x order by approved_at desc,id) from (select b.*,coalesce((select jsonb_agg(z order by z.therapist_name) from (select i.therapist_id,t.display_name therapist_name,sum(i.amount_satang)::bigint amount_satang,p.paid_at,p.reference from commission_batch_items i join therapists t on t.id=i.therapist_id left join commission_payouts p on p.batch_id=i.batch_id and p.therapist_id=i.therapist_id where i.batch_id=b.id group by i.therapist_id,t.display_name,p.paid_at,p.reference) z),'[]'::jsonb) therapists
    from commission_batches b where b.from_day<=p_to and b.to_day>=p_from order by b.approved_at desc,b.id limit 50) x),'[]'::jsonb)) into result;
  return result;
end $$;
create function close_commission_period(p_from date,p_to date,p_revision text,p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare report jsonb; result uuid;
begin
  perform private.require_role('owner','manager');
  perform pg_advisory_xact_lock(hashtextextended('commission-settlement',0));
  select id into result from commission_batches where request_key=p_key;
  if found then return result; end if;
  if p_key is null or p_to>(now() at time zone 'Asia/Bangkok')::date then raise exception 'INVALID_INPUT'; end if;
  -- A refund, completion or discount cannot change the approved calculation halfway through closing.
  lock table bookings,payments,booking_commissions in share mode;
  report:=commission_settlement_report(p_from,p_to);
  if p_revision is distinct from report->>'revision' then raise exception 'STALE_VERSION'; end if;
  if (report->>'count')::int=0 then raise exception 'NOTHING_TO_SETTLE'; end if;
  insert into commission_batches(from_day,to_day,request_key) values(p_from,p_to,p_key) returning id into result;
  insert into commission_batch_items(batch_id,commission_id,therapist_id,target_satang,amount_satang)
    select result,commission_id,therapist_id,target_satang,amount_satang from private.commission_deltas(p_from,p_to);
  return result;
end $$;
create function record_commission_payout(p_batch_id uuid,p_therapist_id uuid,p_reference text,p_paid_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare result uuid; amount bigint;
begin
  perform private.require_role('owner','manager');
  if p_reference is null or length(btrim(p_reference)) not between 1 and 200 then raise exception 'REASON_REQUIRED'; end if;
  if p_paid_at is null or p_paid_at>now()+interval '1 minute' then raise exception 'INVALID_INPUT'; end if;
  perform 1 from commission_batches where id=p_batch_id for update;
  if not found then raise exception 'INVALID_INPUT'; end if;
  select id into result from commission_payouts where batch_id=p_batch_id and therapist_id=p_therapist_id;
  if found then return result; end if;
  select sum(amount_satang) into amount from commission_batch_items where batch_id=p_batch_id and therapist_id=p_therapist_id;
  if amount is null then raise exception 'INVALID_INPUT'; end if;
  insert into commission_payouts(batch_id,therapist_id,amount_satang,reference,paid_at) values(p_batch_id,p_therapist_id,amount,btrim(p_reference),p_paid_at) returning id into result;
  return result;
end $$;

-- Explicit privileges, including helpers introduced after earlier hardening migrations.
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('save_customer_preferences','booking_preferences','public_join_waitlist','process_guest_care','public_my_appointments','public_cancel_waitlist','cancel_waitlist','public_accept_waitlist','export_customer','commission_settlement_report','close_commission_period','record_commission_payout'))
      or (n.nspname='private' and p.proname in ('setting_spec','setting_spec_before_guest_care','available_candidates_core','available_candidates_before_waitlist','check_slot','check_slot_before_waitlist','commission_deltas')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    if f.nspname='public' then
      execute format('grant execute on function %s to service_role',f.sig);
      if f.proname not like 'public_%' and f.proname<>'process_guest_care' then execute format('grant execute on function %s to authenticated',f.sig); end if;
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
