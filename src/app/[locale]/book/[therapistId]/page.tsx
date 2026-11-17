import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { bangkokDay } from '@/lib/time';
import { BookingPanel } from '@/modules/public/components/BookingPanel';
import { Closed } from '@/modules/public/components/Closed';
import { TherapistPhoto } from '@/modules/public/components/TherapistPhoto';
import { SESSION_COOKIE } from '@/modules/public/http';
import { getTherapist, isOpen } from '@/modules/public/queries';
import { verifySession } from '@/modules/public/session';
import { publicDb } from '@/modules/public/db';

export default async function TherapistPage({ params, searchParams }: {
  params: Promise<{ therapistId: string }>; searchParams: Promise<{ serviceId?: string; day?: string; start?: string; error?: string }>;
}) {
  if (!(await isOpen())) return <Closed />;
  const { therapistId } = await params;
  const sp = await searchParams;
  const found = await getTherapist(therapistId);
  if (!found) notFound();
  const { therapist: th, services } = found;
  const t = await getTranslations('public');
  const locale = await getLocale();
  const guest = verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  const { data: waitlistSetting } = await publicDb().from('app_settings').select('value').eq('key', 'care.waitlist_enabled').maybeSingle();
  const bio = locale === 'en' ? th.bioEn || th.bioTh : th.bioTh || th.bioEn;
  return (
    <>
      <Link href="/book" className="-mb-2 inline-flex w-fit items-center gap-1.5 py-2 text-caption text-ink-muted">
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 3 5 8l5 5" /></svg>
        {t('back')}
      </Link>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <section className="flex flex-col gap-5 lg:sticky lg:top-8" data-testid="therapist-profile">
          <TherapistPhoto id={th.id} name={th.name} hasPhoto={th.hasPhoto} className="arch-reveal mx-auto w-3/5 max-w-[15rem] lg:w-full lg:max-w-none" />
          <div className="flex flex-col gap-3">
            <h1 className="font-serif text-4xl font-normal leading-[1.25] text-ink">{th.name}</h1>
            {bio && <p className="max-w-[52ch] whitespace-pre-line break-words text-body leading-7 text-ink">{bio}</p>}
            {th.specialties.length > 0 && <p className="text-caption text-ink-muted" aria-label={t('specialties')}>{th.specialties.join(', ')}</p>}
          </div>
        </section>
        <BookingPanel therapistId={th.id} services={services} guestName={guest ? guest.name : null} today={bangkokDay(new Date())} waitlistEnabled={waitlistSetting?.value === true}
          initial={{ serviceId: sp.serviceId, day: sp.day, start: sp.start }} error={sp.error ?? null} />
      </div>
    </>
  );
}
