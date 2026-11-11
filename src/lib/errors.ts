export const ERROR_CODES = [
  'NOT_AUTHORIZED', 'THERAPIST_BUSY', 'POSITION_TAKEN', 'ROOM_OTHER_PARTY', 'THERAPIST_OFF_SHIFT',
  'THERAPIST_TIME_OFF', 'THERAPIST_NOT_QUALIFIED', 'ROOM_BLOCKED', 'ROOM_INCOMPATIBLE', 'RESOURCE_INACTIVE',
  'PAST_START', 'INVALID_TRANSITION', 'STALE_VERSION', 'CONFLICTS_WITH_BOOKINGS', 'ROOM_NOT_READY',
  'INVALID_SETTING', 'INVALID_AMOUNT', 'OVERPAYMENT', 'REFUND_EXCEEDS_PAYMENT', 'CARD_DATA_REFUSED', 'REASON_REQUIRED',
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

/** Separates the translated message from a reference code inside one string (see ErrorText). */
export const REF_MARK = '\u2063';

/** The message to show for a failed action: the translated text plus its reference code when the failure has one. */
export function errorText(message: string, result: object): string {
  const ref = (result as { ref?: unknown }).ref;
  return typeof ref === 'string' ? `${message}${REF_MARK}${ref}` : message;
}
