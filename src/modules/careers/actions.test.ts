import { test, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
const allow = vi.fn();
vi.mock('@/modules/public/db', () => ({ publicDb: () => ({ from }) }));
vi.mock('@/modules/public/rateLimit', () => ({ allow: (...a: unknown[]) => allow(...a) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': '1.2.3.4' }) }));

beforeEach(() => { insert.mockReset(); from.mockClear(); allow.mockReset(); allow.mockResolvedValue(true); });

const input = { fullName: ' สมชาย ', age: 28, contact: '@somchai', experience: '1_3', hasCertificate: false, workType: 'full_time', skills: '', locale: 'th' } as const;

test('a valid application is saved with trimmed values and an empty skills field stored as null', async () => {
  const { submitApplication } = await import('./actions');
  insert.mockResolvedValue({ error: null });
  expect(await submitApplication(input)).toEqual({ ok: true });
  expect(from).toHaveBeenCalledWith('job_applications');
  expect(insert).toHaveBeenCalledWith({
    full_name: 'สมชาย', age: 28, contact: '@somchai', experience: '1_3', has_certificate: false, work_type: 'full_time', skills: null, locale: 'th',
  });
  expect(allow).toHaveBeenCalledWith('careers:1.2.3.4', 5, 3600);
});

test('invalid input never reaches the database', async () => {
  const { submitApplication } = await import('./actions');
  for (const bad of [{ ...input, age: 19 }, { ...input, fullName: '  ' }, { ...input, experience: 'ten' }, { ...input, workType: 'weekends' }]) {
    expect(await submitApplication(bad as never)).toEqual({ ok: false, code: 'INVALID_INPUT' });
  }
  expect(insert).not.toHaveBeenCalled();
});

test('too many applications from one address are refused', async () => {
  const { submitApplication } = await import('./actions');
  allow.mockResolvedValue(false);
  expect(await submitApplication(input)).toEqual({ ok: false, code: 'RATE_LIMITED' });
  expect(insert).not.toHaveBeenCalled();
});

test('a database error is reported as a failure', async () => {
  const { submitApplication } = await import('./actions');
  insert.mockResolvedValue({ error: { message: 'boom', code: 'XX000' } });
  expect((await submitApplication(input)).ok).toBe(false);
});
