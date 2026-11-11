import type { RoomState, RoomStatus } from './today';

export type RoomTile = RoomState & { code: string; displayName: string; zone: string | null; floor: string | null; categoryId: string; notes: string | null };
export type RoomFilter = { q?: string; status?: RoomStatus; categoryId?: string; zone?: string };

/** q matches the code or the display name, case-insensitively. */
export function filterRooms(tiles: RoomTile[], f: RoomFilter): RoomTile[] {
  const q = f.q?.trim().toLowerCase();
  return tiles.filter((r) =>
    (!q || r.code.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q)) &&
    (!f.status || r.status === f.status) &&
    (!f.categoryId || r.categoryId === f.categoryId) &&
    (!f.zone || r.zone === f.zone));
}

export function summarizeRooms(tiles: RoomTile[]): {
  total: number; byStatus: Record<RoomStatus, number>; byZone: { zone: string | null; total: number; occupied: number }[];
} {
  const byStatus: Record<RoomStatus, number> = { available: 0, reserved: 0, occupied: 0, cleaning: 0, out_of_service: 0 };
  const zones = new Map<string | null, { zone: string | null; total: number; occupied: number }>();
  for (const r of tiles) {
    byStatus[r.status]++;
    const z = zones.get(r.zone) ?? { zone: r.zone, total: 0, occupied: 0 };
    z.total++;
    if (r.status === 'occupied') z.occupied++;
    zones.set(r.zone, z);
  }
  const byZone = [...zones.values()].sort((a, b) => (a.zone === null ? 1 : b.zone === null ? -1 : a.zone.localeCompare(b.zone)));
  return { total: tiles.length, byStatus, byZone };
}
