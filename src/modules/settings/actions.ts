'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { fail, failFrom } from '@/lib/action';
import { SETTING_META, type SettingKey, type Settings } from './schema';

type Result = { ok: true; settings: Settings } | { ok: false; code: string };

/** Any staff role. */
export async function getSettings(): Promise<Result> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_settings');
  if (error) return failFrom(error);
  return { ok: true, settings: data as Settings };
}

/** Owner only. The database re-checks the key and the range. */
export async function saveSetting(key: SettingKey, value: number | boolean): Promise<Result> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  const meta = SETTING_META[key];
  if (!meta || (meta.kind === 'bool') !== (typeof value === 'boolean')) return fail('INVALID_SETTING');
  if (typeof value === 'number' && !Number.isFinite(value)) return fail('INVALID_SETTING');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_setting', { p_key: key, p_value: value });
  if (error) return failFrom(error);
  return { ok: true, settings: data as Settings };
}
