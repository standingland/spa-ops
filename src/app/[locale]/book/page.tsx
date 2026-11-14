import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { Closed } from '@/modules/public/components/Closed';
import { TherapistPhoto } from '@/modules/public/components/TherapistPhoto';
import { isOpen, listTherapists } from '@/modules/public/queries';

export default async function BookPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isOpen())) return <Closed />;
  const t = await getTranslations('public');
  const { error } = await searchParams;
  const therapists = await listTherapists();
  return (
    <>
      <section className="pt-4">
        <h1 className="max-w-[16ch] text-pretty font-serif text-[2.25rem] font-normal leading-[1.3] text-ink sm:text-5xl sm:leading-[1.25]">{t('teamTitle')}</h1>
        <p className="mt-4 max-w-[40ch] text-body text-ink-muted">{t('teamIntro')}</p>
      </section>
      {error && t.has(`errors.${error}`) && <Alert tone="error">{t(`errors.${error}`)}</Alert>}
      {therapists.length === 0 && <Alert>{t('noTherapists')}</Alert>}
      {/* the columns are staggered so the doorways read as a row of rooms, not a catalogue grid */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-14" data-testid="team-wall">
        {therapists.map((th, i) => (
          <li key={th.id} style={{ ['--i' as string]: i }} className="min-w-0 max-sm:even:mt-12 sm:[&:nth-child(3n+2)]:mt-16">
            <Link href={`/book/${th.id}`} data-testid="therapist-card" className="group block rounded-[14px] active:opacity-90">
              <TherapistPhoto id={th.id} name={th.name} hasPhoto={th.hasPhoto} className="arch-reveal w-full" />
              <div className="mt-4 flex flex-col gap-1">
                <span className="truncate font-serif text-xl font-normal text-ink">{th.name}</span>
                {th.specialties.length > 0 && <span className="line-clamp-2 text-caption text-ink-muted">{th.specialties.join(', ')}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
