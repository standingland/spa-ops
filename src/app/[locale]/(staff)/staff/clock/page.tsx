import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/modules/identity/session';
import { ClockPanel } from '@/modules/staff-clock/components/ClockPanel';
import { clockCodeSchema, type ClockSnapshot } from '@/modules/staff-clock/model';

export default async function StaffClockPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireRole();
  const [params, t, supabase] = await Promise.all([searchParams, getTranslations('staffClock'), createClient()]);
  const code = clockCodeSchema.safeParse(params.code);
  const { data, error } = await supabase.rpc('read_staff_clock');

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={t('title')} />
      {error ? <Alert tone="error">{t('loadFailed')}</Alert> : (
        <ClockPanel snapshot={data as ClockSnapshot} code={code.success ? code.data : null} initialAttempt={randomUUID()} />
      )}
    </div>
  );
}
