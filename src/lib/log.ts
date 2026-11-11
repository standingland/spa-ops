export type LogFields = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_KEY = /(name|phone|email|notes?|reference|password|token|authorization|secret|key)$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_DIGITS = /\d{7,}/;

/** Drops fields that may hold personal data and masks values that look like an email address or a phone / card number. */
export function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = typeof v === 'string' && (EMAIL.test(v) || LONG_DIGITS.test(v)) ? '[redacted]' : v;
  }
  return out;
}

/** One JSON line on stdout. Never put customer data in `fields`: redact is a safety net, not a licence. */
export function log(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}): void {
  const safe = redact(fields);
  delete safe.ts; delete safe.level; delete safe.event;
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe })}\n`);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short code shown to staff and written to the log, so a report can be matched to its detail. */
export function newErrorRef(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
