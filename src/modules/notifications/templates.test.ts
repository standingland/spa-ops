import { test, expect } from 'vitest';
import { renderTemplate } from './templates';

test('the confirmed text is exact, in Bangkok time, and says nothing about the visit', () => {
  const s = renderTemplate('booking_confirmed', { starts_at: '2030-01-15T03:00:00Z' }, 'th', 'Studio');
  expect(s).toBe('Studio: ยืนยันนัดหมายของคุณ วันที่ 15/01/2030 เวลา 10:00 น.');
  for (const k of ['booking_confirmed', 'booking_changed', 'booking_cancelled'] as const)
    for (const l of ['th', 'en'] as const)
      expect(renderTemplate(k, { starts_at: '2030-01-15T03:00:00Z' }, l, 'Studio')).not.toMatch(/นวด|สปา|massage|spa|therap/i);
});
test('the changed and cancelled texts are exact', () => {
  expect(renderTemplate('booking_changed', { starts_at: '2030-01-15T17:30:00Z' }, 'th', 'Studio')).toBe('Studio: นัดหมายของคุณเปลี่ยนเป็นวันที่ 16/01/2030 เวลา 00:30 น.');
  expect(renderTemplate('booking_cancelled', { starts_at: '2030-01-15T03:00:00Z' }, 'th', 'Studio')).toBe('Studio: นัดหมายวันที่ 15/01/2030 เวลา 10:00 น. ถูกยกเลิกแล้ว');
});
test('English mirrors the Thai texts', () => {
  expect(renderTemplate('booking_confirmed', { starts_at: '2030-01-15T03:00:00Z' }, 'en', 'Studio')).toBe('Studio: Your appointment is confirmed for 15/01/2030 at 10:00.');
});
