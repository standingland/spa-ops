import { codeFromError } from './errors';
import { log, newErrorRef } from './log';

export type Failure = { ok: false; code: string; ref?: string };
export type ActionResult<T extends object = object> = ({ ok: true; id: string } & T) | Failure;

export const fail = (code: string): { ok: false; code: string } => ({ ok: false, code });
export const done = (id: string): { ok: true; id: string } => ({ ok: true, id });

/**
 * Maps a Supabase/PostgREST error to a public code. An unexpected error gets a short reference: staff see the
 * reference, the log holds the detail under the same reference (and never any customer data).
 */
export function failFrom(err: { message?: string; code?: string }): Failure {
  if (err.code === '23505') return fail('DUPLICATE');
  if (err.code === '23P01') return fail('OVERLAP');
  const code = codeFromError(err);
  if (code !== 'UNKNOWN') return fail(code);
  const ref = newErrorRef();
  log('error', 'action.unknown_error', { ref, code: err.code ?? null, message: err.message ?? null });
  return { ok: false, code, ref };
}
