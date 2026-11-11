-- Local development seed. Logins are local only; all passwords are 'local-dev-only'.
-- 6 rooms, 4 therapists, 5 services, shifts for the next 14 Bangkok days.

do $$
declare
  u record;
  v_std uuid; v_vip uuid;
  v_rooms uuid[];
  v_svc uuid[];
  v_th uuid[];
  v_id uuid;
  d int;
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  -- accounts ---------------------------------------------------------------
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'owner@spa.test',     'owner'::app_role,        'Owner'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'manager@spa.test',   'manager'::app_role,      'Manager'),
      ('00000000-0000-4000-8000-000000000003'::uuid, 'reception@spa.test', 'receptionist'::app_role, 'Reception'),
      ('00000000-0000-4000-8000-000000000004'::uuid, 'therapist@spa.test', 'therapist'::app_role,    'Therapist')
    ) as t(id, email, role, name)
  loop
    insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('local-dev-only', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    insert into staff(user_id, role, display_name) values (u.id, u.role, u.name);
  end loop;

  -- rooms ------------------------------------------------------------------
  insert into room_categories(name_th, name_en, sort_order) values ('มาตรฐาน', 'Standard', 1) returning id into v_std;
  insert into room_categories(name_th, name_en, sort_order) values ('วีไอพี', 'VIP', 2) returning id into v_vip;
  for d in 1..6 loop
    insert into rooms(code, display_name, category_id, floor, zone, turnover_min, sort_order)
    values ('R' || d, 'ห้อง ' || d, case when d <= 4 then v_std else v_vip end, '1',
            case when d <= 4 then 'A' else 'B' end, 15, d)
    returning id into v_id;
    v_rooms := v_rooms || v_id;
  end loop;

  -- services ---------------------------------------------------------------
  for u in
    select * from (values
      ('นวดไทย 60 นาที', 'Thai massage 60', 60, 80000),
      ('นวดไทย 90 นาที', 'Thai massage 90', 90, 120000),
      ('นวดน้ำมัน 60 นาที', 'Oil massage 60', 60, 100000),
      ('นวดน้ำมัน 90 นาที', 'Oil massage 90', 90, 150000),
      ('นวดเท้า 45 นาที', 'Foot massage 45', 45, 50000)
    ) as t(name_th, name_en, dur, price)
  loop
    insert into services(name_th, name_en, duration_min, price_satang, sort_order)
    values (u.name_th, u.name_en, u.dur, u.price, coalesce(array_length(v_svc, 1), 0) + 1)
    returning id into v_id;
    v_svc := v_svc || v_id;
  end loop;

  -- therapists -------------------------------------------------------------
  for d in 1..4 loop
    insert into therapists(staff_user_id, display_name, employment_type, sort_order)
    values (case when d = 1 then '00000000-0000-4000-8000-000000000004'::uuid end,
            'นักบำบัด ' || d, case when d <= 3 then 'employee' else 'freelance' end, d)
    returning id into v_id;
    v_th := v_th || v_id;
    insert into therapist_services(therapist_id, service_id) select v_id, unnest(v_svc);
    for u in select generate_series(0, 13) as n loop
      insert into therapist_shifts(therapist_id, during)
      values (v_id, tstzrange(((today + u.n) + time '10:00') at time zone 'Asia/Bangkok',
                              ((today + u.n) + time '22:00') at time zone 'Asia/Bangkok'));
    end loop;
  end loop;
end $$;
