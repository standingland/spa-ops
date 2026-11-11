-- 0005_bookings: bookings, booking_events, exclusion constraints
create type booking_status as enum ('requested','confirmed','checked_in','in_treatment','completed','cancelled','no_show');
create type booking_source as enum ('advance','walk_in');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers,
  service_id uuid not null references services,
  therapist_id uuid not null references therapists,
  position_id uuid not null references room_positions,
  room_id uuid not null references rooms,          -- trigger rejects a row whose room is not the position's room
  party_id uuid not null default gen_random_uuid(),-- bookings sharing a room at once must share a party
  service_during tstzrange not null,               -- therapist is busy
  room_during tstzrange not null,                  -- service time plus the room's turnover buffer
  status booking_status not null default 'confirmed',
  source booking_source not null,
  price_satang int not null check (price_satang >= 0),
  discount_satang int not null default 0 check (discount_satang between 0 and price_satang),
  note text,
  idempotency_key text not null unique,
  version int not null default 1,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not isempty(service_during) and room_during @> service_during),
  constraint bookings_therapist_no_overlap exclude using gist
    (therapist_id with =, service_during with &&) where (status not in ('cancelled','no_show')),
  constraint bookings_position_no_overlap exclude using gist
    (position_id with =, room_during with &&) where (status not in ('cancelled','no_show')),
  constraint bookings_room_single_party exclude using gist
    (room_id with =, party_id with <>, room_during with &&) where (status not in ('cancelled','no_show'))
);
create index bookings_service_during_idx on bookings using gist (service_during);

create function private.bookings_room_matches_position() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.room_id is distinct from (select p.room_id from public.room_positions p where p.id = new.position_id) then
    raise exception 'room_id does not match the position''s room' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bookings_room_matches_position before insert or update of room_id, position_id on bookings
  for each row execute function private.bookings_room_matches_position();

create table booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  kind text not null check (kind in ('created','status_changed','rescheduled','reassigned')),
  before jsonb,
  after jsonb
);

alter table bookings enable row level security;
-- No insert, update or delete policy: all writes go through the RPCs.
create policy bookings_select on bookings for select to authenticated using (
  private.current_role() in ('owner','manager','receptionist')
  or (private.current_role() = 'therapist' and exists (
        select 1 from therapists t where t.id = bookings.therapist_id and t.staff_user_id = auth.uid()))
  or exists (select 1 from customers c where c.id = bookings.customer_id and c.user_id = auth.uid())
);

alter table booking_events enable row level security;
create policy booking_events_select on booking_events for select to authenticated
  using (private.current_role() in ('owner','manager','receptionist'));

create trigger bookings_audit after insert or update or delete on bookings
  for each row execute function private.audit();
