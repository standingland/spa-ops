import { test, expect, vi, beforeEach } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
vi.mock('@/modules/identity/session', () => ({ roleOrNull: vi.fn(async () => ({ userId: 'u', role: 'owner' })) }));

import { uploadTherapistPhoto } from './actions';

const ID = '3f1d0c1e-8f5e-4c2a-9d4e-0a1b2c3d4e5f';
const form = (file: File | string | null) => {
  const f = new FormData();
  f.set('therapistId', ID);
  if (file !== null) f.set('file', file);
  return f;
};
beforeEach(() => createClient.mockClear());

test('a 0-byte file is refused before any storage or database call', async () => {
  expect(await uploadTherapistPhoto(form(new File([], 'a.jpg', { type: 'image/jpeg' })))).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(createClient).not.toHaveBeenCalled();
});
test('a 513 KB file is refused before any storage or database call', async () => {
  const big = new File([new Uint8Array(512 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' });
  expect(await uploadTherapistPhoto(form(big))).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(createClient).not.toHaveBeenCalled();
});
test('a gif is refused before any storage or database call', async () => {
  expect(await uploadTherapistPhoto(form(new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' })))).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(createClient).not.toHaveBeenCalled();
});
test('a missing file or a bad therapist id is refused', async () => {
  expect(await uploadTherapistPhoto(form(null))).toEqual({ ok: false, code: 'INVALID_INPUT' });
  const f = form(new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }));
  f.set('therapistId', 'nope');
  expect(await uploadTherapistPhoto(f)).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(createClient).not.toHaveBeenCalled();
});
