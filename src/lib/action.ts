import { codeFromError } from './errors';

export type ActionResult<T extends object = object> = ({ ok: true; id: string } & T) | { ok: false; code: string };

export const fail = (code: string): { ok: false; code: string } => ({ ok: false, code });
export const done = (id: string): { ok: true; id: string } => ({ ok: true, id });

/** Maps a Supabase/PostgREST error to a public code. */
export function failFrom(err: { message?: string; code?: string }): { ok: false; code: string } {
  return fail(err.code === '23505' ? 'DUPLICATE' : codeFromError(err));
}
