import { createHmac } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { POST } from './route';

const secret = 'messaging-secret';
const request = (body: string, signature?: string) => new Request('https://spa.example/api/line/webhook', {
  method: 'POST', body, headers: signature ? { 'x-line-signature': signature } : {},
});
const sign = (body: string) => createHmac('sha256', secret).update(body).digest('base64');
afterEach(() => vi.unstubAllEnvs());

test('accepts a signed LINE verification and a signed event', async () => {
  vi.stubEnv('LINE_MESSAGING_CHANNEL_SECRET', secret);
  for (const body of ['{"destination":"U1","events":[]}', '{"events":[{"type":"message"}]}']) {
    expect((await POST(request(body, sign(body)))).status).toBe(200);
  }
});
test('rejects missing, malformed, wrong and tampered signatures', async () => {
  vi.stubEnv('LINE_MESSAGING_CHANNEL_SECRET', secret);
  const body = '{"events":[]}';
  for (const signature of [undefined, 'bad', sign('other'), sign(body + ' ')]) {
    expect((await POST(request(body, signature))).status).toBe(401);
  }
});
test('fails closed without a secret, and rejects invalid or oversized bodies', async () => {
  vi.stubEnv('LINE_MESSAGING_CHANNEL_SECRET', '');
  expect((await POST(request('{}', sign('{}')))).status).toBe(503);
  vi.stubEnv('LINE_MESSAGING_CHANNEL_SECRET', secret);
  expect((await POST(request('{}', sign('{}')))).status).toBe(400);
  const large = 'x'.repeat(1024 * 1024 + 1);
  expect((await POST(request(large, sign(large)))).status).toBe(413);
});
