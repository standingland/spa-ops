-- Closing handover: the front desk leaves a short end-of-shift summary that
-- the owner, managers and the next receptionist can read. Append-only.
create table public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  body text not null check (body ~ '[^[:space:]]' and char_length(body) <= 600),
  author_name text not null default '',
  created_by uuid not null default auth.uid() references public.staff(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index shift_handovers_recent_idx on public.shift_handovers (created_at desc, id);
create index shift_handovers_author_idx on public.shift_handovers (created_by);

alter table public.shift_handovers enable row level security;
revoke all on public.shift_handovers from public, anon, authenticated;
grant select on public.shift_handovers to authenticated;
grant insert (body) on public.shift_handovers to authenticated;

create policy shift_handovers_read on public.shift_handovers for select to authenticated
  using ((select private.current_role()) in ('owner', 'manager', 'receptionist'));

create policy shift_handovers_insert on public.shift_handovers for insert to authenticated
  with check (
    (select private.current_role()) in ('owner', 'manager', 'receptionist')
    and created_by = (select auth.uid())
  );

create function private.set_shift_handover_author() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  select coalesce(nullif(btrim(s.display_name), ''), s.role::text)
    into new.author_name
    from public.staff s
    where s.user_id = new.created_by and s.active;
  return new;
end $$;

revoke all on function private.set_shift_handover_author() from public, anon, authenticated;

create trigger shift_handovers_author before insert on public.shift_handovers
  for each row execute function private.set_shift_handover_author();

create trigger shift_handovers_audit after insert on public.shift_handovers
  for each row execute function private.audit();
