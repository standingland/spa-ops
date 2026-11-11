'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { retryNotification, type OutboxView } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export function OutboxAdmin({ rows }: { rows: OutboxView[] }) {
  const t = useTranslations('notifications');
  const te = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const visible = rows.filter((r) => !filter || r.status === filter);

  async function retry(id: string) {
    setError(null);
    const r = await retryNotification(id);
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{t('title')}</h1>
        <select aria-label={t('status')} value={filter} onChange={(e) => setFilter(e.target.value)} className={field} data-testid="outbox-filter">
          <option value="">{te('common.all')}</option>
          {(['pending', 'failed', 'dead', 'sent'] as const).map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
        </select>
      </div>
      <p className="text-sm text-stone-dark">{t('discreet')}</p>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}
      {visible.length === 0 && <p className="text-stone-dark">{te('common.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {visible.map((r) => (
          <li key={r.id} data-testid="outbox-row" data-status={r.status} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-stone bg-white p-3 text-sm">
            <strong>{t(`templates.${r.template}`)}</strong>
            <span className="tnum">{r.startsAt ? `${bangkokDay(r.startsAt)} ${formatTime(r.startsAt)}` : '—'}</span>
            <span className="rounded bg-ivory px-2 py-0.5 text-xs">{t(`statuses.${r.status}`)}</span>
            <span className="tnum">{t('attempts')}: {r.attempts}</span>
            {r.lastError && <span className="text-clay">{r.lastError}</span>}
            {(r.status === 'pending' || r.status === 'failed') && <span className="tnum text-stone-dark">{t('next')}: {bangkokDay(r.nextAttemptAt)} {formatTime(r.nextAttemptAt)}</span>}
            {(r.status === 'failed' || r.status === 'dead') && (
              <button data-testid="outbox-retry" onClick={() => retry(r.id)} className="ml-auto rounded border border-charcoal px-3 py-1.5">{t('retry')}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
