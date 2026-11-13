-- 0023_public_profile_catalog: public therapist profile fields, the online-bookable flag on services, and the online.* settings.

alter table therapists
  add column public boolean not null default false,
  add column bio_th text,
  add column bio_en text,
  add column specialties text[] not null default '{}';

alter table services add column bookable_online boolean not null default false;

create or replace function private.setting_spec()
  returns table (key text, kind text, lo int, hi int, def jsonb)
  language sql immutable
as $$
  values
    ('ops.arrival_window_min',       'int',    5,  240, '60'::jsonb),
    ('ops.late_arrival_min',         'int',    1,  120, '10'::jsonb),
    ('ops.ending_soon_min',          'int',    1,   60, '10'::jsonb),
    ('ops.room_prep_warn_min',       'int',    1,  120, '15'::jsonb),
    ('ops.reserved_lead_min',        'int',    0,  240, '30'::jsonb),
    ('policy.cancel_free_min',       'int',    0, 10080, '120'::jsonb),
    ('policy.cancel_fee_percent',    'int',    0,  100, '0'::jsonb),
    ('policy.no_show_fee_percent',   'int',    0,  100, '0'::jsonb),
    ('payments.receptionist_can_record', 'bool', null, null, 'true'::jsonb),
    ('reports.manager_can_view',     'bool',   null, null, 'true'::jsonb),
    ('retention.inactive_months',    'int',    6,  120, '24'::jsonb),
    ('retention.audit_months',       'int',   12,  120, '24'::jsonb),
    ('retention.prune_enabled',      'bool',   null, null, 'false'::jsonb),
    ('online.enabled',               'bool', null, null, 'false'::jsonb),
    ('online.max_upcoming',          'int',    1,   10, '2'::jsonb),
    ('online.min_lead_min',          'int',    0, 1440, '120'::jsonb),
    ('online.max_ahead_days',        'int',    1,  365, '30'::jsonb),
    ('online.cancel_cutoff_min',     'int',    0, 1440, '240'::jsonb)
$$;
