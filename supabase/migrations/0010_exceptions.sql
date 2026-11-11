-- 0010_exceptions: room reports, forced absence / room block, stranded bookings

create table room_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms,
  note text not null check (length(trim(note)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
alter table room_reports enable row level security;
create policy room_reports_select on room_reports for select to authenticated
  using (private.current_role() is not null);
create trigger room_reports_audit after insert or update or delete on room_reports
  for each row execute function private.audit();

create function report_room_issue(p_room_id uuid, p_note text) returns room_reports
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v room_reports;
begin
  perform private.require_role('owner', 'manager', 'receptionist', 'therapist');
  insert into room_reports(room_id, note) values (p_room_id, p_note) returning * into v;
  return v;
end $$;

create function resolve_room_report(p_id uuid) returns room_reports
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v room_reports;
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  select * into v from room_reports where id = p_id for update;
  if not found or v.resolved_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  update room_reports set resolved_at = now(), resolved_by = auth.uid() where id = p_id returning * into v;
  return v;
end $$;

-- The Plan 1 guards, with one deliberate exception: owner/manager inside record_absence / force_room_block.
create or replace function private.guard_room_block() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.allow_stranding', true), '') = 'on' and private.current_role() in ('owner', 'manager') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.room_id = new.room_id and old.during @> new.during then
    return new;
  end if;
  perform private.lock_resource(new.room_id);
  if exists (select 1 from bookings b where b.room_id = new.room_id
             and b.status in ('requested','confirmed','checked_in','in_treatment')
             and upper(b.room_during) > now() and b.room_during && new.during) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return new;
end $$;

create or replace function private.guard_time_off() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.allow_stranding', true), '') = 'on' and private.current_role() in ('owner', 'manager') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.therapist_id = new.therapist_id and old.during @> new.during then
    return new;
  end if;
  perform private.lock_resource(new.therapist_id);
  if exists (select 1 from bookings b where b.therapist_id = new.therapist_id
             and b.status in ('requested','confirmed','checked_in','in_treatment')
             and upper(b.service_during) > now() and b.service_during && new.during) then
    raise exception 'CONFLICTS_WITH_BOOKINGS';
  end if;
  return new;
end $$;

create function record_absence(p_therapist_id uuid, p_from timestamptz, p_to timestamptz, p_kind time_off_kind, p_note text default null)
  returns setof uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_range tstzrange := tstzrange(p_from, p_to, '[)');
begin
  perform private.require_role('owner', 'manager');
  perform private.lock_resource(p_therapist_id);
  perform set_config('app.allow_stranding', 'on', true);
  insert into therapist_time_off(therapist_id, during, kind, note) values (p_therapist_id, v_range, p_kind, p_note);
  perform set_config('app.allow_stranding', 'off', true);
  return query
    select b.id from bookings b
    where b.therapist_id = p_therapist_id and b.status in ('requested','confirmed','checked_in','in_treatment')
      and upper(b.service_during) > now() and b.service_during && v_range
    order by lower(b.service_during);
end $$;

create function force_room_block(p_room_id uuid, p_from timestamptz, p_to timestamptz, p_kind block_kind, p_note text default null)
  returns setof uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_range tstzrange := tstzrange(p_from, p_to, '[)');
begin
  perform private.require_role('owner', 'manager');
  perform private.lock_resource(p_room_id);
  perform set_config('app.allow_stranding', 'on', true);
  insert into room_blocks(room_id, during, kind, note) values (p_room_id, v_range, p_kind, p_note);
  perform set_config('app.allow_stranding', 'off', true);
  return query
    select b.id from bookings b
    where b.room_id = p_room_id and b.status in ('requested','confirmed','checked_in','in_treatment')
      and upper(b.room_during) > now() and b.room_during && v_range
    order by lower(b.service_during);
end $$;

create function stranded_bookings() returns table (booking_id uuid, reason text)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return query
  select b.id,
         case when exists (select 1 from therapist_time_off o where o.therapist_id = b.therapist_id and o.during && b.service_during)
              then 'therapist_time_off' else 'room_blocked' end
  from bookings b
  where b.status in ('requested', 'confirmed', 'checked_in')
    and upper(b.service_during) > now()
    and (exists (select 1 from therapist_time_off o where o.therapist_id = b.therapist_id and o.during && b.service_during)
         or exists (select 1 from room_blocks rb where rb.room_id = b.room_id and rb.during && b.room_during))
  order by lower(b.service_during), b.id;
end $$;
