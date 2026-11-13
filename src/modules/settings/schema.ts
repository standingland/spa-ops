import type { OpsConfig } from '@/modules/operations/today';

export type Settings = {
  'ops.arrival_window_min': number;
  'ops.late_arrival_min': number;
  'ops.ending_soon_min': number;
  'ops.room_prep_warn_min': number;
  'ops.reserved_lead_min': number;
  'policy.cancel_free_min': number;
  'policy.cancel_fee_percent': number;
  'policy.no_show_fee_percent': number;
  'payments.receptionist_can_record': boolean;
  'reports.manager_can_view': boolean;
  'retention.inactive_months': number;
  'retention.audit_months': number;
  'retention.prune_enabled': boolean;
  'online.enabled': boolean;
  'online.max_upcoming': number;
  'online.min_lead_min': number;
  'online.max_ahead_days': number;
  'online.cancel_cutoff_min': number;
};
export type SettingKey = keyof Settings;

export type SettingMeta =
  | { group: SettingGroup; kind: 'int'; min: number; max: number; unit: 'minutes' | 'percent' | 'months' | 'days' | 'bookings' }
  | { group: SettingGroup; kind: 'bool' };
export type SettingGroup = 'operations' | 'policy' | 'payments' | 'reports' | 'retention' | 'online';
export const SETTING_GROUPS: SettingGroup[] = ['operations', 'policy', 'payments', 'reports', 'retention', 'online'];

/** Mirrors private.setting_spec() in the database, which is what actually enforces these limits. */
export const SETTING_META: Record<SettingKey, SettingMeta> = {
  'ops.arrival_window_min': { group: 'operations', kind: 'int', min: 5, max: 240, unit: 'minutes' },
  'ops.late_arrival_min': { group: 'operations', kind: 'int', min: 1, max: 120, unit: 'minutes' },
  'ops.ending_soon_min': { group: 'operations', kind: 'int', min: 1, max: 60, unit: 'minutes' },
  'ops.room_prep_warn_min': { group: 'operations', kind: 'int', min: 1, max: 120, unit: 'minutes' },
  'ops.reserved_lead_min': { group: 'operations', kind: 'int', min: 0, max: 240, unit: 'minutes' },
  'policy.cancel_free_min': { group: 'policy', kind: 'int', min: 0, max: 10080, unit: 'minutes' },
  'policy.cancel_fee_percent': { group: 'policy', kind: 'int', min: 0, max: 100, unit: 'percent' },
  'policy.no_show_fee_percent': { group: 'policy', kind: 'int', min: 0, max: 100, unit: 'percent' },
  'payments.receptionist_can_record': { group: 'payments', kind: 'bool' },
  'reports.manager_can_view': { group: 'reports', kind: 'bool' },
  'retention.inactive_months': { group: 'retention', kind: 'int', min: 6, max: 120, unit: 'months' },
  'retention.audit_months': { group: 'retention', kind: 'int', min: 12, max: 120, unit: 'months' },
  'retention.prune_enabled': { group: 'retention', kind: 'bool' },
  'online.enabled': { group: 'online', kind: 'bool' },
  'online.max_upcoming': { group: 'online', kind: 'int', min: 1, max: 10, unit: 'bookings' },
  'online.min_lead_min': { group: 'online', kind: 'int', min: 0, max: 1440, unit: 'minutes' },
  'online.max_ahead_days': { group: 'online', kind: 'int', min: 1, max: 365, unit: 'days' },
  'online.cancel_cutoff_min': { group: 'online', kind: 'int', min: 0, max: 1440, unit: 'minutes' },
};
export const SETTING_KEYS = Object.keys(SETTING_META) as SettingKey[];

/** Message id for a setting: dots are path separators in message files, so they become underscores. */
export const settingId = (key: SettingKey) => key.replace('.', '_');

export function opsConfigFrom(s: Settings): OpsConfig {
  return {
    arrivalWindowMin: s['ops.arrival_window_min'],
    lateArrivalMin: s['ops.late_arrival_min'],
    endingSoonMin: s['ops.ending_soon_min'],
    roomPrepWarnMin: s['ops.room_prep_warn_min'],
  };
}
