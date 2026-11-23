-- Staff daily notes: owner-posted sticky-note updates and alerts visible to all active staff on the daily view.
create table public.staff_daily_notes (
  id uuid primary key default gen_random_uuid(),
  day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  body text not null check (length(btrim(body)) between 1 and 400),
  tone text not null default 'note' check (tone in ('note', 'alert', 'reminder')),
  author_name text not null check (length(btrim(author_name)) between 1 and 120),
  created_by uuid not null default auth.uid() references public.staff(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index staff_daily_notes_active_idx
  on public.staff_daily_notes (day desc, created_at desc, id)
  where archived_at is null;

alter table public.staff_daily_notes enable row level security;
revoke all on public.staff_daily_notes from public, anon, authenticated;
grant select on public.staff_daily_notes to authenticated;
grant insert (day, body, tone, author_name), update (archived_at), delete on public.staff_daily_notes to authenticated;

create policy staff_daily_notes_read on public.staff_daily_notes for select to authenticated
  using ((select private.current_role()) is not null);

create policy staff_daily_notes_insert on public.staff_daily_notes for insert to authenticated
  with check (
    (select private.current_role()) = 'owner'
    and created_by = (select auth.uid())
  );

create policy staff_daily_notes_update on public.staff_daily_notes for update to authenticated
  using ((select private.current_role()) = 'owner')
  with check ((select private.current_role()) = 'owner');

create policy staff_daily_notes_delete on public.staff_daily_notes for delete to authenticated
  using ((select private.current_role()) = 'owner');

create trigger staff_daily_notes_audit after insert or update or delete on public.staff_daily_notes
  for each row execute function private.audit();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_daily_notes'
     ) then
    alter publication supabase_realtime add table public.staff_daily_notes;
  end if;
end $$;
