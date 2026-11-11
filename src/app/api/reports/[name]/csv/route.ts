import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/modules/identity/session';
import { toCsv, type CsvColumn } from '@/lib/csv';
import { loadReports } from '@/modules/reports/data';
import { CSV_NAMES, ReportRange, type CsvName, type ReportData } from '@/modules/reports/schema';

const baht = (satang: number) => (satang / 100).toFixed(2);

/** One report as an Excel-safe CSV. Same access rule as the screen: owner, and manager while allowed. */
export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!(CSV_NAMES as readonly string[]).includes(name)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const session = await getSession();
  if (!session || (session.role !== 'owner' && session.role !== 'manager')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const q = new URL(request.url).searchParams;
  const range = ReportRange.safeParse({ from: q.get('from'), to: q.get('to'), grain: q.get('grain') ?? 'day' });
  if (!range.success) return NextResponse.json({ error: 'bad range' }, { status: 400 });
  const locale = q.get('lang') === 'en' ? 'en' : 'th';

  const data = await loadReports(range.data, locale);
  if (!data.ok) return NextResponse.json({ error: 'forbidden' }, { status: data.code === 'NOT_AUTHORIZED' ? 403 : 500 });

  const t = await getTranslations({ locale, namespace: 'reports.csv' });
  const wd = await getTranslations({ locale, namespace: 'reports.weekdays' });
  const col: Col = (key, value) => ({ header: t(key), value });
  const rate = (v: number | null) => (v === null ? null : v.toFixed(4));
  const csv = build(name as CsvName, data, col, rate, wd);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="spa-${name}-${range.data.from}_${range.data.to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

type Col = <T>(key: string, value: (r: T) => string | number | null) => CsvColumn<T>;
type Rate = (v: number | null) => string | null;

function build(name: CsvName, d: ReportData, col: Col, rate: Rate, wd: (k: string) => string): string {
  switch (name) {
    case 'revenue': {
      const cols: CsvColumn<ReportData['revenue'][number]>[] = [
        col('bucket', (r) => r.bucket), col('booked', (r) => baht(r.bookedSatang)), col('collected', (r) => baht(r.collectedSatang)),
        col('refunded', (r) => baht(r.refundedSatang)), col('net', (r) => baht(r.netCollectedSatang))];
      return toCsv(cols, d.revenue);
    }
    case 'services': {
      const cols: CsvColumn<ReportData['services'][number]>[] = [
        col('service', (r) => r.name), col('completed', (r) => r.completed), col('minutes', (r) => r.minutes), col('booked', (r) => baht(r.bookedSatang))];
      return toCsv(cols, d.services);
    }
    case 'therapists': {
      const cols: CsvColumn<ReportData['therapists'][number]>[] = [
        col('therapist', (r) => r.name), col('completed', (r) => r.completed), col('minutes', (r) => r.minutes), col('booked', (r) => baht(r.bookedSatang))];
      return toCsv(cols, d.therapists);
    }
    case 'rooms': {
      const cols: CsvColumn<ReportData['rooms'][number]>[] = [
        col('room', (r) => r.code), col('zone', (r) => r.zone), col('category', (r) => r.categoryName),
        col('openMinutes', (r) => r.openMinutes), col('bookedMinutes', (r) => r.bookedMinutes), col('utilization', (r) => rate(r.utilization)),
        col('turnovers', (r) => r.turnovers), col('avgTurnoverMin', (r) => (r.avgTurnoverMin === null ? null : r.avgTurnoverMin.toFixed(1))),
        col('onTimeRate', (r) => rate(r.onTimeRate))];
      return toCsv(cols, d.rooms);
    }
    case 'therapist-utilization': {
      const cols: CsvColumn<ReportData['therapistUtil'][number]>[] = [
        col('therapist', (r) => r.name), col('shiftMinutes', (r) => r.shiftMinutes), col('timeOffMinutes', (r) => r.timeOffMinutes),
        col('bookedMinutes', (r) => r.bookedMinutes), col('utilization', (r) => rate(r.utilization))];
      return toCsv(cols, d.therapistUtil);
    }
    case 'peaks': {
      const cols: CsvColumn<ReportData['peaks'][number]>[] = [
        col('weekday', (r) => wd(String(r.dow))), col('hour', (r) => r.hour), col('bookings', (r) => r.bookings)];
      return toCsv(cols, d.peaks);
    }
  }
}
