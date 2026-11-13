import { test, expect } from 'vitest';
import { afterBookError } from './bookingState';

test('a taken or unbookable time drops the chosen time and reloads the free times', () => {
  for (const code of ['SLOT_TAKEN', 'ONLINE_CLOSED', 'OUT_OF_WINDOW'])
    expect(afterBookError(code), code).toEqual({ clearStart: true, reload: true, signedOut: false });
});
test('an expired or missing session turns the panel back into the LINE sign-in, keeping the choices', () => {
  expect(afterBookError('NOT_SIGNED_IN')).toEqual({ clearStart: false, reload: false, signedOut: true });
});
test('other errors change nothing but the message', () => {
  for (const code of ['TOO_MANY_BOOKINGS', 'RATE_LIMITED', 'UNKNOWN'])
    expect(afterBookError(code), code).toEqual({ clearStart: false, reload: false, signedOut: false });
});
