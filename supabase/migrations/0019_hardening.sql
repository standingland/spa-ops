-- 0019_hardening: fixes proved necessary by tests/db/security-catalog.test.ts and security-outsiders.test.ts.

-- 1. Anonymous visitors, and nobody through the API, may write or truncate tables directly. Row-level security
--    already limited rows; this removes the privilege itself (TRUNCATE is not subject to row-level security).
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- 2. Data-changing helpers in schema private are for other functions (which run as their owner), never for callers.
do $$
declare f record;
begin
  for f in
    select o.oid::regprocedure as sig from pg_proc o join pg_namespace n on n.oid = o.pronamespace
    where n.nspname = 'private' and o.provolatile = 'v' and o.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = o.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 3. A deactivated staff member can read nothing, not even their own staff row (the app treats "no row" as signed out).
drop policy staff_select on staff;
create policy staff_select on staff for select to authenticated
  using ((user_id = auth.uid() and active) or private.current_role() in ('owner', 'manager'));

-- 4. Only the service role (or the owner of the database) may link a customer record to a login; anonymised_at
--    is still settable only by anonymise_customer(), and an emptied record cannot be refilled.
create or replace function private.guard_customer_anonymised() returns trigger
  language plpgsql
as $$
begin
  if new.anonymised_at is distinct from old.anonymised_at
     and coalesce(current_setting('app.anonymising', true), '') <> 'on' then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if new.user_id is distinct from old.user_id and current_user in ('authenticated', 'anon') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if old.anonymised_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  return new;
end $$;

-- 5. The one function an anonymous caller may run: a health check that touches no data.
create function health_ping() returns boolean
  language sql stable security definer set search_path = ''
as $$ select true $$;
grant execute on function health_ping() to anon, authenticated;
