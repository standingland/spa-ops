-- 0008_booking_board: privacy-safe read model for the calendar and shared displays
create function booking_board(p_from timestamptz, p_to timestamptz)
  returns table (
    booking_id uuid, version int, status booking_status, source booking_source,
    starts_at timestamptz, ends_at timestamptz, room_free_at timestamptz,
    therapist_id uuid, room_id uuid, position_id uuid, party_id uuid,
    service_id uuid, customer_id uuid, customer_display_name text)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role app_role := private.current_role();
begin
  if v_role is null or v_role not in ('owner', 'manager', 'receptionist', 'therapist') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select k.id, k.version, k.status, k.source,
         lower(k.service_during), upper(k.service_during), upper(k.room_during),
         k.therapist_id, k.room_id, k.position_id, k.party_id, k.service_id,
         case when v_role = 'therapist' then null else k.customer_id end,
         c.display_name
  from bookings k
  join customers c on c.id = k.customer_id
  where k.service_during && tstzrange(p_from, p_to, '[)')
    and (v_role <> 'therapist' or exists (
          select 1 from therapists t where t.id = k.therapist_id and t.staff_user_id = auth.uid()))
  order by lower(k.service_during), k.id;
end $$;
