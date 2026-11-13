import type { Sender } from './dispatch';

/** LINE messages go to the LINE sender when one is configured; everything else (and LINE without keys) goes to the fallback. */
export function routeSender(line: Sender | null, fallback: Sender): Sender {
  return { send: (m) => (m.channel === 'line' && line ? line.send(m) : fallback.send(m)) };
}
