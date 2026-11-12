'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useTranslations } from 'next-intl';
import { errorText, uiErrorKey } from '@/lib/errors';
import { adjustCharge } from '../actions';

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

  if (!open) return <Button variant="secondary" size="sm" data-testid="charge-open" onClick={() => setOpen(true)}>{t('adjust')}</Button>;

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
    <form onSubmit={submit} aria-label={t('adjust')} className="grid min-w-0 gap-3 rounded-[var(--radius)] border border-line p-3 sm:grid-cols-4">
      <Field label={t('discount')}>
        <Input data-testid="charge-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="tnum" />
      </Field>
      <Field label={t('fee')}>
        <Input data-testid="charge-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className="tnum" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('reason')}>
          <Input data-testid="charge-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <p className="text-caption text-ink-muted sm:col-span-4">{t('adjustHint')}</p>
      {error && <Alert tone="error" className="break-words sm:col-span-4"><ErrorText text={error} /></Alert>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <Button type="submit" disabled={busy} data-testid="charge-submit">{te('common.save')}</Button>
        <Button type="button" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setOpen(false)}>{te('common.cancel')}</Button>
      </div>
    </form>
  );
}
