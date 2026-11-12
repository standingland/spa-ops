'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { anonymiseCustomer } from '../actions';

/** Export for owner and manager; irreversible anonymisation for the owner, behind a typed confirmation. */
export function PrivacyTools({ customerId, displayName, isOwner, anonymised }: { customerId: string; displayName: string; isOwner: boolean; anonymised: boolean }) {
  const t = useTranslations('customers');
  const te = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await anonymiseCustomer({ id: customerId, reason, confirmText });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t('privacy')} data-testid="privacy-tools">
      <Card className="flex flex-col gap-3">
        <h2 className="font-serif text-heading text-ink">{t('privacy')}</h2>
        <p className="text-body text-ink-muted">{t('privacyHelp')}</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/customers/${customerId}/export`} download data-testid="export-json" className={buttonVariants({ variant: 'secondary' })}>{t('export')}</a>
        </div>
      </Card>
      {isOwner && !anonymised && (
        <Card tone="danger" className="flex flex-col gap-3">
          <h2 className="font-serif text-heading text-danger">{t('dangerZone')}</h2>
          {!open && (
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" data-testid="anonymise-open" onClick={() => setOpen(true)} className="border-danger text-danger">{t('anonymise')}</Button>
            </div>
          )}
          {open && (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <p className="text-body font-semibold text-danger">{t('anonymiseWarning')}</p>
              <p className="text-body text-ink">{t('anonymiseKeeps')}</p>
              <Field label={t('reason')}>
                <Input data-testid="anonymise-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Field label={t('typeName', { name: displayName })}>
                <Input data-testid="anonymise-confirm-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </Field>
              {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="danger" disabled={busy} data-testid="anonymise-submit">{t('anonymiseNow')}</Button>
                <Button type="button" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setOpen(false)}>{te('common.cancel')}</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </section>
  );
}
