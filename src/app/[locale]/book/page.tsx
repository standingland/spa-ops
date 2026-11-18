import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { bangkokDay } from '@/lib/time';
import { Closed } from '@/modules/public/components/Closed';
import { TherapistDirectory } from '@/modules/public/components/TherapistDirectory';
import { BookingConfirmation } from '@/modules/public/components/BookingConfirmation';
import { getTherapistServices, isOpen, listTherapists } from '@/modules/public/queries';
import { SESSION_COOKIE } from '@/modules/public/http';
import { verifySession } from '@/modules/public/session';
import { publicDb } from '@/modules/public/db';

export default async function BookPage({ searchParams }: { searchParams: Promise<{ therapistId?: string; serviceId?: string; day?: string; start?: string; error?: string; token?: string }> }) {
  const sp = await searchParams;
  if (sp.token) return <BookingConfirmation token={sp.token} />;
  if (!(await isOpen())) return <Closed />;
  const t = await getTranslations('public');
  const [therapists, locale, jar, { data: waitlistSetting }] = await Promise.all([
    listTherapists(), getLocale(), cookies(),
    publicDb().from('app_settings').select('value').eq('key', 'care.waitlist_enabled').maybeSingle(),
  ]);
  const choices = await Promise.all(therapists.map(async (th) => ({ ...th, services: await getTherapistServices(th.id) })));
  const guest = verifySession(jar.get(SESSION_COOKIE)?.value ?? '');
  return (
    <>
      {sp.error && t.has(`errors.${sp.error}`) && <Alert tone="error">{t(`errors.${sp.error}`)}</Alert>}
      <TherapistDirectory therapists={choices} locale={locale === 'th' ? 'th' : 'en'} today={bangkokDay(new Date())}
        guestName={guest?.name ?? null} initial={sp} waitlistEnabled={waitlistSetting?.value === true} />
    </>
  );
}
