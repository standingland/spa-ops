import { getLocale, getTranslations } from 'next-intl/server';
import { formatTime } from '@/lib/time';
import type { PublicBooking } from '../queries';

/** The time, written large, then who and what. Shared by the confirmation and the cancel page. */
export async function BookingSummary({ b }: { b: PublicBooking }) {
  const t = await getTranslations('public');
  const locale = await getLocale();
  const service = locale === 'en' && b.serviceNameEn ? b.serviceNameEn : b.serviceNameTh;
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok',
  }).format(new Date(b.startsAt));
  return (
    <div className="flex flex-col gap-6" data-testid="booking-summary">
      <div>
        <p className="tnum font-serif text-5xl font-normal leading-tight text-ink">{formatTime(b.startsAt)}<span className="text-ink-muted"> – {formatTime(b.endsAt)}</span></p>
        <p className="mt-1 text-body text-ink">{date}</p>
        <p className="mt-1 text-caption text-ink-muted">{t('timezone')}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] border-t border-line text-body">
        <dt className="border-b border-line py-3 pr-8 text-ink-muted">{t('done.with')}</dt>
        <dd className="border-b border-line py-3 text-ink">{b.therapistName}</dd>
        <dt className="border-b border-line py-3 pr-8 text-ink-muted">{t('done.service')}</dt>
        <dd className="break-words border-b border-line py-3 text-ink">{service}</dd>
      </dl>
    </div>
  );
}
