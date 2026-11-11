import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/env';
import { dispatchPending } from '@/modules/notifications/dispatch';
import { logSender, supabaseOutbox } from '@/modules/notifications/outbox';

/** Called by a scheduler. Requires `Authorization: Bearer <CRON_SECRET>`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (!bearerMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await dispatchPending(supabaseOutbox(), logSender, { senderName: process.env.NOTIFY_SENDER_NAME ?? 'Studio' });
  return NextResponse.json(result);
}
