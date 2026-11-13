import type { BoardRow } from '@/modules/booking/actions';
import type { Span } from './today';

export type NowState = 'in_treatment' | 'on_break' | 'free';

/** Who is on shift at `now`, what they are doing and, if in treatment, which room. Shared by Today and the Therapists page. */
export function therapistsNow(input: { now: string; shifts: Span[]; timeOff: Span[]; rows: BoardRow[] }): { therapistId: string; state: NowState; roomId: string | null }[] {
  const now = Date.parse(input.now);
  const contains = (s: Span) => Date.parse(s.start) <= now && now < Date.parse(s.end);
  const inTreatment = input.rows.filter((r) => r.status === 'in_treatment');
  const onShift = [...new Set(input.shifts.filter(contains).map((s) => s.therapistId))].sort();
  return onShift.map((id) => {
    const busy = inTreatment.find((r) => r.therapistId === id);
    if (busy) return { therapistId: id, state: 'in_treatment' as const, roomId: busy.roomId };
    const onBreak = input.timeOff.some((o) => o.therapistId === id && contains(o));
    return { therapistId: id, state: onBreak ? ('on_break' as const) : ('free' as const), roomId: null };
  });
}
