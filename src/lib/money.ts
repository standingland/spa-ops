/** Money is stored as integer satang. formatTHB(150000) === '฿1,500.00'. */
export function formatTHB(satang: number): string {
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}฿${baht.toLocaleString('en-US')}.${rest}`;
}
