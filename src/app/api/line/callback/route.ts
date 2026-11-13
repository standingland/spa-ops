import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode, lineConfig } from '@/lib/line';
import { peekState, signSession, verifyState } from '@/modules/public/session';
import { parseEnv } from '@/lib/env';
import { SESSION_COOKIE, SESSION_TTL_SEC, cookieOpts, stateCookieName } from '@/modules/public/http';

/**
 * Where LINE sends the guest back. The state in the URL must equal the signed state cookie (so the sign-in was started
 * from this browser), and the nonce inside it must match LINE's ID token. Every failure returns the guest to the page
 * they came from, with their choices, and never sets a session.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  // The state LINE returned names this sign-in's own cookie (a short form of its nonce), so tabs never share one.
  const returned = q.get('state') ?? '';
  const returnedNonce = peekState(returned)?.nonce;
  const cookieName = returnedNonce ? stateCookieName(returnedNonce) : '';
  const cookieState = (cookieName && request.cookies.get(cookieName)?.value) || '';
  const state = cookieState ? verifyState(cookieState) : null;
  // Only where to send the guest back: a validly signed state, even an expired one. It never authenticates anyone.
  const back = peekState(returned);

  const to = (error?: string) => {
    const u = new URL(back?.returnTo ?? '/th/book', parseEnv(process.env).line?.publicBaseUrl ?? request.url);   // never the host a proxy may have rewritten
    for (const [k, v] of Object.entries(back?.selection ?? {})) u.searchParams.set(k, v);
    if (error) u.searchParams.set('error', error);
    const res = NextResponse.redirect(u);
    if (cookieName) res.cookies.delete(cookieName);
    return res;
  };

  const code = q.get('code');
  if (!state || !code || returned !== cookieState) return to('login');
  try {
    const guest = await exchangeCode(code, `${lineConfig().publicBaseUrl}/api/line/callback`, state.nonce);
    const res = to();
    res.cookies.set(SESSION_COOKIE, signSession(guest, SESSION_TTL_SEC), cookieOpts(SESSION_TTL_SEC));
    return res;
  } catch {
    return to('login');
  }
}
