/** What the booking panel does after the server refuses a booking, as data so it can be tested. */
export function afterBookError(code: string): { clearStart: boolean; reload: boolean; signedOut: boolean } {
  if (code === 'SLOT_TAKEN' || code === 'ONLINE_CLOSED' || code === 'OUT_OF_WINDOW') return { clearStart: true, reload: true, signedOut: false };
  // the session expired while the page stayed open: show the LINE sign-in again, keeping what the guest chose
  if (code === 'NOT_SIGNED_IN') return { clearStart: false, reload: false, signedOut: true };
  return { clearStart: false, reload: false, signedOut: false };
}
