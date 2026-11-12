import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import { BOOKING_STATUSES } from '@/modules/booking/schema';
import type { RoomStatus } from '@/modules/operations/today';
import { ROOM_STATUS_KEY, bookingStatusStyle, roomStatusStyle } from './status';

const ROOM_STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];

describe('status styles', () => {
  it.each(ROOM_STATUSES)('room %s has dot and chip classes', (s) => {
    const st = roomStatusStyle(s);
    expect(st.dot.length).toBeGreaterThan(0);
    expect(st.chip.length).toBeGreaterThan(0);
  });
  it.each([...BOOKING_STATUSES])('booking %s has chip and card classes', (s) => {
    const st = bookingStatusStyle(s);
    expect(st.chip.length).toBeGreaterThan(0);
    expect(st.card.length).toBeGreaterThan(0);
  });
  it('every room status key exists under status in en.json', () => {
    for (const s of ROOM_STATUSES) {
      expect(Object.keys(en.status), s).toContain(ROOM_STATUS_KEY[s]);
    }
  });
});
