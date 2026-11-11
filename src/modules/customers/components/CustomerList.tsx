'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { bangkokDay } from '@/lib/time';
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl">{t('title')}</h1>
        {isOwner && <Link href="/customers?tab=retention" className="text-sm underline" data-testid="retention-tab">{t('retention')}</Link>}
      </div>
      <input aria-label={t('search')} placeholder={t('search')} value={term} onChange={(e) => setTerm(e.target.value)}
        data-testid="customer-search" className="max-w-md rounded border border-stone-dark px-2 py-1.5 text-sm" />
      {rows.length === 0 && <p className="text-stone-dark">{te('common.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/customers/${r.id}`} data-testid="customer-row" onClick={() => clearTimeout(timer.current)} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-stone bg-white p-3 text-sm">
              <strong>{r.displayName}</strong>
              <span className="tnum text-stone-dark">{r.phone ?? '—'}</span>
              <span className="tnum text-stone-dark">{t('lastVisit')}: {r.lastVisit ? bangkokDay(r.lastVisit) : '—'}</span>
              {r.anonymised && <span className="rounded bg-ivory px-2 py-0.5 text-xs">{t('removed')}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="flex items-center gap-4 text-sm" aria-label="pages">
          {page > 1 && <Link href={link(page - 1)} className="underline">←</Link>}
          <span className="tnum">{page} / {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="underline">→</Link>}
        </nav>
      )}
    </div>
  );
}
