const TZ = 'Asia/Bangkok';
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 24-hour Bangkok time, e.g. '10:00'. */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(/^24:/, '00:');
}

/** The Bangkok calendar day (YYYY-MM-DD) of an instant. */
export function bangkokDay(iso: string | Date): string {
  return dayFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** Half-open UTC range [from, to) covering one Bangkok calendar day. */
export function bangkokDayRange(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00+07:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Adds days to a YYYY-MM-DD string (Bangkok has no DST). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00+07:00`);
  return bangkokDay(new Date(d.getTime() + n * 86400000));
}

/** Instant for a Bangkok day and HH:MM. */
export function bangkokInstant(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00+07:00`).toISOString();
}

/** Parses a PostgREST tstzrange string like ["2030-01-15 03:00:00+00","2030-01-15 04:00:00+00") into ISO instants. */
export function parseRange(range: string): { start: string; end: string } {
  const [a, b] = range.slice(1, -1).split(',').map((s) => s.replace(/"/g, '').trim());
  const iso = (s: string) => {
    let x = s.replace(' ', 'T');
    if (/[+-]\d\d$/.test(x)) x += ':00';
    return new Date(x).toISOString();
  };
  return { start: iso(a), end: iso(b) };
}
