'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { bangkokDay } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import type { RetentionRow } from '../actions';

/** Customers with no activity for the configured number of months. It lists; it never anonymises by itself. */
export function RetentionList({ rows, months }: { rows: RetentionRow[]; months: number }) {
  const t = useTranslations('customers');
  const te = useTranslations();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={t('retention')}
        actions={<Link href="/customers" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">← {t('title')}</Link>} />
      <p className="text-body text-ink-muted" data-testid="retention-months">{t('retentionHelp', { months })}</p>
      {rows.length === 0 && <EmptyState>{te('common.empty')}</EmptyState>}
      {rows.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.customerId} className="min-w-0">
                <Link href={`/customers/${r.customerId}`} data-testid="retention-row" className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 p-3 text-body text-ink">
                  <strong className="min-w-0 break-words">{r.displayName}</strong>
                  <span className="tnum text-ink-muted">{t('lastActivity')}: {bangkokDay(r.lastActivity)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
