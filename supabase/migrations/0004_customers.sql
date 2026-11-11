-- 0004_customers: customers and protected notes
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users,
  display_name text not null,
  full_name text,
  phone text,
  email text,
  preferred_therapist_id uuid references therapists,
  comms_consent boolean not null default false,
  consent_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create table customer_private_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers,
  body text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table customers enable row level security;
-- Therapists get no access; they see only the display name through booking_board.
create policy customers_select on customers for select to authenticated
  using (private.current_role() in ('owner','manager','receptionist') or user_id = auth.uid());
create policy customers_insert on customers for insert to authenticated
  with check (private.current_role() in ('owner','manager','receptionist'));
create policy customers_update on customers for update to authenticated
  using (private.current_role() in ('owner','manager','receptionist'))
  with check (private.current_role() in ('owner','manager','receptionist'));

alter table customer_private_notes enable row level security;
create policy notes_select on customer_private_notes for select to authenticated
  using (private.current_role() in ('owner','manager'));
create policy notes_insert on customer_private_notes for insert to authenticated
  with check (private.current_role() in ('owner','manager'));
create policy notes_update on customer_private_notes for update to authenticated
  using (private.current_role() in ('owner','manager')) with check (private.current_role() in ('owner','manager'));

create trigger customers_audit after insert or update or delete on customers
  for each row execute function private.audit();
create trigger customer_private_notes_audit after insert or update or delete on customer_private_notes
  for each row execute function private.audit();
