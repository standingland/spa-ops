import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/env';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';

/** Called daily by a scheduler. Requires `Authorization: Bearer <CRON_SECRET>`. Deletes nothing unless the owner enabled pruning. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (!bearerMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await createAdminClient().rpc('run_maintenance');
  if (error) {
    log('error', 'maintenance.failed', { code: error.code ?? null });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  const result = data as { enabled: boolean; audit_deleted?: number; outbox_deleted?: number };
  log('info', 'maintenance.run', { enabled: result.enabled, auditDeleted: result.audit_deleted ?? 0, outboxDeleted: result.outbox_deleted ?? 0 });
  return NextResponse.json(result);
}
