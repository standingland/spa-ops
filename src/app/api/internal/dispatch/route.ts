import { NextResponse } from 'next/server';
import { bearerMatches, parseEnv } from '@/lib/env';
import { dispatchPending } from '@/modules/notifications/dispatch';
import { logSender, scheduleGuestCare, supabaseOutbox } from '@/modules/notifications/outbox';
import { routeSender } from '@/modules/notifications/senders';
import { lineSender } from '@/lib/line';

/** Called by a scheduler. Requires `Authorization: Bearer <CRON_SECRET>`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (!bearerMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const line = parseEnv(process.env).line;
  try { if (line) await scheduleGuestCare(); }
  catch { return NextResponse.json({ error: 'guest care scheduling failed' }, { status: 500 }); }
  const result = await dispatchPending(supabaseOutbox(), routeSender(line ? lineSender : null, logSender), { senderName: process.env.NOTIFY_SENDER_NAME ?? 'Studio' });
  return NextResponse.json(result);
}
