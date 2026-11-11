/** What a person typed ("1,500", "99.99") to satang; null for anything else, including negatives. */
export function parseTHB(input: string): number | null {
  const s = input.trim();
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const [baht, frac = ''] = s.replace(/,/g, '').split('.');
  return Number(baht) * 100 + Number(frac.padEnd(2, '0'));
}

/** Money is stored as integer satang. formatTHB(150000) === '฿1,500.00'. */
export function formatTHB(satang: number): string {
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}฿${baht.toLocaleString('en-US')}.${rest}`;
}
