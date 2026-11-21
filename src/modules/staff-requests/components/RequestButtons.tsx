'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action';
import { decideStaffRequest } from '../actions';
import type { Decision } from '../model';
import { RequestFeedback } from './RequestFeedback';

export function RequestButtons({ id, review }: { id: string; review: boolean }) {
  const t = useTranslations('staffRequests');
  const [result, setResult] = useState<ActionResult>();
  const [busy, startTransition] = useTransition();
  const disabled = busy || result?.ok === true;

  function decide(decision: Decision) {
    setResult(undefined);
    startTransition(async () => setResult(await decideStaffRequest(id, decision)));
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {review ? (
          <>
            <Button type="button" size="sm" disabled={disabled} onClick={() => decide('approved')}>{t('approve')}</Button>
            <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => decide('rejected')}>{t('reject')}</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => decide('withdrawn')}>{t('withdraw')}</Button>
        )}
      </div>
      <RequestFeedback result={result} />
    </div>
  );
}
