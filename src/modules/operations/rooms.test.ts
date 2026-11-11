import { test, expect } from 'vitest';
import { filterRooms, summarizeRooms, type RoomTile } from './rooms';
import type { RoomStatus } from './today';

const blankTile: RoomTile = {
  roomId: '', status: 'available', currentBookingId: null, currentTherapistId: null, currentCustomerDisplayName: null, expectedEnd: null,
  nextBookingId: null, nextStartsAt: null, turnoverStartedAt: null, turnoverDueAt: null, blockKind: null, blockNote: null, openReports: 0,
  code: '', displayName: '', zone: null, floor: null, categoryId: 'c', notes: null,
};
const t = (code: string, status: RoomStatus, zone: string | null = 'A'): RoomTile => ({ ...blankTile, roomId: code, code, displayName: 'ห้อง ' + code, status, zone });

test('search, status and zone filters combine', () => {
  const all = [t('R1', 'available'), t('R2', 'occupied'), t('R12', 'occupied', 'B')];
  expect(filterRooms(all, { q: 'r1' }).map((x) => x.code)).toEqual(['R1', 'R12']);
  expect(filterRooms(all, { q: 'r1', status: 'occupied' }).map((x) => x.code)).toEqual(['R12']);
  expect(filterRooms(all, { zone: 'A', status: 'occupied' }).map((x) => x.code)).toEqual(['R2']);
  expect(filterRooms(all, {})).toHaveLength(3);
});
test('the summary counts by status and by zone', () => {
  const s = summarizeRooms([t('R1', 'available'), t('R2', 'occupied'), t('R3', 'occupied', 'B'), t('R4', 'cleaning', null)]);
  expect(s.total).toBe(4);
  expect([s.byStatus.occupied, s.byStatus.available, s.byStatus.reserved]).toEqual([2, 1, 0]);
  expect(s.byZone).toEqual([{ zone: 'A', total: 2, occupied: 1 }, { zone: 'B', total: 1, occupied: 1 }, { zone: null, total: 1, occupied: 0 }]);
});
test('category filter narrows by category id', () => {
  const a = { ...t('R1', 'available'), categoryId: 'x' };
  expect(filterRooms([a, t('R2', 'available')], { categoryId: 'x' }).map((r) => r.code)).toEqual(['R1']);
});
