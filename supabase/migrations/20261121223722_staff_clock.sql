-- The short-lived shop code and exact attendance times are private. Staff only
-- receive their own times and the status of people in the current shift.
create table private.staff_clock_codes (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null
);
create table private.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  in_attempt uuid not null,
  out_attempt uuid,
  check ((ended_at is null) = (out_attempt is null)),
  check (ended_at is null or ended_at >= started_at),
  unique (staff_user_id, in_attempt),
  unique (staff_user_id, out_attempt)
);
create unique index staff_attendance_open_idx on private.staff_attendance (staff_user_id) where ended_at is null;
create index staff_attendance_history_idx on private.staff_attendance (staff_user_id, started_at desc);

create function private.issue_staff_clock_code() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  code private.staff_clock_codes;
begin
  perform private.require_role('owner', 'manager');
  perform pg_advisory_xact_lock(hashtextextended('banyan.staff-clock.issue', 0));
  delete from private.staff_clock_codes where expires_at <= clock_timestamp();
  select * into code from private.staff_clock_codes where expires_at > clock_timestamp() + interval '90 seconds'
    order by expires_at desc limit 1;
  if not found then
    insert into private.staff_clock_codes (expires_at) values (clock_timestamp() + interval '3 minutes') returning * into code;
  end if;
  return jsonb_build_object('code', code.id, 'expires_at', code.expires_at);
end $$;

create function private.record_staff_clock(p_code uuid, p_action text, p_attempt uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  staff_id uuid := auth.uid();
  attendance_id uuid;
begin
  perform private.require_role('owner', 'manager', 'receptionist', 'therapist');
  if p_attempt is null or p_action is null or p_action not in ('in', 'out') then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(staff_id::text, 9197));

  -- A browser retry can arrive after a successful write or after code expiry.
  select id into attendance_id from private.staff_attendance where staff_user_id = staff_id
    and (case when p_action = 'in' then in_attempt else out_attempt end) = p_attempt;
  if found then return attendance_id; end if;
  if not exists (select 1 from private.staff_clock_codes where id = p_code and expires_at > clock_timestamp()) then
    raise exception 'CLOCK_CODE_EXPIRED';
  end if;

  select id into attendance_id from private.staff_attendance where staff_user_id = staff_id and ended_at is null;
  if p_action = 'in' and attendance_id is null then
    insert into private.staff_attendance (staff_user_id, in_attempt) values (staff_id, p_attempt) returning id into attendance_id;
  elsif p_action = 'out' and attendance_id is not null then
    update private.staff_attendance set ended_at = clock_timestamp(), out_attempt = p_attempt where id = attendance_id;
  else
    raise exception 'INVALID_TRANSITION';
  end if;
  return attendance_id;
end $$;

create function private.read_staff_clock() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  staff_id uuid := auth.uid();
  instant timestamptz := now();
  day_start timestamptz := date_trunc('day', instant at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  mine jsonb;
  coworkers jsonb;
begin
  perform private.require_role('owner', 'manager', 'receptionist', 'therapist');
  select jsonb_build_object('started_at', started_at, 'ended_at', ended_at) into mine
    from private.staff_attendance
    where staff_user_id = staff_id and (ended_at is null or ended_at >= day_start)
    order by started_at desc limit 1;

  with current_shifts as (
    select t.staff_user_id, lower(s.during) as started
    from public.therapist_shifts s join public.therapists t on t.id = s.therapist_id
    where t.active and s.during @> instant and not exists (
      select 1 from public.therapist_time_off o
      where o.therapist_id = t.id and o.kind <> 'break' and o.during @> instant
    )
    union all
    select s.staff_user_id, lower(s.during)
    from public.staff_requests s
    where s.status = 'approved' and s.kind = 'shift' and s.during @> instant
      and not exists (select 1 from public.therapists t where t.staff_user_id = s.staff_user_id and t.active)
      and not exists (
        select 1 from public.staff_requests sick where sick.staff_user_id = s.staff_user_id
          and sick.status = 'approved' and sick.kind = 'sick' and sick.during @> instant
      )
  ), scheduled as (
    select staff_user_id, min(started) as started from current_shifts group by staff_user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', s.user_id,
    'display_name', s.display_name,
    'role', s.role,
    'state', case when a.id is null then 'waiting' when a.ended_at is null then 'working' else 'finished' end
  ) order by s.display_name, s.user_id), '[]'::jsonb) into coworkers
  from public.staff s
  left join scheduled shift on shift.staff_user_id = s.user_id
  left join lateral (
    select a.id, a.ended_at from private.staff_attendance a
    where a.staff_user_id = s.user_id and (a.ended_at is null or a.ended_at >= shift.started)
    order by a.started_at desc limit 1
  ) a on true
  where s.active and s.user_id <> staff_id and (shift.started is not null or a.id is not null);

  return jsonb_build_object('attendance', mine, 'coworkers', coworkers);
end $$;

-- PostgREST sees invoker wrappers. The protected implementations enforce roles
-- even when called from another SQL function.
create function public.issue_staff_clock_code() returns jsonb
  language sql set search_path = '' as $$ select private.issue_staff_clock_code() $$;
create function public.record_staff_clock(p_code uuid, p_action text, p_attempt uuid) returns uuid
  language sql set search_path = '' as $$ select private.record_staff_clock(p_code, p_action, p_attempt) $$;
create function public.read_staff_clock() returns jsonb
  language sql stable set search_path = '' as $$ select private.read_staff_clock() $$;

revoke execute on function private.issue_staff_clock_code(), private.record_staff_clock(uuid, text, uuid), private.read_staff_clock()
  from public, anon, authenticated;
revoke execute on function public.issue_staff_clock_code(), public.record_staff_clock(uuid, text, uuid), public.read_staff_clock()
  from public, anon, authenticated;
grant execute on function private.issue_staff_clock_code(), private.record_staff_clock(uuid, text, uuid), private.read_staff_clock() to authenticated;
grant execute on function public.issue_staff_clock_code(), public.record_staff_clock(uuid, text, uuid), public.read_staff_clock() to authenticated;
