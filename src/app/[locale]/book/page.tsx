import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { bangkokDay } from '@/lib/time';
import { Closed } from '@/modules/public/components/Closed';
import { TherapistDirectory } from '@/modules/public/components/TherapistDirectory';
import { isOpen, listTherapists } from '@/modules/public/queries';

export default async function BookPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isOpen())) return <Closed />;
  const t = await getTranslations('public');
  const [{ error }, therapists, locale] = await Promise.all([searchParams, listTherapists(), getLocale()]);
  return (
    <>
      {error && t.has(`errors.${error}`) && <Alert tone="error">{t(`errors.${error}`)}</Alert>}
      <TherapistDirectory therapists={therapists} locale={locale === 'th' ? 'th' : 'en'} today={bangkokDay(new Date())} />
    </>
  );
}
