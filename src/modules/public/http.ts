export const SESSION_COOKIE = 'guest_session';
export const STATE_COOKIE_PREFIX = 'line_state_';
/** One cookie per sign-in, named by a short form of its nonce, so two tabs signing in at once never overwrite each other. */
export const stateCookieName = (nonce: string) => STATE_COOKIE_PREFIX + nonce.slice(0, 12);
export const SESSION_TTL_SEC = 12 * 3600;
export const STATE_TTL_SEC = 1800;   // a first LINE sign-in (password, friend-add) can take a while
export const CANCEL_TOKEN_TTL_SEC = 45 * 86400;

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
});

/** Only the public book pages may be a return target: never another path, host or protocol. */
export function safeReturnTo(p: string | null | undefined): string | null {
  return p && /^\/(th|en)\/book(\/[A-Za-z0-9-]{1,64})?$/.test(p) ? p : null;
}

/** What the guest had chosen, carried through the LINE round trip. Only these keys, short values. */
export const SELECTION_KEYS = ['therapistId', 'serviceId', 'start', 'day'] as const;
export function pickSelection(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SELECTION_KEYS) { const v = params.get(k); if (v && v.length <= 64) out[k] = v; }
  return out;
}

/**
 * The caller's address for rate limiting. Platform headers a client cannot set come first; otherwise the LAST forwarded
 * address (the proxy appends the real peer; anything before it can be forged by the client).
 */
export function clientIp(h: Headers): string {
  const platform = h.get('x-vercel-forwarded-for') || h.get('x-real-ip');
  if (platform) return platform.trim();
  const parts = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

/** A cancel link lasts until a day after the booking starts, and never less than 45 days (bookings can be made far ahead). */
export function cancelTtlSec(startsAtIso: string, nowMs: number = Date.now()): number {
  const start = Date.parse(startsAtIso);
  if (Number.isNaN(start)) return CANCEL_TOKEN_TTL_SEC;
  return Math.max(CANCEL_TOKEN_TTL_SEC, Math.ceil((start - nowMs) / 1000) + 86400);
}
