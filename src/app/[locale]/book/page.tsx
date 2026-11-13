import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { Closed } from '@/modules/public/components/Closed';
import { TherapistPhoto } from '@/modules/public/components/TherapistPhoto';
import { isOpen, listTherapists } from '@/modules/public/queries';

export default async function BookPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isOpen())) return <Closed />;
  const t = await getTranslations('public');
  const locale = await getLocale();
  const { error } = await searchParams;
  const therapists = await listTherapists();
  return (
    <>
      <div>
        <h1 className="font-serif text-2xl text-ink">{t('teamTitle')}</h1>
        <p className="mt-1 text-body text-ink-muted">{t('teamIntro')}</p>
      </div>
      {error && t.has(`errors.${error}`) && <Alert tone="error">{t(`errors.${error}`)}</Alert>}
      {therapists.length === 0 && <Alert>{t('noTherapists')}</Alert>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="team-wall">
        {therapists.map((th) => (
          <li key={th.id} className="min-w-0">
            <Link href={`/book/${th.id}`} data-testid="therapist-card"
              className="block overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
              <TherapistPhoto id={th.id} name={th.name} hasPhoto={th.hasPhoto} className="aspect-square w-full" />
              <div className="flex flex-col gap-1 p-3">
                <span className="truncate font-serif text-heading text-ink">{th.name}</span>
                <span className="line-clamp-2 text-caption text-ink-muted">{th.specialties.join(' · ')}</span>
                <span className="sr-only">{locale === 'en' ? th.bioEn : th.bioTh}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
