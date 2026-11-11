-- 0017_reports_money: revenue and booking reports. Each number has exactly one definition, written here and
-- repeated word for word on the reports screen and in docs/architecture.md.
--
-- A "day" is a Bangkok calendar day. A booking belongs to the day its service STARTS; a payment to the day it was RECEIVED.
-- p_from and p_to are inclusive dates.
--
-- DEFINITIONS
--   Booked revenue       For bookings whose service starts in the period: price - discount of COMPLETED bookings,
--                        plus fee_satang of CANCELLED and NO-SHOW bookings. A rescheduled booking is one booking and
--                        is counted on the day it finally starts.
--   Collected revenue    Non-voided PAYMENT rows received in the period.
--   Refunded             Non-voided REFUND rows received in the period.
--   Net collected        Collected - refunded. Verification does not change these figures; money still awaiting
--                        verification is shown separately in reconciliation.
--   Average transaction  Booked revenue of completed bookings / number of completed bookings (fees excluded).
--   Cancellation rate    Cancelled / all bookings starting in the period. No-show rate likewise.
--   Reschedules          'rescheduled' events on bookings starting in the period.
--   Customers            Customers with a completed booking in the period.
--   Returning rate       Of those customers, the share who had a completed booking before their first one in the period.
--   Revenue by service / by therapist
--                        Completed bookings only (price - discount); fees are not attributed. Inactive services and
--                        therapists still appear when they have completed bookings in the period.

-- Owner always; manager while 'reports.manager_can_view' is true; nobody else.
create function private.require_reports() returns void
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_role app_role := private.current_role();
begin
  if v_role = 'owner' then return; end if;
  if v_role = 'manager' and private.setting_bool('reports.manager_can_view') then return; end if;
  raise exception 'NOT_AUTHORIZED';
end $$;

create function private.bangkok_day(p_at timestamptz) returns date
  language sql immutable
as $$ select (p_at at time zone 'Asia/Bangkok')::date $$;

create function private.bucket(p_day date, p_grain text) returns date
  language sql immutable
as $$
  select case p_grain when 'day' then p_day
                      when 'week' then date_trunc('week', p_day)::date
                      when 'month' then date_trunc('month', p_day)::date end
$$;

create function report_revenue(p_from date, p_to date, p_grain text default 'day')
  returns table (bucket date, booked_satang bigint, collected_satang bigint, refunded_satang bigint, net_collected_satang bigint)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_reports();
  if p_grain not in ('day', 'week', 'month') then raise exception 'INVALID_SETTING'; end if;
  return query
  with bk as (
    select private.bucket(private.bangkok_day(lower(k.service_during)), p_grain) as bkt,
           coalesce(sum(case when k.status = 'completed' then k.price_satang - k.discount_satang
                             when k.status in ('cancelled', 'no_show') then k.fee_satang else 0 end), 0)::bigint as booked
    from bookings k
    where private.bangkok_day(lower(k.service_during)) between p_from and p_to
    group by 1
  ), pay as (
    select private.bucket(private.bangkok_day(p.received_at), p_grain) as bkt,
           coalesce(sum(p.amount_satang) filter (where p.kind = 'payment'), 0)::bigint as collected,
           coalesce(sum(p.amount_satang) filter (where p.kind = 'refund'), 0)::bigint as refunded
    from payments p
    where p.voided_at is null and private.bangkok_day(p.received_at) between p_from and p_to
    group by 1
  )
  select coalesce(bk.bkt, pay.bkt),
         coalesce(bk.booked, 0)::bigint,
         coalesce(pay.collected, 0)::bigint,
         coalesce(pay.refunded, 0)::bigint,
         (coalesce(pay.collected, 0) - coalesce(pay.refunded, 0))::bigint
  from bk full join pay on pay.bkt = bk.bkt
  where coalesce(bk.booked, 0) <> 0 or coalesce(pay.collected, 0) <> 0 or coalesce(pay.refunded, 0) <> 0
  order by 1;
end $$;

create function report_summary(p_from date, p_to date)
  returns table (bookings int, completed int, cancelled int, no_shows int, walk_ins int, reschedules int,
                 cancellation_rate numeric, no_show_rate numeric, booked_satang bigint, fee_satang bigint,
                 avg_transaction_satang bigint, customers int, returning_customers int, returning_rate numeric)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_reports();
  return query
  with k as (
    select x.id as kid, x.customer_id as cid, x.status as st, x.source as src, lower(x.service_during) as starts,
           x.price_satang as price, x.discount_satang as disc, x.fee_satang as fee
    from bookings x where private.bangkok_day(lower(x.service_during)) between p_from and p_to
  ), agg as (
    select count(*)::int as n,
           (count(*) filter (where st = 'completed'))::int as comp,
           (count(*) filter (where st = 'cancelled'))::int as canc,
           (count(*) filter (where st = 'no_show'))::int as ns,
           (count(*) filter (where src = 'walk_in'))::int as walk,
           coalesce(sum(case when st = 'completed' then price - disc when st in ('cancelled', 'no_show') then fee else 0 end), 0)::bigint as booked,
           coalesce(sum(fee) filter (where st in ('cancelled', 'no_show')), 0)::bigint as fees,
           coalesce(sum(price - disc) filter (where st = 'completed'), 0)::bigint as comp_rev
    from k
  ), resch as (
    select count(*)::int as n from booking_events e where e.kind = 'rescheduled' and e.booking_id in (select kid from k)
  ), firsts as (
    select cid, min(starts) as first_start from k where st = 'completed' group by cid
  ), cust as (
    select count(*)::int as n,
           (count(*) filter (where exists (select 1 from bookings y where y.customer_id = f.cid and y.status = 'completed'
                                           and lower(y.service_during) < f.first_start)))::int as ret
    from firsts f
  )
  select agg.n, agg.comp, agg.canc, agg.ns, agg.walk, resch.n,
         round(coalesce(agg.canc::numeric / nullif(agg.n, 0), 0), 4),
         round(coalesce(agg.ns::numeric / nullif(agg.n, 0), 0), 4),
         agg.booked, agg.fees,
         case when agg.comp = 0 then 0::bigint else round(agg.comp_rev::numeric / agg.comp)::bigint end,
         cust.n, cust.ret,
         round(coalesce(cust.ret::numeric / nullif(cust.n, 0), 0), 4)
  from agg, resch, cust;
end $$;

create function report_by_service(p_from date, p_to date)
  returns table (service_id uuid, completed int, minutes int, booked_satang bigint)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_reports();
  return query
  select k.service_id, count(*)::int,
         coalesce(sum(extract(epoch from upper(k.service_during) - lower(k.service_during)) / 60), 0)::int,
         coalesce(sum(k.price_satang - k.discount_satang), 0)::bigint
  from bookings k
  where k.status = 'completed' and private.bangkok_day(lower(k.service_during)) between p_from and p_to
  group by k.service_id order by 4 desc, k.service_id;
end $$;

create function report_by_therapist(p_from date, p_to date)
  returns table (therapist_id uuid, completed int, minutes int, booked_satang bigint)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform private.require_reports();
  return query
  select k.therapist_id, count(*)::int,
         coalesce(sum(extract(epoch from upper(k.service_during) - lower(k.service_during)) / 60), 0)::int,
         coalesce(sum(k.price_satang - k.discount_satang), 0)::bigint
  from bookings k
  where k.status = 'completed' and private.bangkok_day(lower(k.service_during)) between p_from and p_to
  group by k.therapist_id order by 4 desc, k.therapist_id;
end $$;
