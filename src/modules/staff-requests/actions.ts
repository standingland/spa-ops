'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { addDays, bangkokDayRange, bangkokInstant } from '@/lib/time';
import { roleOrNull } from '@/modules/identity/session';
import { nextMonthDays } from './model';

const day = z.iso.date();
const hhmm = z.iso.time({ precision: -1 });
const submission = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sick'), from: day, to: day }).refine((v) => v.to >= v.from),
  z.object({ kind: z.literal('shift'), days: z.array(day).min(1).max(31), start: hhmm, end: hhmm })
    .refine((v) => v.start !== v.end && new Set(v.days).size === v.days.length),
]);

function refreshRequests() {
  revalidatePath('/[locale]/staff', 'page');
  revalidatePath('/[locale]/staff/requests', 'page');
  revalidatePath('/[locale]/admin/staff-requests', 'page');
}

export async function submitStaffRequest(input: unknown): Promise<ActionResult> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const parsed = submission.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT');
  const v = parsed.data;
  let periods: string[];
  if (v.kind === 'sick') {
    periods = [`[${bangkokDayRange(v.from).from},${bangkokDayRange(v.to).to})`];
  } else {
    const allowed = new Set(nextMonthDays(new Date()));
    if (v.days.some((date) => !allowed.has(date))) return fail('OUT_OF_WINDOW');
    periods = v.days.map((date) => {
      const endDay = v.end < v.start ? addDays(date, 1) : date;
      return `[${bangkokInstant(date, v.start)},${bangkokInstant(endDay, v.end)})`;
    });
  }

  const { data, error } = await (await createClient()).from('staff_requests')
    .insert(periods.map((during) => ({ kind: v.kind, during }))).select('id');
  if (error) return failFrom(error);
  if (!data.length) return fail('UNKNOWN');
  refreshRequests();
  return done(data[0].id);
}

export async function decideStaffRequest(id: unknown, decision: unknown): Promise<ActionResult> {
  const parsed = z.object({
    id: z.uuid(), decision: z.enum(['approved', 'rejected', 'withdrawn']),
  }).safeParse({ id, decision });
  if (!parsed.success) return fail('INVALID_INPUT');
  const v = parsed.data;
  const session = v.decision === 'withdrawn' ? await roleOrNull() : await roleOrNull('owner', 'manager');
  if (!session) return fail('NOT_AUTHORIZED');

  const supabase = await createClient();
  const update = supabase.from('staff_requests').update({ status: v.decision }).eq('id', v.id).eq('status', 'pending');
  if (v.decision === 'withdrawn') update.eq('staff_user_id', session.userId);
  const { data, error } = await update.select('id').maybeSingle();
  if (error?.message === 'THERAPIST_NOT_LINKED') return fail('THERAPIST_NOT_LINKED');
  if (error) return failFrom(error);
  if (!data) return fail('INVALID_TRANSITION');

  refreshRequests();
  if (v.decision === 'approved') {
    revalidatePath('/[locale]/admin/therapists', 'page');
    revalidatePath('/[locale]/today', 'page');
  }
  return done(data.id);
}
