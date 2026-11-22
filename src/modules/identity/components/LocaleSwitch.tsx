'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export function LocaleSwitch({ query }: { query?: Record<string, string> }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t('language')} className="flex gap-2 text-sm">
      {(['th', 'en'] as const).map((l) => (
        <Link key={l} href={query ? { pathname, query } : pathname} locale={l} aria-current={l === locale ? 'true' : undefined}
          className={l === locale ? 'font-semibold underline' : 'text-stone-dark'}>{l.toUpperCase()}</Link>
      ))}
    </nav>
  );
}
