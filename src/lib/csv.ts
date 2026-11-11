export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null };

const BOM = '﻿';

function cell(v: string | number | null): string {
  if (v === null) return '';
  let s = typeof v === 'number' ? String(v) : v;
  // A text cell that starts like a formula would run in a spreadsheet; a leading apostrophe keeps it as text.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel-safe CSV: UTF-8 byte-order mark, CRLF lines, quoted cells, and no live formulas. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
