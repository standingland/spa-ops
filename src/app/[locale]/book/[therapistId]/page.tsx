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
  const bio = locale === 'en' ? th.bioEn || th.bioTh : th.bioTh || th.bioEn;
  return (
    <>
      <Link href="/book" className="text-caption text-primary underline">← {t('back')}</Link>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start" data-testid="therapist-profile">
        <TherapistPhoto id={th.id} name={th.name} hasPhoto={th.hasPhoto} className="aspect-square w-full rounded-[var(--radius)] sm:w-56 sm:shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-serif text-2xl text-ink">{th.name}</h1>
          {bio && <p className="whitespace-pre-line break-words text-body text-ink">{bio}</p>}
          {th.specialties.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('specialties')}>
              {th.specialties.map((s) => <li key={s} className="rounded-full bg-surface px-3 py-1 text-caption text-ink">{s}</li>)}
            </ul>
          )}
        </div>
      </section>
      <BookingPanel therapistId={th.id} services={services} guestName={guest ? guest.name : null} today={bangkokDay(new Date())}
        initial={{ serviceId: sp.serviceId, day: sp.day, start: sp.start }} error={sp.error ?? null} />
    </>
  );
}
