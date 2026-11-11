import { addDays, mondayOf } from '@/lib/time';

/** `month` is YYYY-MM. Rows are Monday-first weeks of YYYY-MM-DD, padded with the neighbouring months' days. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = addDays(next, -1);
  const weeks: string[][] = [];
  for (let monday = mondayOf(first); monday <= mondayOf(last); monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}
