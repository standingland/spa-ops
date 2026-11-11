export type Candidate = {
  therapistId: string;
  positionId: string;
  roomId: string;
  therapistMinutesToday: number;
  roomSort: number;
};

/**
 * Orders candidates: preferred therapist first, then lighter workload, then room order,
 * then therapistId and positionId so the result is deterministic.
 * Hard constraints are already applied by `available_candidates`; this only orders.
 */
export function rankAllocations(candidates: Candidate[], prefs: { preferredTherapistId?: string }): Candidate[] {
  const pref = prefs.preferredTherapistId;
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return [...candidates].sort((a, b) => {
    const pa = pref !== undefined && a.therapistId === pref ? 0 : 1;
    const pb = pref !== undefined && b.therapistId === pref ? 0 : 1;
    return (
      pa - pb ||
      a.therapistMinutesToday - b.therapistMinutesToday ||
      a.roomSort - b.roomSort ||
      cmp(a.therapistId, b.therapistId) ||
      cmp(a.positionId, b.positionId)
    );
  });
}
