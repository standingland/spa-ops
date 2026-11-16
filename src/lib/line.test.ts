import { test, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_KEY: 'pk', SUPABASE_SERVICE_KEY: 'sk',
  LINE_LOGIN_CHANNEL_ID: '123', LINE_LOGIN_CHANNEL_SECRET: 'sec', LINE_MESSAGING_TOKEN: 'tok',
  PUBLIC_BASE_URL: 'https://spa.example.com', PUBLIC_TOKEN_SECRET: 't'.repeat(32),
};
const saved = { ...process.env };
beforeEach(() => { Object.assign(process.env, ENV); });
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('login URL carries state, nonce, scope, redirect and bot_prompt', async () => {
  const { buildLoginUrl } = await import('./line');
  const u = new URL(buildLoginUrl({ state: 'S', nonce: 'N', redirectUri: 'https://spa.example.com/api/line/callback' }));
  expect(u.origin + u.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
  expect(Object.fromEntries(u.searchParams)).toEqual({
    response_type: 'code', client_id: '123', redirect_uri: 'https://spa.example.com/api/line/callback',
    state: 'S', nonce: 'N', scope: 'profile openid', bot_prompt: 'aggressive',
  });
});
test('exchangeCode returns the LINE user id and name', async () => {
  const { exchangeCode } = await import('./line');
  const f = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(json({ id_token: 'IDT' }))
    .mockResolvedValueOnce(json({ sub: 'U1', name: 'Nok', nonce: 'N' }));
  expect(await exchangeCode('CODE', 'https://spa.example.com/api/line/callback', 'N')).toEqual({ lineUserId: 'U1', name: 'Nok' });
  expect(String(f.mock.calls[0][0])).toBe('https://api.line.me/oauth2/v2.1/token');
  expect(String(f.mock.calls[1][0])).toBe('https://api.line.me/oauth2/v2.1/verify');
});
test('exchangeCode rejects a wrong nonce and a failing token call', async () => {
  const { exchangeCode } = await import('./line');
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ id_token: 'IDT' })).mockResolvedValueOnce(json({ sub: 'U1', name: 'Nok', nonce: 'OTHER' }));
  await expect(exchangeCode('CODE', 'r', 'N')).rejects.toThrow('LINE_AUTH_FAILED');
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
  await expect(exchangeCode('BAD', 'r', 'N')).rejects.toThrow('LINE_AUTH_FAILED');
});
test('pushLine posts a text message and throws when LINE answers 403', async () => {
  const { pushLine } = await import('./line');
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}));
  await pushLine('U1', 'hello');
  const [url, init] = f.mock.calls[0];
  expect(String(url)).toBe('https://api.line.me/v2/bot/message/push');
  expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ to: 'U1', messages: [{ type: 'text', text: 'hello' }] });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: 'blocked' }, 403));
  await expect(pushLine('U1', 'x')).rejects.toThrow(/403/);
});
test('lineSender only sends on the line channel', async () => {
  const { lineSender } = await import('./line');
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
  await expect(lineSender.send({ channel: 'sms', to: '080', text: 'x' })).rejects.toThrow();
  await lineSender.send({ channel: 'line', to: 'U1', text: 'x' });
  expect(f).toHaveBeenCalledTimes(1);
});

test('lineSender pushes the Flex confirmation as a LINE message', async () => {
  const { lineSender } = await import('./line');
  const { bookingConfirmationFlex } = await import('@/modules/notifications/flex');
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
  const flex = bookingConfirmationFlex('2030-01-15T03:00:00Z', 'Banyan Spa', 'https://spa.example.com/cancel');
  await lineSender.send({ channel: 'line', to: 'U1', text: 'fallback', flex });
  const init = f.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(init.body))).toEqual({ to: 'U1', messages: [flex] });
});
