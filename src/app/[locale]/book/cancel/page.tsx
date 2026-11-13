import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { bangkokDay, formatTime } from '@/lib/time';
import { CancelButton } from '@/modules/public/components/CancelButton';
import { getBookingView } from '@/modules/public/queries';

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations('public');
  const locale = await getLocale();
  const { token = '' } = await searchParams;
  const b = await getBookingView(token);
  if (!b) return <Alert tone="error">{t('errors.INVALID_LINK')}</Alert>;
  const service = locale === 'en' && b.serviceNameEn ? b.serviceNameEn : b.serviceNameTh;
  return (
    <>
      <h1 className="font-serif text-2xl text-ink">{t('cancel.title')}</h1>
      <Card className="flex flex-col gap-2" data-testid="booking-summary">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
          <dt className="text-ink-muted">{t('done.when')}</dt>
          <dd className="tnum">{bangkokDay(b.startsAt)} {formatTime(b.startsAt)}–{formatTime(b.endsAt)}</dd>
          <dt className="text-ink-muted">{t('done.with')}</dt><dd>{b.therapistName}</dd>
          <dt className="text-ink-muted">{t('done.service')}</dt><dd className="break-words">{service}</dd>
        </dl>
      </Card>
      {b.status === 'cancelled' ? (
        <>
          <Alert data-testid="already-cancelled">{t('cancel.already')}</Alert>
          <Link href="/book" className="text-primary underline">{t('cancel.bookAgain')}</Link>
        </>
      ) : (
        <CancelButton token={token} />
      )}
    </>
  );
}
