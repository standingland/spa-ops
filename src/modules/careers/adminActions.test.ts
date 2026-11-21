import { test, expect, vi, beforeEach } from 'vitest';

const role = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const select = vi.fn();
vi.mock('@/modules/identity/session', () => ({ roleOrNull: (...a: unknown[]) => role(...a) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ update: (v: unknown) => { update(v); return { eq: (...a: unknown[]) => { eq(...a); return { select }; } }; } }) }),
}));

const ID = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { role.mockReset(); update.mockReset(); eq.mockReset(); select.mockReset(); role.mockResolvedValue({ userId: 'u', role: 'manager' }); });

test('staff without the owner or manager role cannot update', async () => {
  const { updateApplication } = await import('./adminActions');
  role.mockResolvedValue(null);
  expect(await updateApplication(ID, { status: 'hired', correspondence: '' })).toEqual({ ok: false, code: 'NOT_AUTHORIZED' });
  expect(update).not.toHaveBeenCalled();
});

test('an update saves the status and the trimmed note, and an empty note is stored as null', async () => {
  const { updateApplication } = await import('./adminActions');
  select.mockResolvedValue({ data: [{ id: ID }], error: null });
  expect(await updateApplication(ID, { status: 'interview', correspondence: '  โทรแล้ว  ' })).toEqual({ ok: true, id: ID });
  expect(update).toHaveBeenCalledWith({ status: 'interview', correspondence: 'โทรแล้ว' });
  expect(eq).toHaveBeenCalledWith('id', ID);
  await updateApplication(ID, { status: 'new', correspondence: '   ' });
  expect(update).toHaveBeenLastCalledWith({ status: 'new', correspondence: null });
});

test('bad ids and statuses are rejected before the database', async () => {
  const { updateApplication } = await import('./adminActions');
  expect(await updateApplication('nope', { status: 'new', correspondence: '' })).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(await updateApplication(ID, { status: 'maybe' as never, correspondence: '' })).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(update).not.toHaveBeenCalled();
});

test('an update that touches no row is refused', async () => {
  const { updateApplication } = await import('./adminActions');
  select.mockResolvedValue({ data: [], error: null });
  expect(await updateApplication(ID, { status: 'new', correspondence: '' })).toEqual({ ok: false, code: 'NOT_AUTHORIZED' });
});
