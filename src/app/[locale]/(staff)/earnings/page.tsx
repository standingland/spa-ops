import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { bangkokDay } from '@/lib/time';
import { getBusinessOptions, getEarnings } from '@/modules/business/actions';
import { EarningsDashboard } from '@/modules/business/components/EarningsDashboard';
import { PeriodInput } from '@/modules/business/schema';

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole('owner', 'manager');
  const t = await getTranslations('business'); const sp = await searchParams; const today = bangkokDay(new Date());
  const from = sp.from ?? today.slice(0, 8) + '01'; const to = sp.to ?? today;
  if (!PeriodInput.safeParse({ from, to }).success) return <Alert tone="error">{t('invalidPeriod')}</Alert>;
  const [data, options] = await Promise.all([getEarnings(from, to), getBusinessOptions()]);
  if (!data.ok || !options.ok) return <Alert tone="error">{t('loadFailed')}</Alert>;
  return <EarningsDashboard from={from} to={to} report={data.report} rules={data.rules} services={options.services} therapists={options.therapists} />;
}
