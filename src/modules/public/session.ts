import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed, expiring tokens for the public page: guest session, LINE login state, and cancel links. HMAC-SHA256 with PUBLIC_TOKEN_SECRET. */

const secret = () => {
  const s = process.env.PUBLIC_TOKEN_SECRET;
  if (!s) throw new Error('PUBLIC_TOKEN_SECRET_MISSING');
  return s;
};
const mac = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');
const nowSec = () => Date.now() / 1000;

function sign(payload: Record<string, unknown>, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: nowSec() + ttlSec })).toString('base64url');
  return `${body}.${mac(body)}`;
}

/** The payload when the signature matches, the token has not expired and it is of the expected kind; otherwise null. */
function open(token: string, kind: string, ignoreExpiry = false): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (p.k !== kind || typeof p.exp !== 'number' || (!ignoreExpiry && p.exp < nowSec())) return null;
    return p;
  } catch { return null; }
}

export type Guest = { lineUserId: string; name: string };

export const signSession = (g: Guest, ttlSec: number) => sign({ k: 'session', lineUserId: g.lineUserId, name: g.name }, ttlSec);
export function verifySession(token: string): Guest | null {
  const p = open(token, 'session');
  return p && typeof p.lineUserId === 'string' && typeof p.name === 'string' ? { lineUserId: p.lineUserId, name: p.name } : null;
}

export const signCancelToken = (bookingId: string, ttlSec: number) => sign({ k: 'cancel', b: bookingId }, ttlSec);
export function verifyCancelToken(token: string): string | null {
  const p = open(token, 'cancel');
  return p && typeof p.b === 'string' ? p.b : null;
}

/** What survives the trip to LINE and back: the nonce to check, where to return, and what the guest had chosen. */
export type LoginState = { nonce: string; returnTo: string; selection?: Record<string, string> };
export const signState = (s: LoginState, ttlSec: number) => sign({ k: 'state', nonce: s.nonce, returnTo: s.returnTo, selection: s.selection }, ttlSec);
export function verifyState(token: string): LoginState | null { return readState(token, false); }

/**
 * The same, but a validly signed state that has expired is still read. Used ONLY to send a guest back to the page and choices
 * they came from when their sign-in could not be completed; it never authenticates anyone.
 */
export function peekState(token: string): LoginState | null { return readState(token, true); }

function readState(token: string, ignoreExpiry: boolean): LoginState | null {
  const p = open(token, 'state', ignoreExpiry);
  if (!p || typeof p.nonce !== 'string' || typeof p.returnTo !== 'string') return null;
  return { nonce: p.nonce, returnTo: p.returnTo, ...(p.selection ? { selection: p.selection as Record<string, string> } : {}) };
}
