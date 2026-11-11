import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function Forbidden() {
  const t = await getTranslations('forbidden');
  return (
    <section data-testid="forbidden" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl">{t('title')}</h1>
      <p className="mt-2 text-stone-dark">{t('body')}</p>
      <Link href="/calendar" className="mt-4 inline-block underline">{t('back')}</Link>
    </section>
  );
}
