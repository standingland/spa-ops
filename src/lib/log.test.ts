import { test, expect, vi } from 'vitest';
import { log, newErrorRef, redact } from './log';
import { failFrom } from './action';

function capture(fn: () => void): string {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { out += String(chunk); return true; });
  try { fn(); } finally { spy.mockRestore(); }
  return out;
}

test('a log line is one JSON object with time, level and event', () => {
  const out = capture(() => log('info', 'booking.created', { bookingId: 'b1', ms: 12 }));
  expect(JSON.parse(out)).toMatchObject({ level: 'info', event: 'booking.created', bookingId: 'b1', ms: 12 });
  expect(out.endsWith('\n') && out.trim().includes('\n') === false).toBe(true);
});
test('personal data never reaches the log', () => {
  const r = redact({ customer_display_name: 'คุณเอ', phone: '0810000000', to: 'a@b.co', message: 'duplicate key 0810000000', paymentReference: 'TXN', bookingId: 'b1', count: 3 });
  expect(r).toEqual({ to: '[redacted]', message: '[redacted]', bookingId: 'b1', count: 3 });
});
test('references use the readable alphabet', () => {
  expect(newErrorRef()).toMatch(/^[A-Z2-9]{8}$/);
});
test('an unknown database error gets a reference and a log line; a known one gets neither', () => {
  let f: ReturnType<typeof failFrom> | undefined;
  const out = capture(() => { f = failFrom({ code: 'XX000', message: 'boom' }); });
  expect(f).toMatchObject({ ok: false, code: 'UNKNOWN' });
  expect((f as { ref?: string }).ref).toMatch(/^[A-Z2-9]{8}$/);
  expect(JSON.parse(out)).toMatchObject({ level: 'error', event: 'action.unknown_error', code: 'XX000', ref: (f as { ref?: string }).ref });
  let known: unknown;
  expect(capture(() => { known = failFrom({ message: 'THERAPIST_BUSY' }); })).toBe('');
  expect(known).toEqual({ ok: false, code: 'THERAPIST_BUSY' });
});
