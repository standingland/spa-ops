export const ERROR_CODES = [
  'NOT_AUTHORIZED', 'THERAPIST_BUSY', 'POSITION_TAKEN', 'ROOM_OTHER_PARTY', 'THERAPIST_OFF_SHIFT',
  'THERAPIST_TIME_OFF', 'THERAPIST_NOT_QUALIFIED', 'ROOM_BLOCKED', 'ROOM_INCOMPATIBLE', 'RESOURCE_INACTIVE',
  'PAST_START', 'INVALID_TRANSITION', 'STALE_VERSION', 'CONFLICTS_WITH_BOOKINGS', 'ROOM_NOT_READY',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Maps a database error code to its message key; anything else maps to errors.UNKNOWN. */
export function errorMessageKey(code: string): string {
  return (ERROR_CODES as readonly string[]).includes(code) ? `errors.${code}` : 'errors.UNKNOWN';
}

/** Extracts a public error code from a Postgres/Supabase error. */
export function codeFromError(err: { message?: string; code?: string } | null | undefined): string {
  const m = err?.message ?? '';
  if ((ERROR_CODES as readonly string[]).includes(m)) return m;
  if (err?.code === '42501') return 'NOT_AUTHORIZED';
  return 'UNKNOWN';
}

/** Like errorMessageKey, but also knows the client-side validation codes. */
export function uiErrorKey(code: string): string {
  return code === 'INVALID_INPUT' || code === 'DUPLICATE' || code === 'OVERLAP' ? `errors.${code}` : errorMessageKey(code);
}
