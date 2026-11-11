-- 0013_settings: owner-editable operating rules. Every key, default and limit is defined once, in private.setting_spec().

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
-- No insert, update or delete policy: writes go through set_setting().
create policy app_settings_select on app_settings for select to authenticated
  using (private.current_role() is not null);
create trigger app_settings_audit after insert or update or delete on app_settings
  for each row execute function private.audit();

create function private.setting_spec()
  returns table (key text, kind text, lo int, hi int, def jsonb)
  language sql immutable
as $$
  values
    ('ops.arrival_window_min',       'int',    5,  240, '60'::jsonb),
    ('ops.late_arrival_min',         'int',    1,  120, '10'::jsonb),
    ('ops.ending_soon_min',          'int',    1,   60, '10'::jsonb),
    ('ops.room_prep_warn_min',       'int',    1,  120, '15'::jsonb),
    ('ops.reserved_lead_min',        'int',    0,  240, '30'::jsonb),
    ('policy.cancel_free_min',       'int',    0, 10080, '120'::jsonb),
    ('policy.cancel_fee_percent',    'int',    0,  100, '0'::jsonb),
    ('policy.no_show_fee_percent',   'int',    0,  100, '0'::jsonb),
    ('payments.receptionist_can_record', 'bool', null, null, 'true'::jsonb),
    ('reports.manager_can_view',     'bool',   null, null, 'true'::jsonb),
    ('retention.inactive_months',    'int',    6,  120, '24'::jsonb)
$$;

create function private.setting_value(p_key text) returns jsonb
  language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select s.value from app_settings s where s.key = p_key),
                  (select d.def from private.setting_spec() d where d.key = p_key))
$$;

create function private.setting_int(p_key text) returns int
  language sql stable security definer set search_path = public, pg_temp
as $$ select (private.setting_value(p_key))::text::int $$;

create function private.setting_bool(p_key text) returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $$ select (private.setting_value(p_key))::text::boolean $$;

create function get_settings() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if private.current_role() is null then raise exception 'NOT_AUTHORIZED'; end if;
  return (select jsonb_object_agg(d.key, private.setting_value(d.key)) from private.setting_spec() d);
end $$;

create function set_setting(p_key text, p_value jsonb) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_spec record;
begin
  perform private.require_role('owner');
  select * into v_spec from private.setting_spec() d where d.key = p_key;
  if not found or p_value is null then raise exception 'INVALID_SETTING'; end if;

  if v_spec.kind = 'int' then
    if jsonb_typeof(p_value) <> 'number' or p_value::text !~ '^-?[0-9]+$'
       or (p_value::text)::int not between v_spec.lo and v_spec.hi then
      raise exception 'INVALID_SETTING';
    end if;
  elsif jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'INVALID_SETTING';
  end if;

  insert into app_settings(key, value, updated_by, updated_at) values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return get_settings();
end $$;

grant execute on function get_settings(), set_setting(text, jsonb) to authenticated;

-- Room status: a null lead time now means the stored setting.
drop function room_status_board(timestamptz, int);
create function room_status_board(p_now timestamptz default now(), p_reserved_lead_min int default null)
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
  v_lead int := coalesce(p_reserved_lead_min, private.setting_int('ops.reserved_lead_min'));
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
           or (b.status in ('requested', 'confirmed') and lower(b.service_during) <= p_now + make_interval(mins => v_lead)))
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
grant execute on function room_status_board(timestamptz, int) to authenticated;
