create table public.staff_daily_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.staff_daily_notes(id) on delete cascade,
  body text not null check (body ~ '[^[:space:]]' and char_length(body) <= 400),
  author_name text not null,
  created_by uuid not null default auth.uid() references public.staff(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index staff_daily_note_replies_thread_idx
  on public.staff_daily_note_replies (note_id, created_at, id);
create index staff_daily_note_replies_author_idx
  on public.staff_daily_note_replies (created_by);

alter table public.staff_daily_note_replies enable row level security;
revoke all on public.staff_daily_note_replies from public, anon, authenticated;
grant select on public.staff_daily_note_replies to authenticated;
grant insert (note_id, body) on public.staff_daily_note_replies to authenticated;

create policy staff_daily_note_replies_read on public.staff_daily_note_replies for select to authenticated
  using (
    (select private.current_role()) is not null
    and exists (
      select 1 from public.staff_daily_notes n
      where n.id = note_id and n.archived_at is null
    )
  );

create policy staff_daily_note_replies_insert on public.staff_daily_note_replies for insert to authenticated
  with check (
    (select private.current_role()) is not null
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.staff_daily_notes n
      where n.id = note_id and n.archived_at is null and n.day = (now() at time zone 'Asia/Bangkok')::date
    )
  );

create function private.set_daily_note_reply_author() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  select coalesce(nullif(btrim(s.display_name), ''), s.role::text)
    into new.author_name
    from public.staff s
    where s.user_id = new.created_by and s.active;
  return new;
end $$;

revoke all on function private.set_daily_note_reply_author() from public, anon, authenticated;

create trigger staff_daily_note_replies_author before insert on public.staff_daily_note_replies
  for each row execute function private.set_daily_note_reply_author();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.staff_daily_note_replies;
  end if;
end $$;
