import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay } from '@/lib/time';
import { requireRole } from '@/modules/identity/session';
import { RequestForm } from '@/modules/staff-requests/components/RequestForm';
import { REQUEST_PAGE_SIZE, RequestList, requestPage } from '@/modules/staff-requests/components/RequestList';
import { nextMonthDays, type StaffRequest } from '@/modules/staff-requests/model';

const pathname = '/staff/requests';

export default async function StaffRequestsPage({ searchParams }: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const session = await requireRole();
  const [params, t, supabase] = await Promise.all([searchParams, getTranslations('staffRequests'), createClient()]);
  const kind = params.type === 'shift' ? 'shift' : 'sick';
  const page = requestPage(params.page);
  const start = (page - 1) * REQUEST_PAGE_SIZE;
  const now = new Date();
  const { data, error } = await supabase.from('staff_requests')
    .select('id, kind, during, status, affected_bookings').eq('staff_user_id', session.userId)
    .order('created_at', { ascending: false }).order('id').range(start, start + REQUEST_PAGE_SIZE);
  const rows = (data ?? []) as StaffRequest[];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={t('title')} />
      <nav aria-label={t('title')} className="flex flex-wrap gap-2">
        {(['sick', 'shift'] as const).map((type) => (
          <Link key={type} href={{ pathname, query: { type } }} aria-current={kind === type ? 'page' : undefined}
            className="rounded-md border border-line px-3 py-2 text-body hover:bg-surface-muted aria-[current=page]:bg-tint-available aria-[current=page]:font-semibold">
            {t(`kind.${type}`)}
          </Link>
        ))}
      </nav>
      <RequestForm key={kind} kind={kind} today={bangkokDay(now)} monthDays={nextMonthDays(now)} />
      <section className="grid gap-2" aria-labelledby="my-staff-requests">
        <h2 id="my-staff-requests" className="font-semibold">{t('history')}</h2>
        {error ? <Alert tone="error">{t('loadFailed')}</Alert> : (
          <RequestList rows={rows.slice(0, REQUEST_PAGE_SIZE)} pathname={pathname} query={{ type: kind }}
            page={page} more={rows.length > REQUEST_PAGE_SIZE} />
        )}
      </section>
    </div>
  );
}
