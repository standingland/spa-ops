import { forbidden } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { bangkokDay } from '@/lib/time';
import { getReports } from '@/modules/reports/actions';
import { ReportRange } from '@/modules/reports/schema';
import { ReportsDashboard } from '@/modules/reports/components/ReportsDashboard';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; grain?: string }> }) {
  await requireRole('owner', 'manager');
  const sp = await searchParams;
  const today = bangkokDay(new Date());
  const parsed = ReportRange.safeParse({ from: sp.from ?? `${today.slice(0, 7)}-01`, to: sp.to ?? today, grain: sp.grain ?? 'day' });
  const range = parsed.success ? parsed.data : { from: `${today.slice(0, 7)}-01`, to: today, grain: 'day' as const };
  void (await getLocale());
  const r = await getReports(range);
  if (!r.ok) {
    if (r.code === 'NOT_AUTHORIZED') forbidden();
    return <Alert tone="error">{r.code}</Alert>;
  }
  return <ReportsDashboard range={range} today={today} data={r} />;
}
