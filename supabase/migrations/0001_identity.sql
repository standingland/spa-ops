-- 0001_identity: extensions, enums, staff, role helpers, audit log
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type app_role as enum ('owner', 'manager', 'receptionist', 'therapist');

create table staff (
  user_id uuid primary key references auth.users on delete cascade,
  role app_role not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The caller's role if they are an active staff member, otherwise null.
create function private.current_role() returns app_role
  language sql stable security definer set search_path = ''
as $$
  select s.role from public.staff s where s.user_id = auth.uid() and s.active
$$;

create function private.require_role(variadic allowed app_role[]) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(private.current_role() = any (allowed), false) is not true then
    raise exception 'NOT_AUTHORIZED';
  end if;
end $$;

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old jsonb,
  new jsonb
);

create function private.audit() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  j jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log(actor, table_name, row_id, action, old, new)
  values (
    auth.uid(), tg_table_name,
    coalesce(j ->> 'id', j ->> 'user_id')::uuid,
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

create trigger staff_audit after insert or update or delete on staff
  for each row execute function private.audit();

alter table staff enable row level security;
create policy staff_select on staff for select to authenticated
  using (user_id = auth.uid() or private.current_role() in ('owner', 'manager'));
create policy staff_insert on staff for insert to authenticated
  with check (private.current_role() = 'owner');
create policy staff_update on staff for update to authenticated
  using (private.current_role() = 'owner') with check (private.current_role() = 'owner');

alter table audit_log enable row level security;
create policy audit_select on audit_log for select to authenticated
  using (private.current_role() in ('owner', 'manager'));
