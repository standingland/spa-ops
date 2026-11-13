-- 0027_public_rate_limit: a small fixed-window rate limiter for the public page, used from server code only.

create table public_rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index public_rate_hits_key_at on public_rate_hits (key, at);
alter table public_rate_hits enable row level security;   -- no policies: only the service role (which bypasses RLS) can touch it
revoke all on public_rate_hits from anon, authenticated;

-- True when the hit is allowed (and recorded); false when the key already has p_max hits inside the window.
create function public_rate_hit(p_key text, p_window_sec int, p_max int) returns boolean
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('rate:' || p_key, 0));
  delete from public_rate_hits where key = p_key and at < now() - make_interval(secs => p_window_sec);
  if random() < 0.02 then delete from public_rate_hits where at < now() - interval '1 day'; end if;
  select count(*) into v_count from public_rate_hits where key = p_key;
  if v_count >= p_max then return false; end if;
  insert into public_rate_hits(key) values (p_key);
  return true;
end $$;

revoke execute on function public_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public_rate_hit(text, int, int) to service_role;
