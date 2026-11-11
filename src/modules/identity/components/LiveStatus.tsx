'use client';

import { useTranslations } from 'next-intl';
import { useLiveState } from '@/lib/realtime';

/** Says in words and colour whether the screen below is receiving live updates. Nothing on pages that are not live. */
export function LiveStatus() {
  const t = useTranslations('today');
  const state = useLiveState();
  if (state === 'idle') return null;
  return (
    <span data-testid="live-status" data-state={state} role="status" className="flex items-center gap-2 text-sm">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${state === 'live' ? 'bg-sage' : 'bg-clay'}`} aria-hidden />
      {state === 'live' ? t('live') : t('offline')}
    </span>
  );
}
