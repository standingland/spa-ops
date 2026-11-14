import { getTranslations } from 'next-intl/server';

/** Shown on every public page until LINE is configured and the owner has turned online booking on. */
export async function Closed() {
  const t = await getTranslations('public');
  return (
    <section className="flex max-w-xl flex-col gap-4 pt-10" data-testid="book-closed" role="status">
      <h1 className="text-pretty font-serif text-4xl font-normal leading-[1.3] text-ink">{t('closedTitle')}</h1>
      <p className="max-w-[42ch] text-body text-ink-muted">{t('closedBody')}</p>
    </section>
  );
}
