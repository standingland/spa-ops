import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { BookingSummary } from '@/modules/public/components/BookingSummary';
import { CancelButton } from '@/modules/public/components/CancelButton';
import { getBookingView } from '@/modules/public/queries';

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations('public');
  const { token = '' } = await searchParams;
  const b = await getBookingView(token);
  if (!b) return <Alert tone="error">{t('errors.INVALID_LINK')}</Alert>;
  return (
    <div className="flex max-w-xl flex-col gap-8 pt-4">
      <h1 className="font-serif text-4xl font-normal leading-[1.3] text-ink">{t('cancel.title')}</h1>
      <BookingSummary b={b} />
      {b.status === 'cancelled' ? (
        <div className="flex flex-col gap-3">
          <Alert data-testid="already-cancelled">{t('cancel.already')}</Alert>
          <Link href="/book" className="w-fit py-2 text-body text-ink underline underline-offset-4">{t('cancel.bookAgain')}</Link>
        </div>
      ) : (
        <CancelButton token={token} />
      )}
    </div>
  );
}
