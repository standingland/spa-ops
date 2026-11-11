-- 0002_catalog_rooms: services, room categories, rooms, positions, blocks
create type block_kind as enum ('maintenance', 'cleaning', 'closed');

create table room_categories (
  id uuid primary key default gen_random_uuid(),
  name_th text not null,
  name_en text,
  sort_order int not null default 0
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name_th text not null,
  name_en text,
  duration_min int not null check (duration_min > 0),
  price_satang int not null check (price_satang >= 0),
  required_equipment text[] not null default '{}',
  active boolean not null default true,
  sort_order int not null default 0
);

-- No rows for a service means any room category is allowed.
create table service_room_categories (
  service_id uuid not null references services,
  room_category_id uuid not null references room_categories,
  primary key (service_id, room_category_id)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  category_id uuid not null references room_categories,
  floor text,
  zone text,
  turnover_min int not null default 15 check (turnover_min >= 0),
  equipment text[] not null default '{}',
  notes text,
  sort_order int not null default 0,
  active boolean not null default true
);

-- A room's capacity is its count of active positions.
create table room_positions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms,
  label text not null,
  active boolean not null default true,
  unique (room_id, label)
);

create table room_blocks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms,
  during tstzrange not null check (not isempty(during)),
  kind block_kind not null,
  note text,
  created_by uuid default auth.uid()
);

create function private.rooms_default_position() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_positions(room_id, label) values (new.id, '1');
  return null;
end $$;
create trigger rooms_default_position after insert on rooms
  for each row execute function private.rooms_default_position();

do $$
declare t text;
begin
  foreach t in array array['room_categories','services','service_room_categories','rooms','room_positions','room_blocks'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select to authenticated using (private.current_role() is not null)$p$, t || '_select', t);
    execute format($p$create policy %I on %I for insert to authenticated with check (private.current_role() in ('owner','manager'))$p$, t || '_insert', t);
    if t <> 'service_room_categories' then
      execute format($p$create policy %I on %I for update to authenticated using (private.current_role() in ('owner','manager')) with check (private.current_role() in ('owner','manager'))$p$, t || '_update', t);
    end if;
    if t in ('room_blocks', 'service_room_categories') then
      execute format($p$create policy %I on %I for delete to authenticated using (private.current_role() in ('owner','manager'))$p$, t || '_delete', t);
    end if;
  end loop;
end $$;

-- service_room_categories has a composite key: its audit rows carry a null row_id.
do $$
declare t text;
begin
  foreach t in array array['room_categories','services','service_room_categories','rooms','room_positions','room_blocks'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;
