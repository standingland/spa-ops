'use client';

import { useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { retryNotification, type OutboxView } from '../actions';

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
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <PageHeader title={t('title')} subtitle={t('discreet')}
        actions={
          <Select aria-label={t('status')} value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="outbox-filter">
            <option value="">{te('common.all')}</option>
            {(['pending', 'failed', 'dead', 'sent'] as const).map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
          </Select>
        } />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {visible.length === 0 && <EmptyState>{te('common.empty')}</EmptyState>}
      <ul className="flex flex-col gap-2">
        {visible.map((r) => (
          <li key={r.id} data-testid="outbox-row" data-status={r.status} className="min-w-0">
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-body">
              <strong className="min-w-0 break-words">{t(`templates.${r.template}`)}</strong>
              <span className="tnum">{r.startsAt ? `${bangkokDay(r.startsAt)} ${formatTime(r.startsAt)}` : '—'}</span>
              <Badge tone={r.status === 'failed' || r.status === 'dead' ? 'warning' : 'neutral'}>{t(`statuses.${r.status}`)}</Badge>
              <span className="tnum">{t('attempts')}: {r.attempts}</span>
              {r.lastError && <span className="min-w-0 break-words text-danger">{r.lastError}</span>}
              {(r.status === 'pending' || r.status === 'failed') && <span className="tnum text-ink-muted">{t('next')}: {bangkokDay(r.nextAttemptAt)} {formatTime(r.nextAttemptAt)}</span>}
              {(r.status === 'failed' || r.status === 'dead') && (
                <Button variant="secondary" size="sm" data-testid="outbox-retry" onClick={() => retry(r.id)} className="ml-auto">{t('retry')}</Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
