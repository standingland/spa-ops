import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { requireRole } from '@/modules/identity/session';
import { bangkokDay } from '@/lib/time';
import { getBusinessOptions, getInventory } from '@/modules/business/actions';
import { InventoryDashboard } from '@/modules/business/components/InventoryDashboard';
import { PeriodInput } from '@/modules/business/schema';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole('owner', 'manager');
  const t = await getTranslations('business'); const sp = await searchParams; const today = bangkokDay(new Date());
  const from = sp.from ?? today.slice(0, 8) + '01'; const to = sp.to ?? today;
  if (!PeriodInput.safeParse({ from, to }).success) return <Alert tone="error">{t('invalidPeriod')}</Alert>;
  const [data, options] = await Promise.all([getInventory(from, to), getBusinessOptions()]);
  if (!data.ok || !options.ok) return <Alert tone="error">{t('loadFailed')}</Alert>;
  return <InventoryDashboard from={from} to={to} inventory={data.inventory} services={options.services} />;
}
