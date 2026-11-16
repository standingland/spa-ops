import { createHmac, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
const MAX_BYTES = 1024 * 1024;

/** Receive LINE verification and events. Events are intentionally not stored or acted on yet. */
export async function POST(request: Request) {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim();
  if (!secret) return new Response('Webhook not configured', { status: 503 });
  const signature = request.headers.get('x-line-signature');
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return new Response('Invalid signature', { status: 401 });

  const reader = request.body?.getReader();
  if (!reader) return new Response('Invalid body', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); return new Response('Body too large', { status: 413 }); }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  const expected = createHmac('sha256', secret).update(body).digest();
  const provided = Buffer.from(signature, 'base64');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return new Response('Invalid signature', { status: 401 });

  try {
    const payload: unknown = JSON.parse(body.toString('utf8'));
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { events?: unknown }).events)) throw new Error();
  } catch { return new Response('Invalid body', { status: 400 }); }
  return new Response('OK', { status: 200 });
}
