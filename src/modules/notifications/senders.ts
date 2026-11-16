import type { Sender } from './dispatch';

/** LINE delivery must not be reported as sent when its sender is unavailable. */
export function routeSender(line: Sender | null, fallback: Sender): Sender {
  return { send: (m) => {
    if (m.channel === 'line') {
      if (!line) return Promise.reject(new Error('LINE_NOT_CONFIGURED'));
      return line.send(m);
    }
    return fallback.send(m);
  } };
}
