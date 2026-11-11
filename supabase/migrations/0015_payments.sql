-- 0015_payments: an append-only payment ledger. Nothing is edited or deleted: a mistake is voided with a reason,
-- money returned is a refund row pointing at the payment. Balances and payment status are derived, never stored.

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null,
  name_en text,
  needs_verification boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0
);
alter table payment_methods enable row level security;
create policy payment_methods_select on payment_methods for select to authenticated
  using (private.current_role() is not null);
create policy payment_methods_insert on payment_methods for insert to authenticated
  with check (private.current_role() = 'owner');
create policy payment_methods_update on payment_methods for update to authenticated
  using (private.current_role() = 'owner') with check (private.current_role() = 'owner');
create trigger payment_methods_audit after insert or update or delete on payment_methods
  for each row execute function private.audit();

insert into payment_methods(code, name_th, name_en, needs_verification, sort_order) values
  ('cash', 'เงินสด', 'Cash', false, 1),
  ('bank_transfer', 'โอนเงิน', 'Bank transfer', true, 2),
  ('promptpay', 'พร้อมเพย์', 'PromptPay', true, 3);

create type payment_status as enum ('not_due', 'unpaid', 'partial', 'paid', 'overpaid', 'refunded');

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings,
  method_id uuid not null references payment_methods,
  kind text not null check (kind in ('payment', 'refund')),
  amount_satang int not null check (amount_satang > 0),
  refund_of uuid references payments,
  reference text,
  note text,
  received_by uuid default auth.uid(),
  received_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  idempotency_key text not null unique,
  check ((kind = 'refund') = (refund_of is not null))
);
create index payments_booking_idx on payments (booking_id);
create index payments_received_idx on payments (received_at);

alter table payments enable row level security;
-- No insert, update or delete policy for any role: the ledger changes only through the functions below.
create policy payments_select on payments for select to authenticated
  using (private.current_role() in ('owner', 'manager', 'receptionist'));
create trigger payments_audit after insert or update or delete on payments
  for each row execute function private.audit();

-- True when the text contains a run of 13-19 digits (spaces and dashes allowed between them) that passes the Luhn check.
create function private.luhn_ok(d text) returns boolean
  language plpgsql immutable
as $$
declare s int := 0; n int; alt boolean := false; i int;
begin
  for i in reverse length(d)..1 loop
    n := substr(d, i, 1)::int;
    if alt then n := n * 2; if n > 9 then n := n - 9; end if; end if;
    s := s + n; alt := not alt;
  end loop;
  return s % 10 = 0;
end $$;

create function private.looks_like_card(p text) returns boolean
  language plpgsql immutable
as $$
declare m text[]; d text;
begin
  if p is null then return false; end if;
  for m in select regexp_matches(p, '((?:[0-9][ -]?){12,18}[0-9])', 'g') loop
    d := regexp_replace(m[1], '[ -]', '', 'g');
    if length(d) between 13 and 19 and private.luhn_ok(d) then return true; end if;
  end loop;
  return false;
end $$;

-- One definition of "what is owed": charge, money in, money back. Voided rows are ignored.
create function private.booking_money_calc(p_ids uuid[])
  returns table (booking_id uuid, charge_satang int, paid_satang int, refunded_satang int, due_satang int,
                 payment_status payment_status, has_unverified boolean)
  language sql stable security definer set search_path = public, pg_temp
as $$
  with sums as (
    select p.booking_id as bid,
           coalesce(sum(p.amount_satang) filter (where p.kind = 'payment'), 0)::int as paid,
           coalesce(sum(p.amount_satang) filter (where p.kind = 'refund'), 0)::int as refunded,
           coalesce(bool_or(p.kind = 'payment' and p.verified_at is null), false) as unv
    from payments p where p.voided_at is null and p.booking_id = any (p_ids) group by p.booking_id
  ), calc as (
    select k.id as bid, private.booking_charge(k) as charge,
           coalesce(s.paid, 0) as paid, coalesce(s.refunded, 0) as refunded, coalesce(s.unv, false) as unv
    from bookings k left join sums s on s.bid = k.id where k.id = any (p_ids)
  )
  select c.bid, c.charge, c.paid, c.refunded, c.charge - (c.paid - c.refunded),
         (case when c.charge = 0 and c.paid = 0 then 'not_due'
               when c.charge = 0 and c.paid - c.refunded = 0 then 'refunded'
               when c.paid - c.refunded > c.charge then 'overpaid'
               when c.paid - c.refunded = 0 then 'unpaid'
               when c.paid - c.refunded < c.charge then 'partial'
               else 'paid' end)::payment_status,
         c.unv
  from calc c
$$;

create function booking_money(p_booking_ids uuid[])
  returns table (booking_id uuid, charge_satang int, paid_satang int, refunded_satang int, due_satang int,
                 payment_status payment_status, has_unverified boolean)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return query select * from private.booking_money_calc(p_booking_ids);
end $$;

create function pending_payments()
  returns table (booking_id uuid, customer_display_name text, starts_at timestamptz, status booking_status,
                 charge_satang int, due_satang int, payment_status payment_status)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner', 'manager', 'receptionist');
  return query
  select m.booking_id, c.display_name, lower(k.service_during), k.status, m.charge_satang, m.due_satang, m.payment_status
  from private.booking_money_calc(
         (select coalesce(array_agg(x.id), '{}') from bookings x
          where x.status in ('completed', 'cancelled', 'no_show')
            and (private.booking_charge(x) > 0 or exists (select 1 from payments p where p.booking_id = x.id)))) m
  join bookings k on k.id = m.booking_id
  join customers c on c.id = k.customer_id
  where m.due_satang <> 0
  order by lower(k.service_during), k.id;
end $$;

create function record_payment(
  p_booking_id uuid, p_method_id uuid, p_amount_satang int, p_idempotency_key text,
  p_reference text default null, p_note text default null)
  returns payments
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role app_role := private.current_role();
  v_book bookings; v_method payment_methods; v_row payments; v_due int;
begin
  if v_role is null or v_role not in ('owner', 'manager', 'receptionist') then raise exception 'NOT_AUTHORIZED'; end if;
  if v_role = 'receptionist' and not private.setting_bool('payments.receptionist_can_record') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_book from bookings where id = p_booking_id for update;       -- serialises payments for one booking
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_row from payments where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  if p_amount_satang is null or p_amount_satang <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_method from payment_methods where id = p_method_id;
  if not found or not v_method.active then raise exception 'RESOURCE_INACTIVE'; end if;
  if private.looks_like_card(p_reference) or private.looks_like_card(p_note) then raise exception 'CARD_DATA_REFUSED'; end if;

  select m.due_satang into v_due from private.booking_money_calc(array[p_booking_id]) m;
  if p_amount_satang > v_due then raise exception 'OVERPAYMENT'; end if;

  insert into payments(booking_id, method_id, kind, amount_satang, reference, note, idempotency_key, verified_at, verified_by)
  values (p_booking_id, p_method_id, 'payment', p_amount_satang, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
          p_idempotency_key,
          case when v_method.needs_verification then null else now() end,
          case when v_method.needs_verification then null else auth.uid() end)
  returning * into v_row;
  return v_row;
end $$;

create function verify_payment(p_payment_id uuid) returns payments
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row payments;
begin
  perform private.require_role('owner', 'manager');
  select * into v_row from payments where id = p_payment_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_row.verified_at is not null or v_row.voided_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  update payments set verified_at = now(), verified_by = auth.uid() where id = p_payment_id returning * into v_row;
  return v_row;
end $$;

create function void_payment(p_payment_id uuid, p_reason text) returns payments
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row payments;
begin
  perform private.require_role('owner', 'manager');
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into v_row from payments where id = p_payment_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_row.voided_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from payments r where r.refund_of = p_payment_id and r.voided_at is null) then
    raise exception 'INVALID_TRANSITION';
  end if;
  update payments set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_payment_id returning * into v_row;
  return v_row;
end $$;

create function record_refund(p_payment_id uuid, p_amount_satang int, p_idempotency_key text, p_reason text)
  returns payments
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_pay payments; v_row payments; v_earlier int;
begin
  perform private.require_role('owner', 'manager');
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_amount_satang is null or p_amount_satang <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if private.looks_like_card(p_reason) then raise exception 'CARD_DATA_REFUSED'; end if;

  select * into v_pay from payments where id = p_payment_id for update;        -- serialises refunds of one payment
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_row from payments where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  if v_pay.voided_at is not null or v_pay.kind <> 'payment' then raise exception 'INVALID_TRANSITION'; end if;
  select coalesce(sum(r.amount_satang), 0) into v_earlier
  from payments r where r.refund_of = p_payment_id and r.voided_at is null;
  if p_amount_satang > v_pay.amount_satang - v_earlier then raise exception 'REFUND_EXCEEDS_PAYMENT'; end if;

  insert into payments(booking_id, method_id, kind, amount_satang, refund_of, note, idempotency_key, verified_at, verified_by)
  values (v_pay.booking_id, v_pay.method_id, 'refund', p_amount_satang, p_payment_id, btrim(p_reason),
          p_idempotency_key, now(), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create function payment_day_summary(p_day date)
  returns table (method_id uuid, payments int, recorded_satang bigint, verified_satang bigint,
                 unverified_satang bigint, refunded_satang bigint, voided_satang bigint)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_role('owner', 'manager');
  return query
  select p.method_id,
         (count(*) filter (where p.kind = 'payment' and p.voided_at is null))::int,
         coalesce(sum(p.amount_satang) filter (where p.kind = 'payment' and p.voided_at is null), 0)::bigint,
         coalesce(sum(p.amount_satang) filter (where p.kind = 'payment' and p.voided_at is null and p.verified_at is not null), 0)::bigint,
         coalesce(sum(p.amount_satang) filter (where p.kind = 'payment' and p.voided_at is null and p.verified_at is null), 0)::bigint,
         coalesce(sum(p.amount_satang) filter (where p.kind = 'refund' and p.voided_at is null), 0)::bigint,
         coalesce(sum(p.amount_satang) filter (where p.voided_at is not null), 0)::bigint
  from payments p
  where (p.received_at at time zone 'Asia/Bangkok')::date = p_day
  group by p.method_id
  order by p.method_id;
end $$;

create table cash_closings (
  day date primary key,
  expected_satang bigint not null,
  counted_satang bigint not null,
  note text,
  closed_by uuid default auth.uid(),
  closed_at timestamptz not null default now()
);
alter table cash_closings enable row level security;
create policy cash_closings_select on cash_closings for select to authenticated
  using (private.current_role() in ('owner', 'manager'));
create trigger cash_closings_audit after insert or update or delete on cash_closings
  for each row execute function private.audit();

create function close_cash_day(p_day date, p_counted_satang bigint, p_note text default null)
  returns cash_closings
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_exp bigint; v_row cash_closings;
begin
  perform private.require_role('owner', 'manager');
  if p_counted_satang is null or p_counted_satang < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select coalesce(sum(case when p.kind = 'payment' then p.amount_satang else -p.amount_satang end), 0) into v_exp
  from payments p join payment_methods m on m.id = p.method_id
  where m.code = 'cash' and p.voided_at is null and (p.received_at at time zone 'Asia/Bangkok')::date = p_day;
  insert into cash_closings(day, expected_satang, counted_satang, note, closed_by, closed_at)
  values (p_day, v_exp, p_counted_satang, nullif(btrim(p_note), ''), auth.uid(), now())
  on conflict (day) do update set expected_satang = excluded.expected_satang, counted_satang = excluded.counted_satang,
    note = excluded.note, closed_by = excluded.closed_by, closed_at = excluded.closed_at
  returning * into v_row;
  return v_row;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;
