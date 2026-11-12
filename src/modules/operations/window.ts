import { bangkokDay, bangkokDayRange } from '@/lib/time';

/** The booking_board range Today reads: from 12 hours before today's Bangkok day (late treatments that overran) to its end. */
export function boardWindow(nowIso: string): { from: string; to: string } {
  const range = bangkokDayRange(bangkokDay(nowIso));
  return { from: new Date(new Date(range.from).getTime() - 12 * 3600000).toISOString(), to: range.to };
}
