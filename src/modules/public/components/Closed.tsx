import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';

/** Shown on every public page until LINE is configured and the owner has turned online booking on. */
export async function Closed() {
  const t = await getTranslations('public');
  return (
    <Alert data-testid="book-closed">
      <h1 className="font-serif text-heading text-ink">{t('closedTitle')}</h1>
      <p className="mt-1">{t('closedBody')}</p>
    </Alert>
  );
}
