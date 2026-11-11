import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const headers = { 'cache-control': 'no-store' };

/** Liveness plus database reachability. No sign-in, and nothing in the body but ok. */
export async function GET() {
  try {
    const { data, error } = await (await createClient()).rpc('health_ping');
    if (!error && data === true) return NextResponse.json({ ok: true }, { headers });
  } catch { /* fall through */ }
  return NextResponse.json({ ok: false }, { status: 503, headers });
}
