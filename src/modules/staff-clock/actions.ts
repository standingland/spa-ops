'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { clockCodeSchema } from './model';

export async function issueClockCode(): Promise<ActionResult<{ expiresAt: string }>> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const { data, error } = await (await createClient()).rpc('issue_staff_clock_code');
  if (error) return failFrom(error);
  return { ok: true, id: data.code, expiresAt: data.expires_at };
}

export async function recordClock(code: unknown, action: unknown, attempt: unknown): Promise<ActionResult> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const parsed = z.object({ code: clockCodeSchema, action: z.enum(['in', 'out']), attempt: z.uuid() })
    .safeParse({ code, action, attempt });
  if (!parsed.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('record_staff_clock', {
    p_code: parsed.data.code,
    p_action: parsed.data.action,
    p_attempt: parsed.data.attempt,
  });
  if (error?.message === 'CLOCK_CODE_EXPIRED') return fail('CLOCK_CODE_EXPIRED');
  if (error) return failFrom(error);
  revalidatePath('/[locale]/staff/clock', 'page');
  return done(data);
}
