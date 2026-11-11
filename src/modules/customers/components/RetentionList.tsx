'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { bangkokDay } from '@/lib/time';
import type { RetentionRow } from '../actions';

/** Customers with no activity for the configured number of months. It lists; it never anonymises by itself. */
export function RetentionList({ rows, months }: { rows: RetentionRow[]; months: number }) {
  const t = useTranslations('customers');
  const te = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">{t('retention')}</h1>
      <p className="text-sm text-stone-dark" data-testid="retention-months">{t('retentionHelp', { months })}</p>
      <Link href="/customers" className="text-sm underline">← {t('title')}</Link>
      {rows.length === 0 && <p className="text-stone-dark">{te('common.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.customerId}>
            <Link href={`/customers/${r.customerId}`} data-testid="retention-row" className="flex flex-wrap items-center gap-x-4 rounded border border-stone bg-white p-3 text-sm">
              <strong>{r.displayName}</strong>
              <span className="tnum text-stone-dark">{t('lastActivity')}: {bangkokDay(r.lastActivity)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
