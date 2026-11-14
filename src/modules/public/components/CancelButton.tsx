'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cancelOnline } from '../actions';

/** Cancels only on a deliberate tap, never when the link is opened, so a link preview cannot cancel a booking. */
export function CancelButton({ token }: { token: string }) {
  const t = useTranslations('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function cancel() {
    setBusy(true); setError(null);
    const r = await cancelOnline(token);
    setBusy(false);
    if (r.ok) setDone(true); else setError(r.code);
  }

  if (done) {
    return (
      <Alert data-testid="cancel-done">
        <h2 className="font-serif text-heading text-ink">{t('cancel.doneTitle')}</h2>
        <Link href="/book" className="mt-2 inline-block text-primary underline">{t('cancel.bookAgain')}</Link>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error" data-testid="cancel-error">{t.has(`errors.${error}`) ? t(`errors.${error}`) : t('errors.UNKNOWN')}</Alert>}
      <p className="text-body text-ink">{t('cancel.question')}</p>
      <Button variant="secondary" className="w-fit border-danger text-danger" disabled={busy} onClick={cancel} data-testid="cancel-confirm">{busy ? t('cancel.working') : t('cancel.button')}</Button>
    </div>
  );
}
