-- The business uses commissions only. Retain any historic tip rows for audit,
-- but remove the application write API and exclude tips from all earnings results.
drop function if exists record_staff_tip(uuid, int, text, text);
drop function if exists void_staff_tip(uuid, text);
revoke all on staff_tips from anon, authenticated;
revoke insert, update on staff_tips from service_role;
drop policy if exists management_read on staff_tips;
comment on table staff_tips is 'Retired historical ledger. The application no longer records or reports tips.';

create or replace function earnings_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform private.require_role('owner','manager');
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'INVALID_INPUT'; end if;
  with base as (
    select c.*,b.service_id,s.name_th service_name,t.display_name therapist_name,b.price_satang-b.discount_satang gross_satang,
      coalesce((select sum(p.amount_satang) from payments p where p.booking_id=b.id and p.kind='refund' and p.voided_at is null),0) refund_satang
    from booking_commissions c join bookings b on b.id=c.booking_id join services s on s.id=b.service_id join therapists t on t.id=c.therapist_id
    where c.completed_at >= (p_from::timestamp at time zone 'Asia/Bangkok') and c.completed_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
  ), calc as (
    select *,greatest(0,gross_satang-refund_satang)::bigint net_satang,
      round(case when mode='percent' then greatest(0,gross_satang-refund_satang)*rate_bps/10000.0
        when gross_satang>0 then fixed_satang*greatest(0,gross_satang-refund_satang)/gross_satang::numeric else 0 end)::bigint commission_satang
    from base
  ) select jsonb_build_object(
    'summary',coalesce((select jsonb_agg(x order by x.therapist_name) from (
      select therapist_id,therapist_name,sum(commission_satang)::bigint commission_satang,count(*)::int treatments
      from calc group by therapist_id,therapist_name) x),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(x) from (select * from calc order by completed_at desc,id desc limit 100) x),'[]'::jsonb),
    'entry_count',(select count(*) from calc)
  ) into result;
  return result;
end $$;
revoke all on function earnings_report(date,date) from public,anon,authenticated;
grant execute on function earnings_report(date,date) to authenticated,service_role;
notify pgrst, 'reload schema';
