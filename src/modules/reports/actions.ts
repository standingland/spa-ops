'use server';

import { getLocale } from 'next-intl/server';
import { roleOrNull } from '@/modules/identity/session';
import { fail } from '@/lib/action';
import { loadReports } from './data';
import { ReportRange, type ReportData } from './schema';

/** Owner, and manager while the owner allows it (the database decides). */
export async function getReports(range: ReportRange): Promise<({ ok: true } & ReportData) | { ok: false; code: string }> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const p = ReportRange.safeParse(range);
  if (!p.success) return fail('INVALID_INPUT');
  return loadReports(p.data, await getLocale());
}
