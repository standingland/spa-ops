'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useTranslations } from 'next-intl';
import { errorText, uiErrorKey } from '@/lib/errors';
import { adjustCharge } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

/** Owner and manager: a discount and / or a fee override, always with a reason. */
export function ChargeAdjust({ bookingId, expectedVersion, onDone }: { bookingId: string; expectedVersion: number; onDone: () => void }) {
  const t = useTranslations('payments');
  const te = useTranslations();
  const [open, setOpen] = useState(false);
  const [discount, setDiscount] = useState('');
  const [fee, setFee] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return <button data-testid="charge-open" onClick={() => setOpen(true)} className="rounded border border-charcoal px-3 py-1 text-sm">{t('adjust')}</button>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await adjustCharge({ bookingId, discount, fee, reason, expectedVersion });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setOpen(false);
    onDone();
  }

  return (
    <form onSubmit={submit} aria-label={t('adjust')} className="grid gap-3 rounded border border-stone p-3 sm:grid-cols-4">
      <label className="flex flex-col text-sm">{t('discount')}
        <input data-testid="charge-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${field} tnum`} /></label>
      <label className="flex flex-col text-sm">{t('fee')}
        <input data-testid="charge-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className={`${field} tnum`} /></label>
      <label className="flex flex-col text-sm sm:col-span-2">{t('reason')}
        <input data-testid="charge-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} /></label>
      <p className="text-xs text-stone-dark sm:col-span-4">{t('adjustHint')}</p>
      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay sm:col-span-4"><ErrorText text={error} /></p>}
      <div className="flex gap-3 sm:col-span-4">
        <button type="submit" disabled={busy} data-testid="charge-submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{te('common.save')}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm underline">{te('common.cancel')}</button>
      </div>
    </form>
  );
}
