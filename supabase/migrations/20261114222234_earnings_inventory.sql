-- Commission rates and material costs are captured only on NEW completions.
-- Tips are recorded separately; this is an accrual report, not payroll or a payment gateway.
create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services,
  therapist_id uuid references therapists,
  mode text not null check (mode in ('percent','fixed')),
  rate_bps int not null default 0 check (rate_bps between 0 and 10000),
  fixed_satang int not null default 0 check (fixed_satang between 0 and 100000000),
  unique nulls not distinct (service_id, therapist_id)
);
create table booking_commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings,
  therapist_id uuid not null references therapists,
  mode text not null check (mode in ('percent','fixed')),
  rate_bps int not null,
  fixed_satang int not null,
  completed_at timestamptz not null
);
create index booking_commissions_completed_idx on booking_commissions(completed_at);
create table staff_tips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings,
  therapist_id uuid not null references therapists,
  amount_satang int not null check (amount_satang between 1 and 100000000),
  note text check (length(note) <= 300),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  idempotency_key text not null unique,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
create index staff_tips_recorded_idx on staff_tips(recorded_at);
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  reorder_level numeric(14,3) not null default 0 check (reorder_level between 0 and 1000000000),
  on_hand numeric(14,3) not null default 0,
  unit_cost_satang numeric(14,4) not null default 0 check (unit_cost_satang >= 0),
  active boolean not null default true
);
create table service_materials (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services,
  item_id uuid not null references inventory_items,
  quantity numeric(14,3) not null check (quantity > 0 and quantity <= 1000000000),
  unique(service_id, item_id)
);
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items,
  booking_id uuid references bookings,
  kind text not null check (kind in ('receipt','adjustment','usage')),
  quantity numeric(14,3) not null check (quantity <> 0),
  unit_cost_satang numeric(14,4) not null check (unit_cost_satang >= 0),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  occurred_at timestamptz not null default now(),
  actor uuid default auth.uid(),
  idempotency_key text unique,
  unique(booking_id, item_id),
  check ((kind = 'usage') = (booking_id is not null)),
  check (kind <> 'usage' or quantity < 0),
  check (kind <> 'receipt' or quantity > 0)
);
create index stock_movements_occurred_idx on stock_movements(occurred_at);
create index stock_movements_item_idx on stock_movements(item_id);

-- All business data is management-only, including direct REST access. Writes only through checked RPCs.
do $$ declare tbl text; begin
  foreach tbl in array array['commission_rules','booking_commissions','staff_tips','inventory_items','service_materials','stock_movements'] loop
    execute format('alter table %I enable row level security', tbl);
    execute format('revoke all on %I from anon, authenticated', tbl);
    execute format('grant select on %I to authenticated', tbl);
    execute format('grant all on %I to service_role', tbl);
    execute format('create policy management_read on %I for select to authenticated using (private.current_role() in (''owner'',''manager''))', tbl);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function private.audit()', tbl || '_audit', tbl);
  end loop;
end $$;

create function save_commission_rule(p_service_id uuid, p_therapist_id uuid, p_mode text, p_rate_bps int, p_fixed_satang int)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_role('owner','manager');
  if p_mode is null or p_mode not in ('percent','fixed') or p_rate_bps is null or p_rate_bps not between 0 and 10000
    or p_fixed_satang is null or p_fixed_satang not between 0 and 100000000 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists(select 1 from services where id=p_service_id and active)
    or (p_therapist_id is not null and not exists(select 1 from therapists where id=p_therapist_id and active)) then raise exception 'RESOURCE_INACTIVE'; end if;
  insert into commission_rules(service_id,therapist_id,mode,rate_bps,fixed_satang)
  values(p_service_id,p_therapist_id,p_mode,p_rate_bps,p_fixed_satang)
  on conflict(service_id,therapist_id) do update set mode=excluded.mode,rate_bps=excluded.rate_bps,fixed_satang=excluded.fixed_satang
  returning id into v_id;
  return v_id;
end $$;
create function remove_commission_rule(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager');
  delete from commission_rules where id=p_id;
end $$;

create function save_inventory_item(p_id uuid, p_name text, p_unit text, p_reorder_level numeric, p_active boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform private.require_role('owner','manager');
  if p_name is null or length(btrim(p_name)) not between 1 and 100 or p_unit is null or length(btrim(p_unit)) not between 1 and 20
    or p_reorder_level is null or p_reorder_level not between 0 and 1000000000 or p_reorder_level <> round(p_reorder_level,3)
    or p_active is null then raise exception 'INVALID_INPUT'; end if;
  if p_id is null then
    insert into inventory_items(name,unit,reorder_level,active) values(btrim(p_name),btrim(p_unit),p_reorder_level,p_active) returning id into v_id;
  else
    -- Unit is immutable: changing ml to bottles would corrupt quantities and history.
    update inventory_items set name=btrim(p_name),reorder_level=p_reorder_level,active=p_active where id=p_id and unit=btrim(p_unit) returning id into v_id;
    if not found then raise exception 'INVALID_INPUT'; end if;
  end if;
  return v_id;
end $$;

create function record_stock_movement(p_item_id uuid, p_kind text, p_quantity numeric, p_unit_cost_satang numeric, p_reason text, p_key text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v inventory_items; v_old stock_movements; v_id uuid; v_cost numeric;
begin
  perform private.require_role('owner','manager');
  if p_key is null or length(p_key) not between 8 and 100 or p_reason is null or length(btrim(p_reason)) not between 1 and 300 then raise exception 'REASON_REQUIRED'; end if;
  -- Serialise repeated keys before taking item locks, including requests for different items.
  perform pg_advisory_xact_lock(hashtextextended('stock:' || p_key,0));
  select * into v_old from stock_movements where idempotency_key=p_key;
  if found then
    if v_old.item_id is distinct from p_item_id or v_old.kind is distinct from p_kind or v_old.quantity is distinct from p_quantity then raise exception 'INVALID_INPUT'; end if;
    return v_old.id;
  end if;
  if p_kind is null or p_kind not in ('receipt','adjustment') or p_quantity is null or p_quantity=0 or abs(p_quantity)>1000000000
    or p_quantity<>round(p_quantity,3) or (p_kind='receipt' and p_quantity<0)
    or (p_kind='receipt' and (p_unit_cost_satang is null or p_unit_cost_satang not between 0 and 100000000)) then raise exception 'INVALID_AMOUNT'; end if;
  select * into v from inventory_items where id=p_item_id for update;
  if not found or not v.active then raise exception 'RESOURCE_INACTIVE'; end if;
  v_cost := v.unit_cost_satang;
  if p_kind='receipt' then
    v_cost := case when v.on_hand>0 then (v.on_hand*v.unit_cost_satang+p_quantity*p_unit_cost_satang)/(v.on_hand+p_quantity) else p_unit_cost_satang end;
  end if;
  update inventory_items set on_hand=on_hand+p_quantity,unit_cost_satang=round(v_cost,4) where id=p_item_id;
  insert into stock_movements(item_id,kind,quantity,unit_cost_satang,reason,idempotency_key)
  values(p_item_id,p_kind,p_quantity,case when p_kind='receipt' then p_unit_cost_satang else v.unit_cost_satang end,btrim(p_reason),p_key) returning id into v_id;
  return v_id;
end $$;

create function set_service_materials(p_service_id uuid, p_materials jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager');
  if p_materials is null or jsonb_typeof(p_materials)<>'array' or jsonb_array_length(p_materials)>100 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || p_service_id::text,0));
  if not exists(select 1 from services where id=p_service_id and active) then raise exception 'RESOURCE_INACTIVE'; end if;
  if exists(select 1 from jsonb_to_recordset(p_materials) as x(item_id uuid,quantity numeric)
    where x.item_id is null or x.quantity is null or x.quantity<=0 or x.quantity>1000000000 or x.quantity<>round(x.quantity,3)
      or not exists(select 1 from inventory_items i where i.id=x.item_id and i.active)) then raise exception 'INVALID_INPUT'; end if;
  if (select count(*)<>count(distinct x.item_id) from jsonb_to_recordset(p_materials) as x(item_id uuid,quantity numeric)) then raise exception 'DUPLICATE'; end if;
  delete from service_materials where service_id=p_service_id;
  insert into service_materials(service_id,item_id,quantity) select p_service_id,x.item_id,x.quantity from jsonb_to_recordset(p_materials) as x(item_id uuid,quantity numeric);
end $$;

create function private.capture_business_completion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r commission_rules; m record; v_cost numeric;
begin
  if new.status<>'completed' or old.status='completed' then return new; end if;
  select * into r from commission_rules where service_id=new.service_id and (therapist_id is null or therapist_id=new.therapist_id)
    order by (therapist_id is not null) desc limit 1;
  insert into booking_commissions(booking_id,therapist_id,mode,rate_bps,fixed_satang,completed_at)
    values(new.id,new.therapist_id,coalesce(r.mode,'percent'),coalesce(r.rate_bps,0),coalesce(r.fixed_satang,0),coalesce(new.completed_at,now()));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || new.service_id::text,0));
  -- Always lock materials in UUID order so simultaneous treatments cannot lose stock or deadlock.
  for m in select * from service_materials where service_id=new.service_id order by item_id loop
    select unit_cost_satang into v_cost from inventory_items where id=m.item_id for update;
    update inventory_items set on_hand=on_hand-m.quantity where id=m.item_id;
    insert into stock_movements(item_id,booking_id,kind,quantity,unit_cost_satang,reason)
      values(m.item_id,new.id,'usage',-m.quantity,v_cost,'Completed treatment');
  end loop;
  return new;
end $$;
revoke all on function private.capture_business_completion() from public, anon, authenticated;
create trigger capture_business_completion after update of status on bookings
  for each row execute function private.capture_business_completion();

create function record_staff_tip(p_booking_id uuid, p_amount_satang int, p_note text, p_key text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bookings; v staff_tips; v_id uuid;
begin
  perform private.require_role('owner','manager');
  if p_key is null or length(p_key) not between 8 and 100 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tip:' || p_key,0));
  select * into v from staff_tips where idempotency_key=p_key;
  if found then
    if v.booking_id is distinct from p_booking_id or v.amount_satang is distinct from p_amount_satang then raise exception 'INVALID_INPUT'; end if;
    return v.id;
  end if;
  select * into b from bookings where id=p_booking_id for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if b.status<>'completed' then raise exception 'INVALID_TRANSITION'; end if;
  if p_amount_satang is null or p_amount_satang not between 1 and 100000000 or length(p_note)>300 then raise exception 'INVALID_AMOUNT'; end if;
  if private.looks_like_card(p_note) then raise exception 'CARD_DATA_REFUSED'; end if;
  insert into staff_tips(booking_id,therapist_id,amount_satang,note,idempotency_key)
    values(b.id,b.therapist_id,p_amount_satang,nullif(btrim(p_note),''),p_key) returning id into v_id;
  return v_id;
end $$;
create function void_staff_tip(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('owner','manager');
  if p_reason is null or length(btrim(p_reason)) not between 1 and 300 then raise exception 'REASON_REQUIRED'; end if;
  update staff_tips set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) where id=p_id and voided_at is null;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $$;

-- Current accruals: frozen rate; current service price after discount less non-voided refunds.
-- A fixed commission is reduced proportionately by refunds. Tips remain independent.
create function earnings_report(p_from date, p_to date) returns jsonb
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
  ), tips as (
    select p.*,t.display_name therapist_name from staff_tips p join therapists t on t.id=p.therapist_id
    where p.recorded_at >= (p_from::timestamp at time zone 'Asia/Bangkok') and p.recorded_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
  ), totals as (
    select therapist_id,sum(commission_satang)::bigint commission_satang,0::bigint tips_satang,count(*)::int treatments from calc group by therapist_id
    union all select therapist_id,0::bigint,coalesce(sum(amount_satang) filter(where voided_at is null),0)::bigint,0 from tips group by therapist_id
  ) select jsonb_build_object(
    'summary',coalesce((select jsonb_agg(x order by x.therapist_name) from (
      select z.therapist_id,t.display_name therapist_name,sum(z.commission_satang)::bigint commission_satang,sum(z.tips_satang)::bigint tips_satang,sum(z.treatments)::int treatments
      from totals z join therapists t on t.id=z.therapist_id group by z.therapist_id,t.display_name) x),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(x) from (select * from calc order by completed_at desc,id desc limit 100) x),'[]'::jsonb),
    'tips',coalesce((select jsonb_agg(x) from (select * from tips order by recorded_at desc,id desc limit 100) x),'[]'::jsonb),
    'entry_count',(select count(*) from calc),'tip_count',(select count(*) from tips)
  ) into result;
  return result;
end $$;

create function inventory_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform private.require_role('owner','manager');
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'INVALID_INPUT'; end if;
  with movements as (
    select * from stock_movements where occurred_at >= (p_from::timestamp at time zone 'Asia/Bangkok')
      and occurred_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok')
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(i order by i.name,i.id) from inventory_items i),'[]'::jsonb),
    'materials',coalesce((select jsonb_agg(m order by m.service_id,m.item_id) from service_materials m),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(x) from (select * from movements order by occurred_at desc,id desc limit 100) x),'[]'::jsonb),
    'movementCount',(select count(*) from movements),
    'costByService',coalesce((select jsonb_agg(x order by x.service_name) from (
      select s.id service_id,s.name_th service_name,count(distinct m.booking_id)::int treatments,
        sum(round(-m.quantity*m.unit_cost_satang))::bigint cost_satang,
        round(sum(round(-m.quantity*m.unit_cost_satang))/count(distinct m.booking_id))::bigint average_satang
      from movements m join bookings b on b.id=m.booking_id join services s on s.id=b.service_id
      where m.kind='usage' group by s.id,s.name_th) x),'[]'::jsonb),
    'materialCostSatang',coalesce((select sum(round(-quantity*unit_cost_satang)) from movements where kind='usage'),0)
  ) into result;
  return result;
end $$;

-- Explicit grants; no function inherits public EXECUTE, even on projects with permissive defaults.
do $$ declare f record; begin
  for f in select o.oid::regprocedure sig from pg_proc o join pg_namespace n on n.oid=o.pronamespace
    where n.nspname='public' and o.proname in ('save_commission_rule','remove_commission_rule','save_inventory_item','record_stock_movement','set_service_materials','record_staff_tip','void_staff_tip','earnings_report','inventory_report') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    execute format('grant execute on function %s to authenticated,service_role',f.sig);
  end loop;
end $$;
notify pgrst, 'reload schema';
