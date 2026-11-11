'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export type Span = 'day' | 'week' | 'month';

/** Day / week / month switch; keeps the anchor day and the day view's column mode. */
export function SpanSwitch({ span, day, view }: { span: Span; day: string; view: string }) {
  const t = useTranslations('span');
  return (
    <nav aria-label={t('label')} className="flex gap-3 text-sm">
      {(['day', 'week', 'month'] as const).map((s) => (
        <Link key={s} href={`/calendar?span=${s}&day=${day}&view=${view}`} data-testid={`span-${s}`}
          aria-current={s === span ? 'true' : undefined} className={s === span ? 'font-semibold underline' : ''}>{t(s)}</Link>
      ))}
    </nav>
  );
}
