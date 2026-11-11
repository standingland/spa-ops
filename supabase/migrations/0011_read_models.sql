-- 0011_read_models: derived room status, extended booking board, day counts, realtime publication

create type room_status as enum ('available', 'reserved', 'occupied', 'cleaning', 'out_of_service');

create function room_status_board(p_now timestamptz default now(), p_reserved_lead_min int default 30)
  returns table (
    room_id uuid, status room_status, current_booking_id uuid, current_therapist_id uuid,
    current_customer_display_name text, expected_end timestamptz, next_booking_id uuid, next_starts_at timestamptz,
    turnover_started_at timestamptz, turnover_due_at timestamptz, block_kind block_kind, block_note text, open_reports int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role app_role := private.current_role();
  v_uid uuid := auth.uid();
begin
  if v_role is null then raise exception 'NOT_AUTHORIZED'; end if;

  return query
  with occ as (
    select distinct on (x.rid) x.rid, x.bid, x.tid, x.cid, x.exp_end
    from (
      select b.room_id as rid, b.id as bid, b.therapist_id as tid, b.customer_id as cid,
             coalesce(b.started_at, lower(b.service_during)) + (upper(b.service_during) - lower(b.service_during)) as exp_end
      from bookings b where b.status = 'in_treatment'
    ) x
    order by x.rid, x.exp_end desc
  ),
  nxt as (
    select distinct on (b.room_id) b.room_id as rid, b.id as bid, lower(b.service_during) as starts
    from bookings b
    where b.status in ('requested', 'confirmed', 'checked_in') and upper(b.service_during) > p_now
    order by b.room_id, lower(b.service_during), b.id
  ),
  resv as (
    select distinct b.room_id as rid
    from bookings b
    where upper(b.service_during) > p_now
      and (b.status = 'checked_in'
           or (b.status in ('requested', 'confirmed') and lower(b.service_during) <= p_now + make_interval(mins => p_reserved_lead_min)))
  ),
  blk as (
    select distinct on (rb.room_id) rb.room_id as rid, rb.kind as kind, rb.note as note
    from room_blocks rb where rb.during @> p_now
    order by rb.room_id, (rb.kind = 'cleaning'), rb.id
  ),
  trn as (
    select t.room_id as rid, t.started_at as started, t.due_at as due from room_turnovers t where t.ready_at is null
  ),
  rep as (
    select rr.room_id as rid, count(*)::int as n from room_reports rr where rr.resolved_at is null group by rr.room_id
  )
  select r.id,
    (case when occ.rid is not null then 'occupied'
          when blk.kind in ('maintenance', 'closed') then 'out_of_service'
          when trn.rid is not null or blk.kind = 'cleaning' then 'cleaning'
          when resv.rid is not null then 'reserved'
          else 'available' end)::room_status,
    occ.bid, occ.tid,
    case when occ.rid is null then null
         when v_role <> 'therapist' then c.display_name
         when exists (select 1 from therapists t where t.id = occ.tid and t.staff_user_id = v_uid) then c.display_name
         else null end,
    occ.exp_end, nxt.bid, nxt.starts, trn.started, trn.due, blk.kind,
    case when v_role = 'therapist' then null else blk.note end,
    coalesce(rep.n, 0)
  from rooms r
  left join occ on occ.rid = r.id
  left join customers c on c.id = occ.cid
  left join nxt on nxt.rid = r.id
  left join resv on resv.rid = r.id
  left join blk on blk.rid = r.id
  left join trn on trn.rid = r.id
  left join rep on rep.rid = r.id
  where r.active
  order by r.zone nulls last, r.sort_order, r.code;
end $$;

drop function booking_board(timestamptz, timestamptz);
create function booking_board(p_from timestamptz, p_to timestamptz)
  returns table (
    booking_id uuid, version int, status booking_status, source booking_source,
    starts_at timestamptz, ends_at timestamptz, room_free_at timestamptz,
    therapist_id uuid, room_id uuid, position_id uuid, party_id uuid,
    service_id uuid, customer_id uuid, customer_display_name text,
    checked_in_at timestamptz, started_at timestamptz, completed_at timestamptz, expected_end timestamptz)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role app_role := private.current_role();
begin
  if v_role is null or v_role not in ('owner', 'manager', 'receptionist', 'therapist') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select k.id, k.version, k.status, k.source,
         lower(k.service_during), upper(k.service_during), upper(k.room_during),
         k.therapist_id, k.room_id, k.position_id, k.party_id, k.service_id,
         case when v_role = 'therapist' then null else k.customer_id end,
         c.display_name,
         k.checked_in_at, k.started_at, k.completed_at,
         coalesce(k.started_at, lower(k.service_during)) + (upper(k.service_during) - lower(k.service_during))
  from bookings k
  join customers c on c.id = k.customer_id
  where k.service_during && tstzrange(p_from, p_to, '[)')
    and (v_role <> 'therapist' or exists (
          select 1 from therapists t where t.id = k.therapist_id and t.staff_user_id = auth.uid()))
  order by lower(k.service_during), k.id;
end $$;

create function booking_day_counts(p_from date, p_to date)
  returns table (day date, bookings int, booked_minutes int)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role app_role := private.current_role();
begin
  if v_role is null then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select (lower(k.service_during) at time zone 'Asia/Bangkok')::date,
         count(*)::int,
         sum(extract(epoch from upper(k.service_during) - lower(k.service_during)) / 60)::int
  from bookings k
  where k.status not in ('cancelled', 'no_show')
    and (lower(k.service_during) at time zone 'Asia/Bangkok')::date between p_from and p_to
    and (v_role <> 'therapist' or exists (
          select 1 from therapists t where t.id = k.therapist_id and t.staff_user_id = auth.uid()))
  group by 1
  order by 1;
end $$;

-- Realtime: events only trigger a refetch through role-checked server actions.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['bookings','room_turnovers','room_blocks','room_reports','therapist_time_off','therapist_shifts'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
