'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
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
    <section className="customer-privacy-stack" aria-label={t('privacy')} data-testid="privacy-tools">
      <div className="workspace-surface customer-panel customer-privacy-export">
        <div className="customer-privacy-copy">
          <h2 className="workspace-section-title">{t('privacy')}</h2>
          <p className="text-caption text-ink-muted">{t('privacyHelp')}</p>
        </div>
        <div className="customer-privacy-action">
          <a href={`/api/customers/${customerId}/export`} download data-testid="export-json" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('export')}</a>
        </div>
      </div>

      {isOwner && !anonymised && (
        <div className="workspace-surface customer-panel customer-danger-zone">
          <div className="customer-danger-head">
            <div>
              <h2 className="workspace-section-title text-danger">{t('dangerZone')}</h2>
              <p className="text-caption text-ink-muted">{t('anonymiseKeeps')}</p>
            </div>
            {!open && (
              <Button type="button" variant="secondary" size="sm" data-testid="anonymise-open" onClick={() => setOpen(true)} className="border-danger text-danger">
                {t('anonymise')}
              </Button>
            )}
          </div>
          {open && (
            <form onSubmit={submit} className="customer-danger-form">
              <p className="text-body font-semibold text-danger">{t('anonymiseWarning')}</p>
              <Field label={t('reason')}>
                <Input data-testid="anonymise-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Field label={t('typeName', { name: displayName })}>
                <Input data-testid="anonymise-confirm-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </Field>
              {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
              <div className="customer-form-actions">
                <Button type="submit" variant="danger" disabled={busy} data-testid="anonymise-submit">{t('anonymiseNow')}</Button>
                <Button type="button" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setOpen(false)}>{te('common.cancel')}</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
