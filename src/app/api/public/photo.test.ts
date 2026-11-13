import { test, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const download = vi.fn();
vi.mock('@/modules/public/db', () => ({ publicDb: () => ({ rpc, storage: { from: () => ({ download }) } }) }));
const allow = vi.fn(async () => true);
vi.mock('@/modules/public/rateLimit', () => ({ allow: (...a: unknown[]) => (allow as unknown as (...x: unknown[]) => Promise<boolean>)(...a) }));

beforeEach(() => { rpc.mockReset(); download.mockReset(); allow.mockReset(); allow.mockResolvedValue(true); });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ID = '11111111-1111-4111-8111-111111111111';

test('the photo route returns 404 when the database gives no path (therapist not public)', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  rpc.mockResolvedValue({ data: null, error: null });
  const r = await GET(new Request('https://x.test/'), ctx(ID));
  expect(r.status).toBe(404);
  expect(download).not.toHaveBeenCalled();
});
test('the photo route returns 404 for a malformed id without asking the database', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  expect((await GET(new Request('https://x.test/'), ctx('not-a-uuid'))).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});
test('the photo route streams the stored image with a short cache and no sniffing', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  rpc.mockResolvedValue({ data: 'x.jpg', error: null });
  download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), error: null });
  const r = await GET(new Request('https://x.test/'), ctx(ID));
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('image/jpeg');
  expect(r.headers.get('cache-control')).toBe('public, max-age=60');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(rpc).toHaveBeenCalledWith('public_therapist_photo_path', { p_therapist_id: ID });
  expect(download).toHaveBeenCalledWith('x.jpg');
});
test('the photo route returns 404 when the file is gone from storage', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  rpc.mockResolvedValue({ data: 'x.jpg', error: null });
  download.mockResolvedValue({ data: null, error: { message: 'not found' } });
  expect((await GET(new Request('https://x.test/'), ctx(ID))).status).toBe(404);
});

test('the photo route is rate limited per caller and answers 429 without touching the database', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  allow.mockResolvedValue(false);
  const r = await GET(new Request('https://x.test/', { headers: { 'x-real-ip': '1.2.3.4' } }), ctx(ID));
  expect(r.status).toBe(429);
  expect(rpc).not.toHaveBeenCalled();
});
test('the photo route sends the stored type, so a PNG is not labelled JPEG', async () => {
  const { GET } = await import('./therapists/[id]/photo/route');
  rpc.mockResolvedValue({ data: 'x.png', error: null });
  download.mockResolvedValue({ data: new Blob([new Uint8Array([1])], { type: 'image/png' }), error: null });
  expect((await GET(new Request('https://x.test/'), ctx(ID))).headers.get('content-type')).toBe('image/png');
});
