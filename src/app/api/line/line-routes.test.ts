import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/modules/public/rateLimit', () => ({ allow: async () => true }));
const rpc = vi.fn();
vi.mock('@/modules/public/db', () => ({ publicDb: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: true } }) }) }) }) }) }));

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_KEY: 'pk', SUPABASE_SERVICE_KEY: 'sk',
  LINE_LOGIN_CHANNEL_ID: '123', LINE_LOGIN_CHANNEL_SECRET: 'sec', LINE_MESSAGING_TOKEN: 'tok',
  PUBLIC_BASE_URL: 'https://spa.example.com', PUBLIC_TOKEN_SECRET: 't'.repeat(32),
};
const saved = { ...process.env };
beforeEach(() => { Object.assign(process.env, ENV); });
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.useRealTimers(); });

const cookieOf = (res: Response, name: string) => (res.headers.getSetCookie().find((c) => c.startsWith(name + '=')) ?? '');
/** The per-sign-in state cookie a login response set: its name (carries a short form of the nonce) and its value. */
const stateCookie = (res: Response) => {
  const c = res.headers.getSetCookie().find((x) => x.startsWith('line_state_')) ?? '';
  const [name, value] = c.split(';')[0].split('=');
  return { raw: c, name, value, header: `${name}=${value}` };
};
const req = (url: string, cookie = '') => new NextRequest(url, { headers: cookie ? { cookie } : {} });
const base = 'https://spa.example.com';

test('login redirects to LINE with a state cookie, and refuses a returnTo outside the book pages', async () => {
  const { GET } = await import('./login/route');
  const ok = await GET(req(`${base}/api/line/login?returnTo=/th/book/abc&serviceId=s1&start=2030-01-15T05:00:00Z`));
  expect(ok.status).toBe(307);
  const loc = new URL(ok.headers.get('location')!);
  expect(loc.origin).toBe('https://access.line.me');
  expect(loc.searchParams.get('redirect_uri')).toBe(`${base}/api/line/callback`);
  const c = stateCookie(ok);
  expect(c.raw).toContain('HttpOnly');
  expect(c.raw.toLowerCase()).toContain('samesite=lax');
  expect(c.value).toBe(loc.searchParams.get('state'));

  const { verifyState } = await import('@/modules/public/session');
  for (const bad of ['//evil.example.com', 'https://evil.example.com/th/book', '/th/admin', '/th/book/../admin']) {
    const r = await GET(req(`${base}/api/line/login?returnTo=` + encodeURIComponent(bad)));
    expect(verifyState(stateCookie(r).value)?.returnTo, bad).toBe('/th/book');
  }
});

test('two sign-ins started in two tabs do not overwrite each other: each has its own state cookie', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const a = await login(req(`${base}/api/line/login?returnTo=/th/book/aaa&serviceId=A`));
  const b = await login(req(`${base}/api/line/login?returnTo=/th/book/bbb&serviceId=B`));
  expect(stateCookie(a).name).not.toBe(stateCookie(b).name);
  const both = `${stateCookie(a).header}; ${stateCookie(b).header}`;
  const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
  const { verifyState } = await import('@/modules/public/session');
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id_token: 'I' })).mockResolvedValueOnce(json({ sub: 'U1', name: 'N', nonce: verifyState(stateCookie(a).value)!.nonce }));
  const ra = await GET(req(`${base}/api/line/callback?code=C&state=${stateCookie(a).value}`, both));
  expect(new URL(ra.headers.get('location')!).pathname).toBe('/th/book/aaa');
  expect(new URL(ra.headers.get('location')!).searchParams.get('error')).toBeNull();
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id_token: 'I' })).mockResolvedValueOnce(json({ sub: 'U1', name: 'N', nonce: verifyState(stateCookie(b).value)!.nonce }));
  const rb = await GET(req(`${base}/api/line/callback?code=C&state=${stateCookie(b).value}`, both));
  expect(new URL(rb.headers.get('location')!).pathname).toBe('/th/book/bbb');
  expect(new URL(rb.headers.get('location')!).searchParams.get('error')).toBeNull();
});

test('redirects use PUBLIC_BASE_URL, not the host the request arrived on (a proxy may rewrite it)', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const l = await login(req('http://internal-host:3000/api/line/login?returnTo=/th/book/abc'));
  const c = stateCookie(l);
  const r = await GET(req(`http://internal-host:3000/api/line/callback?code=C&state=FORGED`, c.header));
  expect(new URL(r.headers.get('location')!).origin).toBe(base);
  const closed = await login(req('http://internal-host:3000/api/line/login?returnTo=/th/book/abc&serviceId=s1'));
  expect(new URL(closed.headers.get('location')!).origin).toBe('https://access.line.me');
});

test('callback with a wrong state goes back to the book page with an error and sets no session', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const l = await login(req(`${base}/api/line/login?returnTo=/th/book/abc&serviceId=s1`));
  const r = await GET(req(`${base}/api/line/callback?code=C&state=FORGED`, stateCookie(l).header));
  const to = new URL(r.headers.get('location')!);
  expect(to.pathname).toBe('/th/book');          // a forged state proves nothing, so no choices are trusted from it
  expect(to.searchParams.get('error')).toBe('login');
  expect(cookieOf(r, 'guest_session')).toBe('');
});

test('callback with no state cookie falls back to /th/book with an error and no session', async () => {
  const { GET } = await import('./callback/route');
  const r0 = await GET(req(`${base}/api/line/callback?code=C&state=X`));
  expect(new URL(r0.headers.get('location')!).pathname).toBe('/th/book');
  expect(cookieOf(r0, 'guest_session')).toBe('');
});

test('callback with a valid state signs the guest in and returns to the page with their choices', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const l = await login(req(`${base}/api/line/login?returnTo=/th/book/abc&serviceId=s1&start=2030-01-15T05:00:00Z`));
  const c = stateCookie(l);
  const { verifyState, verifySession } = await import('@/modules/public/session');
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id_token: 'IDT' })).mockResolvedValueOnce(json({ sub: 'U1', name: 'Nok', nonce: verifyState(c.value)!.nonce }));
  const r = await GET(req(`${base}/api/line/callback?code=C&state=${c.value}`, c.header));
  const to = new URL(r.headers.get('location')!);
  expect(to.pathname).toBe('/th/book/abc');
  expect(to.searchParams.get('error')).toBeNull();
  expect(to.searchParams.get('serviceId')).toBe('s1');
  const sess = cookieOf(r, 'guest_session');
  expect(sess).toContain('HttpOnly');
  expect(verifySession(sess.split(';')[0].split('=')[1])).toEqual({ lineUserId: 'U1', name: 'Nok' });
  expect(r.headers.getSetCookie().some((x) => x.startsWith(c.name + '=;') || x.startsWith(c.name + '=') && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(x))).toBe(true);   // the state cookie is cleared
});

test('callback when LINE rejects the code goes back with the page and choices, an error, and no session', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const l = await login(req(`${base}/api/line/login?returnTo=/th/book/abc&serviceId=s1`));
  const c = stateCookie(l);
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 400 }));
  const r = await GET(req(`${base}/api/line/callback?code=BAD&state=${c.value}`, c.header));
  const to = new URL(r.headers.get('location')!);
  expect([to.pathname, to.searchParams.get('error'), to.searchParams.get('serviceId')]).toEqual(['/th/book/abc', 'login', 's1']);
  expect(cookieOf(r, 'guest_session')).toBe('');
});

test('callback with no cookie (another browser) still returns the guest to their page and choices from the signed state in the address, with no session', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  const l = await login(req(`${base}/api/line/login?returnTo=/en/book/abc&serviceId=s1&start=2030-01-15T05:00:00Z`));
  const state = new URL(l.headers.get('location')!).searchParams.get('state')!;
  const r = await GET(req(`${base}/api/line/callback?code=C&state=${state}`));
  const to = new URL(r.headers.get('location')!);
  expect([to.pathname, to.searchParams.get('serviceId'), to.searchParams.get('error')]).toEqual(['/en/book/abc', 's1', 'login']);
  expect(cookieOf(r, 'guest_session')).toBe('');
});

test('callback after a slow sign-in (state expired) keeps the page and choices but still sets no session', async () => {
  const { GET: login } = await import('./login/route');
  const { GET } = await import('./callback/route');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const l = await login(req(`${base}/api/line/login?returnTo=/en/book/abc&serviceId=s1`));
  const c = stateCookie(l);
  vi.setSystemTime(new Date('2030-01-01T02:00:00Z'));
  const r = await GET(req(`${base}/api/line/callback?code=C&state=${c.value}`, c.header));
  const to = new URL(r.headers.get('location')!);
  expect([to.pathname, to.searchParams.get('serviceId')]).toEqual(['/en/book/abc', 's1']);
  expect(cookieOf(r, 'guest_session')).toBe('');
});

test('callback never redirects to a forged state address: a tampered state falls back to /th/book', async () => {
  const { GET } = await import('./callback/route');
  const forged = Buffer.from(JSON.stringify({ k: 'state', nonce: 'n', returnTo: '/th/book/evil', exp: 9e9 })).toString('base64url') + '.AAAA';
  const r = await GET(req(`${base}/api/line/callback?code=C&state=${forged}`));
  expect(new URL(r.headers.get('location')!).pathname).toBe('/th/book');
});
