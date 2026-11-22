import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { requireRole } from '@/modules/identity/session';
import { ClockQr } from '@/modules/staff-clock/components/ClockQr';

export default async function AdminClockPage() {
  await requireRole('owner', 'manager');
  const t = await getTranslations('staffClock');
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={t('qrTitle')} />
      <ClockQr />
    </div>
  );
}
