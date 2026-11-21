-- Staff submit their own requests. A management decision publishes any
-- corresponding therapist shift or absence in the same transaction.
create table public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null default auth.uid() references public.staff on delete cascade,
  kind text not null check (kind in ('sick', 'shift')),
  during tstzrange not null check (
    not isempty(during) and not lower_inf(during) and not upper_inf(during)
    and isfinite(lower(during)) and isfinite(upper(during))
    and lower_inc(during) and not upper_inc(during)
  ),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  affected_bookings integer not null default 0,
  exclude using gist (staff_user_id with =, kind with =, during with &&)
    where (status in ('pending', 'approved'))
);

create index staff_requests_history_idx on public.staff_requests (staff_user_id, created_at desc, id);
create index staff_requests_review_idx on public.staff_requests (kind desc, created_at, id) where status = 'pending';
alter table public.staff_requests enable row level security;
revoke all on public.staff_requests from public, anon, authenticated;
grant select on public.staff_requests to authenticated;
grant insert (kind, during), update (status) on public.staff_requests to authenticated;

create policy staff_requests_read on public.staff_requests for select to authenticated
  using (
    (select private.current_role()) is not null
    and (staff_user_id = (select auth.uid()) or (select private.current_role()) in ('owner', 'manager'))
  );

create policy staff_requests_submit on public.staff_requests for insert to authenticated
  with check (
    (select private.current_role()) is not null and staff_user_id = (select auth.uid()) and status = 'pending'
  );

create policy staff_requests_decide on public.staff_requests for update to authenticated
  using (
    status = 'pending' and (select private.current_role()) is not null
    and (staff_user_id = (select auth.uid()) or (select private.current_role()) in ('owner', 'manager'))
  )
  with check (
    (staff_user_id = (select auth.uid()) and status = 'withdrawn' and (select private.current_role()) is not null)
    or ((select private.current_role()) in ('owner', 'manager') and status in ('approved', 'rejected'))
  );

create function private.validate_staff_request() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  month_start timestamp := date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month';
  start_local timestamp := lower(new.during) at time zone 'Asia/Bangkok';
  end_local timestamp := upper(new.during) at time zone 'Asia/Bangkok';
begin
  if new.kind = 'shift' then
    if start_local < month_start or start_local >= month_start + interval '1 month' then
      raise exception 'OUT_OF_WINDOW';
    end if;
    if end_local - start_local >= interval '24 hours' then raise exception 'INVALID_INPUT'; end if;
  elsif start_local::time <> time '00:00' or end_local::time <> time '00:00' then
    raise exception 'INVALID_INPUT';
  end if;
  return new;
end $$;

create function private.apply_staff_request_decision() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  therapist_id_for_staff uuid;
  staff_role public.app_role;
begin
  if new.status = 'withdrawn' and old.staff_user_id = auth.uid() then
    perform private.require_role('owner', 'manager', 'receptionist', 'therapist');
  else
    perform private.require_role('owner', 'manager');
    if new.status not in ('approved', 'rejected') then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  if old.status <> 'pending' then raise exception 'INVALID_TRANSITION'; end if;

  new.reviewed_at := now();
  new.reviewed_by := auth.uid();
  if new.status <> 'approved' then return new; end if;

  select role into staff_role from public.staff where user_id = old.staff_user_id and active;
  if not found then raise exception 'RESOURCE_INACTIVE'; end if;
  select id into therapist_id_for_staff from public.therapists where staff_user_id = old.staff_user_id and active;
  if therapist_id_for_staff is null then
    if staff_role = 'therapist' then raise exception 'THERAPIST_NOT_LINKED'; end if;
    return new;
  end if;

  if old.kind = 'sick' then
    -- Do not include health information in the operational time-off note.
    select count(*) into new.affected_bookings
      from public.record_absence(therapist_id_for_staff, lower(old.during), upper(old.during), 'absence', null);
  elsif not exists (
    select 1 from public.therapist_shifts where therapist_id = therapist_id_for_staff and during = old.during
  ) then
    insert into public.therapist_shifts (therapist_id, during) values (therapist_id_for_staff, old.during);
  end if;
  return new;
end $$;

revoke execute on function private.validate_staff_request(), private.apply_staff_request_decision() from public, anon, authenticated;
create trigger staff_requests_validate before insert on public.staff_requests
  for each row execute function private.validate_staff_request();
create trigger staff_requests_publish before update on public.staff_requests
  for each row execute function private.apply_staff_request_decision();
create trigger staff_requests_audit after insert or update or delete on public.staff_requests
  for each row execute function private.audit();
