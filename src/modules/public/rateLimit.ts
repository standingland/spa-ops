import { publicDb } from './db';

/** True when this hit is within the limit (max hits per key per window). Fails closed: a database error counts as refused. */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await publicDb().rpc('public_rate_hit', { p_key: key, p_window_sec: windowSec, p_max: max });
  return !error && data === true;
}
