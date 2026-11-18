-- Pin helper resolution after the live guest-care migration advisor check.
-- These helpers retain their existing bodies and privileges.
alter function private.guard_customer_anonymised() set search_path = public, pg_temp;
alter function private.guard_line_identity_insert() set search_path = public, pg_temp;
alter function private.setting_spec_before_guest_care() set search_path = public, pg_temp;
notify pgrst, 'reload schema';
