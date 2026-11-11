import { test, expect } from 'vitest';
import { opsConfigFrom, SETTING_KEYS, SETTING_META, settingId, type Settings } from './schema';
import th from '../../../messages/th.json';
import en from '../../../messages/en.json';

const base = Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTING_META[k].kind === 'bool' ? true : 1])) as unknown as Settings;

test('opsConfigFrom maps the four ops thresholds field for field', () => {
  const s = { ...base, 'ops.arrival_window_min': 11, 'ops.late_arrival_min': 22, 'ops.ending_soon_min': 33, 'ops.room_prep_warn_min': 44, 'ops.reserved_lead_min': 99 };
  expect(opsConfigFrom(s)).toEqual({ arrivalWindowMin: 11, lateArrivalMin: 22, endingSoonMin: 33, roomPrepWarnMin: 44 });
});
test('every setting has a label in both languages', () => {
  expect(SETTING_KEYS).toHaveLength(13);
  for (const k of SETTING_KEYS) {
    expect((th.settings.fields as Record<string, string>)[settingId(k)], `th ${k}`).toBeTruthy();
    expect((en.settings.fields as Record<string, string>)[settingId(k)], `en ${k}`).toBeTruthy();
  }
});
