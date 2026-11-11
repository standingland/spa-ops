'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import type { TemplateKey } from './templates';

export type OutboxView = {
  id: string; template: TemplateKey; startsAt: string | null; status: 'pending' | 'failed' | 'sent' | 'dead';
  attempts: number; lastError: string | null; nextAttemptAt: string; createdAt: string;
};

/** Owner and manager. Shows no phone, email or customer name: the outbox holds none. */
export async function listOutbox(filter?: 'pending' | 'failed' | 'dead' | 'sent'): Promise<{ ok: true; rows: OutboxView[] } | { ok: false; code: string }> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  let q = supabase.from('notification_outbox')
    .select('id, template, payload, status, attempts, last_error, next_attempt_at, created_at').order('created_at', { ascending: false }).limit(200);
  if (filter) q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) return failFrom(error);
  return {
    ok: true,
    rows: (data ?? []).map((r) => ({
      id: r.id, template: r.template as TemplateKey, startsAt: (r.payload as { starts_at?: string })?.starts_at ?? null,
      status: r.status, attempts: r.attempts, lastError: r.last_error, nextAttemptAt: r.next_attempt_at, createdAt: r.created_at,
    })),
  };
}

export async function retryNotification(id: string): Promise<ActionResult> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { error } = await supabase.rpc('retry_notification', { p_id: id });
  if (error) return failFrom(error);
  return done(id);
}
