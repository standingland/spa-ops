import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { BookingSummary } from '@/modules/public/components/BookingSummary';
import { getBookingView } from '@/modules/public/queries';

export async function BookingConfirmation({ token }: { token: string }) {
  const t = await getTranslations('public');
  const b = await getBookingView(token);
  if (!b) return <Alert tone="error">{t('done.invalid')}</Alert>;
  const cancelled = b.status === 'cancelled';
  return (
    <div className="flex max-w-xl flex-col gap-8 pt-4">
      <div className="flex flex-col gap-5">
        {!cancelled && (
          <svg viewBox="0 0 56 56" className="size-14" fill="none" aria-hidden>
            <circle cx="28" cy="28" r="26" stroke="var(--brass)" strokeWidth="1.5" />
            <path className="draw-check" d="M17 29l8 8 14-17" stroke="var(--brass)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <h1 className="font-serif text-4xl font-normal leading-[1.3] text-ink">{cancelled ? t('done.cancelled') : t('done.title')}</h1>
      </div>
      <BookingSummary b={b} />
      {!cancelled && (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-muted">{t('done.intro')}</p>
          <p className="text-caption text-ink-muted">{t('done.cancelHint')}</p>
          <Link href={`/book/cancel?token=${encodeURIComponent(token)}`} data-testid="cancel-link" className="w-fit py-2 text-body text-ink underline underline-offset-4">{t('done.cancelLink')}</Link>
        </div>
      )}
    </div>
  );
}
