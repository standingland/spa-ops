import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { buildLoginUrl, lineConfig } from '@/lib/line';
import { allow } from '@/modules/public/rateLimit';
import { isOpen } from '@/modules/public/queries';
import { signState } from '@/modules/public/session';
import { STATE_TTL_SEC, clientIp, cookieOpts, pickSelection, safeReturnTo, stateCookieName } from '@/modules/public/http';
import { parseEnv } from '@/lib/env';

/** Starts the LINE sign-in. Remembers where the guest was and what they had chosen, then sends them to LINE. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(q.get('returnTo')) ?? '/th/book';
  const selection = pickSelection(q);
  const back = (error: string) => {
    const u = new URL(returnTo, parseEnv(process.env).line?.publicBaseUrl ?? request.url);   // never the host a proxy may have rewritten
    for (const [k, v] of Object.entries(selection)) u.searchParams.set(k, v);
    u.searchParams.set('error', error);
    return NextResponse.redirect(u);
  };
  // Existing guests may manage appointments even when new online bookings are paused.
  if (!parseEnv(process.env).line || (!/^\/(th|en)\/book\/mine$/.test(returnTo) && !(await isOpen()))) return back('closed');
  if (!(await allow(`login:${clientIp(request.headers)}`, 20, 60))) return back('busy');

  const nonce = randomBytes(16).toString('base64url');
  const state = signState({ nonce, returnTo, selection }, STATE_TTL_SEC);
  const res = NextResponse.redirect(buildLoginUrl({ state, nonce, redirectUri: `${lineConfig().publicBaseUrl}/api/line/callback` }));
  res.cookies.set(stateCookieName(nonce), state, cookieOpts(STATE_TTL_SEC));
  return res;
}
