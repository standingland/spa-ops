'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { bangkokDay } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import type { CustomerRow } from '../schema';

const PAGE = 50;

export function CustomerList({ rows, total, page, q, isOwner }: { rows: CustomerRow[]; total: number; page: number; q: string; isOwner: boolean }) {
  const t = useTranslations('customers');
  const te = useTranslations();
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    timer.current = setTimeout(() => router.replace(term.trim() ? `/customers?q=${encodeURIComponent(term.trim())}` : '/customers'), 300);
    return () => clearTimeout(timer.current);
  }, [term, router]);

  const link = (p: number) => `/customers?${q ? `q=${encodeURIComponent(q)}&` : ''}page=${p}`;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={t('title')}
        actions={isOwner ? <Link href="/customers?tab=retention" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0" data-testid="retention-tab">{t('retention')}</Link> : undefined} />
      <Input type="search" aria-label={t('search')} placeholder={t('search')} value={term} onChange={(e) => setTerm(e.target.value)}
        data-testid="customer-search" className="max-w-md" />
      {rows.length === 0 && <EmptyState>{te('common.empty')}</EmptyState>}
      {rows.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="min-w-0">
                <Link href={`/customers/${r.id}`} data-testid="customer-row" onClick={() => clearTimeout(timer.current)}
                  className="grid min-h-11 min-w-0 items-center gap-x-4 gap-y-1 p-3 text-body text-ink sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <strong className="min-w-0 break-words">{r.displayName}</strong>
                  <span className="tnum min-w-0 break-words text-ink-muted">{r.phone ?? '—'}</span>
                  <span className="tnum min-w-0 text-ink-muted">{t('lastVisit')}: {r.lastVisit ? bangkokDay(r.lastVisit) : '—'}</span>
                  {r.anonymised ? <Badge>{t('removed')}</Badge> : <span className="hidden sm:block" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pages > 1 && (
        <nav className="flex items-center gap-4 text-body" aria-label="pages">
          {page > 1 && <Link href={link(page - 1)} className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">←</Link>}
          <span className="tnum">{page} / {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">→</Link>}
        </nav>
      )}
    </div>
  );
}
