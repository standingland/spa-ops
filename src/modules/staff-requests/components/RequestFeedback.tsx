'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/action';
import { uiErrorKey } from '@/lib/errors';

export function RequestFeedback({ result, success }: { result?: ActionResult; success?: 'sent' }) {
  const t = useTranslations();
  if (!result) return null;
  if (result.ok) return success ? <Alert>{t(`staffRequests.${success}`)}</Alert> : null;

  const key = {
    OVERLAP: 'staffRequests.overlap',
    OUT_OF_WINDOW: 'staffRequests.outOfWindow',
    THERAPIST_NOT_LINKED: 'staffRequests.notLinked',
  }[result.code] ?? uiErrorKey(result.code);
  return <Alert tone="error">{t(key)}{result.ref ? ` (${result.ref})` : ''}</Alert>;
}
