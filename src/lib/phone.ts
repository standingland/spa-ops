const STORED = /^(0\d{8,9}|\+\d{6,15})$/;

/** One stored form for a phone number, matching the database rule; null when it cannot be made to fit. */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s\-.()]/g, '');
  let out = raw;
  if (/^\+66\d{8,9}$/.test(raw)) out = '0' + raw.slice(3);
  else if (/^66\d{8,9}$/.test(raw)) out = '0' + raw.slice(2);
  return STORED.test(out) ? out : null;
}
