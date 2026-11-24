'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import type { Handover } from './schema';
import { handoverSchema } from './schema';

const DESK = ['owner', 'manager', 'receptionist'] as const;

/** Latest closing summaries, newest first. Desk roles only; any failure (including a missing table) yields null. */
export async function listHandovers(limit = 5): Promise<Handover[] | null> {
  if (!(await roleOrNull(...DESK))) return null;
  const { data, error } = await (await createClient())
    .from('shift_handovers')
    .select('id, day, body, author_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return null;
  return data.map((r) => ({ id: r.id, day: r.day, body: r.body, authorName: r.author_name, createdAt: r.created_at }));
}

export async function postHandover(input: unknown): Promise<ActionResult> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const parsed = handoverSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient())
    .from('shift_handovers').insert({ body: parsed.data.body }).select('id').single();
  if (error) return failFrom(error);
  revalidatePath('/[locale]/staff', 'page');
  return done(z.uuid().parse(data.id));
}
