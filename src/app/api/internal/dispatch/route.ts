import { NextResponse } from 'next/server';
import { bearerMatches, parseEnv } from '@/lib/env';
import { dispatchNow } from '@/modules/notifications/now';
import { scheduleGuestCare } from '@/modules/notifications/outbox';

/** Called by a scheduler. Requires `Authorization: Bearer <CRON_SECRET>`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (!bearerMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const line = parseEnv(process.env).line;
  try { if (line) await scheduleGuestCare(); }
  catch { return NextResponse.json({ error: 'guest care scheduling failed' }, { status: 500 }); }
  const result = await dispatchNow();
  return NextResponse.json(result);
}
