-- 0003_therapists: therapists, skills, shifts, time off
create type time_off_kind as enum ('break', 'leave', 'absence');

create table therapists (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid unique references staff,
  display_name text not null,
  employment_type text not null check (employment_type in ('employee', 'freelance')),
  active boolean not null default true,
  sort_order int not null default 0
);

create table therapist_services (
  therapist_id uuid not null references therapists,
  service_id uuid not null references services,
  primary key (therapist_id, service_id)
);

-- Concrete dated shifts; a shift may cross midnight.
create table therapist_shifts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapists,
  during tstzrange not null check (not isempty(during)),
  constraint therapist_shifts_no_overlap exclude using gist (therapist_id with =, during with &&)
);

create table therapist_time_off (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapists,
  during tstzrange not null check (not isempty(during)),
  kind time_off_kind not null,
  note text
);

do $$
declare t text;
begin
  foreach t in array array['therapists','therapist_services','therapist_shifts','therapist_time_off'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select to authenticated using (private.current_role() is not null)$p$, t || '_select', t);
    execute format($p$create policy %I on %I for insert to authenticated with check (private.current_role() in ('owner','manager'))$p$, t || '_insert', t);
    if t <> 'therapist_services' then
      execute format($p$create policy %I on %I for update to authenticated using (private.current_role() in ('owner','manager')) with check (private.current_role() in ('owner','manager'))$p$, t || '_update', t);
    end if;
    if t <> 'therapists' then
      execute format($p$create policy %I on %I for delete to authenticated using (private.current_role() in ('owner','manager'))$p$, t || '_delete', t);
    end if;
    execute format('create trigger %I after insert or update or delete on %I for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;
