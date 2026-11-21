import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/modules/identity/session';
import { REQUEST_PAGE_SIZE, RequestList, requestPage } from '@/modules/staff-requests/components/RequestList';
import type { ReviewRequest } from '@/modules/staff-requests/model';

const pathname = '/admin/staff-requests';

export default async function StaffRequestReviewPage({ searchParams }: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireRole('owner', 'manager');
  const [params, t, supabase] = await Promise.all([searchParams, getTranslations('staffRequests'), createClient()]);
  const status = params.status === 'reviewed' ? 'reviewed' : 'pending';
  const pending = status === 'pending';
  const page = requestPage(params.page);
  const start = (page - 1) * REQUEST_PAGE_SIZE;
  const query = supabase.from('staff_requests').select('id, kind, during, status, affected_bookings, staff(display_name, role)');
  const ordered = pending
    ? query.eq('status', 'pending').order('kind', { ascending: false }).order('created_at')
    : query.neq('status', 'pending').order('reviewed_at', { ascending: false });
  const { data, error } = await ordered.order('id').range(start, start + REQUEST_PAGE_SIZE);
  const rows = (data ?? []) as unknown as ReviewRequest[];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={t('reviewTitle')} />
      <nav aria-label={t('reviewTitle')} className="flex flex-wrap gap-2">
        {(['pending', 'reviewed'] as const).map((key) => (
          <Link key={key} href={{ pathname, query: { status: key } }} aria-current={status === key ? 'page' : undefined}
            className="rounded-md border border-line px-3 py-2 text-body hover:bg-surface-muted aria-[current=page]:bg-tint-available aria-[current=page]:font-semibold">
            {t(key === 'pending' ? 'status.pending' : 'reviewed')}
          </Link>
        ))}
      </nav>
      {error ? <Alert tone="error">{t('loadFailed')}</Alert> : (
        <RequestList rows={rows.slice(0, REQUEST_PAGE_SIZE)} pathname={pathname} query={{ status }}
          page={page} more={rows.length > REQUEST_PAGE_SIZE} />
      )}
    </div>
  );
}
