import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function Forbidden() {
  const t = await getTranslations('forbidden');
  return (
    <section data-testid="forbidden" className="mx-auto max-w-md py-16">
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="text-heading">{t('title')}</h1>
        <p className="text-body text-ink-muted">{t('body')}</p>
        <Link href="/calendar" className={buttonVariants({ variant: 'secondary' })}>{t('back')}</Link>
      </Card>
    </section>
  );
}
