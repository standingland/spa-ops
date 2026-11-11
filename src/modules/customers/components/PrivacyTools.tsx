'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { anonymiseCustomer } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

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
    <section className="flex flex-col gap-3 rounded border border-stone bg-white p-4" aria-label={t('privacy')} data-testid="privacy-tools">
      <h2 className="text-lg">{t('privacy')}</h2>
      <p className="text-sm text-stone-dark">{t('privacyHelp')}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={`/api/customers/${customerId}/export`} download data-testid="export-json" className="rounded border border-charcoal px-3 py-1.5">{t('export')}</a>
        {isOwner && !anonymised && !open && (
          <button data-testid="anonymise-open" onClick={() => setOpen(true)} className="rounded border border-clay px-3 py-1.5 text-clay">{t('anonymise')}</button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded border border-clay p-3">
          <p className="text-sm font-semibold text-clay">{t('anonymiseWarning')}</p>
          <p className="text-sm">{t('anonymiseKeeps')}</p>
          <label className="flex flex-col text-sm">{t('reason')}
            <input data-testid="anonymise-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} /></label>
          <label className="flex flex-col text-sm">{t('typeName', { name: displayName })}
            <input data-testid="anonymise-confirm-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={field} autoComplete="off" /></label>
          {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} data-testid="anonymise-submit" className="rounded bg-clay px-3 py-1.5 text-sm text-white">{t('anonymiseNow')}</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm underline">{te('common.cancel')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
