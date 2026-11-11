-- Deterministic year-sized dataset for the performance budgets. Run on a migrated database (empty, or the local seed:
-- it adds its own rooms R-01..R-40, therapists, services and customers and leaves existing rows alone).
-- Roughly: 40 rooms (2 with two positions), 60 therapists, 8 services, 5,000 customers, shifts for 396 days,
-- and ~80 bookings a day from 365 days ago to 30 days ahead (about 31,000), with payments and events.
-- Nothing is generated at or after 19:45, which the storm test uses.
begin;
set local session_replication_role = replica;      -- skip audit / guard triggers while loading (superuser only)

create temp table perf_today as select (now() at time zone 'Asia/Bangkok')::date as d;

-- accounts: only on a database without staff (the seeded local stack already has them)
insert into auth.users(id, email)
select u.id, u.email from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, 'perf-owner@spa.test'),
  ('00000000-0000-4000-8000-0000000000a2'::uuid, 'perf-reception@spa.test')) u(id, email)
where not exists (select 1 from staff);
insert into staff(user_id, role, display_name)
select u.id, u.role::app_role, u.name from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, 'owner', 'Perf Owner'),
  ('00000000-0000-4000-8000-0000000000a2'::uuid, 'receptionist', 'Perf Reception')) u(id, role, name)
where not exists (select 1 from staff);

-- rooms
insert into room_categories(name_th, name_en, sort_order) select 'perf ' || i, 'perf ' || i, 100 + i from generate_series(1, 3) i;
insert into rooms(code, display_name, category_id, zone, turnover_min, sort_order)
select 'R-' || lpad(n::text, 2, '0'), 'Room ' || n,
       (select id from room_categories where name_en = 'perf ' || (1 + n % 3)), 'Z' || (1 + n % 4), 15, 200 + n
from generate_series(1, 40) n;
insert into room_positions(room_id, label) select id, '1' from rooms where code like 'R-%';
insert into room_positions(room_id, label) select id, '2' from rooms where code in ('R-39', 'R-40');

-- services (45..120 minutes) and therapists qualified for all of them
create temp table perf_services as
select row_number() over (order by dur) as i, dur, (dur * 2000)::int as price from unnest(array[45, 60, 60, 75, 90, 90, 105, 120]) dur;
insert into services(name_th, name_en, duration_min, price_satang, sort_order)
select 'perf บริการ ' || i, 'perf service ' || i, dur, price, 200 + i from perf_services;
insert into therapists(display_name, employment_type, sort_order)
select 'Perf T' || lpad(n::text, 2, '0'), 'employee', 200 + n from generate_series(1, 60) n;
insert into therapist_services(therapist_id, service_id)
select t.id, s.id from therapists t cross join services s where t.display_name like 'Perf T%' and s.name_en like 'perf service %';
insert into therapist_shifts(therapist_id, during)
select t.id, tstzrange((((select d from perf_today) + off)::timestamp + time '10:00') at time zone 'Asia/Bangkok',
                       (((select d from perf_today) + off)::timestamp + time '22:00') at time zone 'Asia/Bangkok', '[)')
from therapists t cross join generate_series(-365, 30) off where t.display_name like 'Perf T%';

-- customers
insert into customers(display_name, phone)
select 'Perf C' || n, '09' || lpad(n::text, 8, '0') from generate_series(1, 5000) n;

-- bookings: four fixed slots a day per room, room n always served by therapist n, so nothing can overlap
create temp table perf_rooms as
select r.id as room_id, row_number() over (order by r.code) as n, (select id from room_positions p where p.room_id = r.id and p.label = '1') as position_id
from rooms r where r.code like 'R-%';
create temp table perf_th as
select id as therapist_id, row_number() over (order by display_name) as n from therapists where display_name like 'Perf T%';
create temp table perf_svc as
select s.id as service_id, p.i from services s join perf_services p on s.name_en = 'perf service ' || p.i;
create temp table perf_cust as
select id as customer_id, row_number() over (order by display_name) as n from customers where display_name like 'Perf C%';

create temp table perf_slots as
select r.room_id, r.position_id, t.therapist_id, off, sl.i as slot,
       ((((select d from perf_today) + off)::timestamp + sl.tm) at time zone 'Asia/Bangkok') as starts,
       abs(hashtext(r.n || ':' || off || ':' || sl.i)) as h
from perf_rooms r
join perf_th t on t.n = r.n
cross join generate_series(-365, 30) off
cross join (values (1, time '10:00'), (2, time '12:30'), (3, time '15:00'), (4, time '17:30')) sl(i, tm);

insert into bookings(customer_id, service_id, therapist_id, position_id, room_id, service_during, room_during, status, source,
                     price_satang, charge_reason, idempotency_key, checked_in_at, started_at, completed_at, created_at)
select c.customer_id, s.service_id, g.therapist_id, g.position_id, g.room_id,
       tstzrange(g.starts, g.starts + (s.dur || ' minutes')::interval, '[)'),
       tstzrange(g.starts, g.starts + ((s.dur + 15) || ' minutes')::interval, '[)'),
       case when g.off >= 0 then 'confirmed'
            when g.h2 < 88 then 'completed' when g.h2 < 96 then 'cancelled' else 'no_show' end::booking_status,
       'advance', s.price,
       case when g.off < 0 and g.h2 >= 85 and g.h2 < 88 then 'perf-unpaid' end,
       'perf-' || gen_random_uuid(),
       case when g.off < 0 and g.h2 < 88 then g.starts - interval '5 minutes' end,
       case when g.off < 0 and g.h2 < 88 then g.starts end,
       case when g.off < 0 and g.h2 < 88 then g.starts + (s.dur || ' minutes')::interval end,
       g.starts - interval '3 days'
from (select *, abs(hashtext(h::text || 's')) % 100 as h2 from perf_slots where h % 100 < 50) g
join (select p.service_id, p.i, ps.dur, ps.price from perf_svc p join perf_services ps on ps.i = p.i) s on s.i = 1 + (g.h % 8)
join perf_cust c on c.n = 1 + (g.h % 5000);

insert into booking_events(booking_id, at, kind) select id, created_at, 'created' from bookings where idempotency_key like 'perf-%';

insert into payments(booking_id, method_id, kind, amount_satang, received_at, verified_at, idempotency_key)
select b.id, (select id from payment_methods where code = 'cash'), 'payment', b.price_satang, upper(b.service_during), upper(b.service_during), 'perf-pay-' || b.id
from bookings b where b.idempotency_key like 'perf-%' and b.status = 'completed' and b.charge_reason is distinct from 'perf-unpaid';

commit;
analyze;
