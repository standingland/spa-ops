'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useLocale, useTranslations } from 'next-intl';
import { formatAmount } from '@/lib/money';
import { errorText, uiErrorKey } from '@/lib/errors';
import { recordPayment } from '../actions';
import type { PaymentMethod } from '../schema';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

/** Records one payment. The idempotency key is made once when the dialog opens, so a double tap is one payment. */
export function PaymentDialog({ bookingId, dueSatang, methods, onClose, onDone }: {
  bookingId: string; dueSatang: number; methods: PaymentMethod[]; onClose: () => void; onDone: () => void;
}) {
  const t = useTranslations('payments');
  const te = useTranslations();
  const locale = useLocale();
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(formatAmount(dueSatang));
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const method = methods.find((m) => m.id === methodId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await recordPayment({ bookingId, methodId, amount, reference, note, idempotencyKey: key });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} aria-label={t('record')} data-testid="pay-dialog" className="grid gap-3 rounded border border-charcoal bg-white p-3 sm:grid-cols-4">
      <label className="flex flex-col text-sm">{t('amount')}
        <input data-testid="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} />
      </label>
      <label className="flex flex-col text-sm">{t('method')}
        <select data-testid="pay-method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className={field}>
          {methods.map((m) => <option key={m.id} value={m.id}>{locale === 'en' && m.nameEn ? m.nameEn : m.nameTh}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm">{t('reference')}
        <input data-testid="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col text-sm">{t('note')}
        <input data-testid="pay-note" value={note} onChange={(e) => setNote(e.target.value)} className={field} autoComplete="off" />
      </label>
      {method?.needsVerification && <p className="text-xs text-stone-dark sm:col-span-4">{t('needsVerificationHint')}</p>}
      <p className="text-xs text-stone-dark sm:col-span-4">{t('noCardNumbers')}</p>
      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay sm:col-span-4"><ErrorText text={error} /></p>}
      <div className="flex gap-3 sm:col-span-4">
        <button type="submit" disabled={busy} data-testid="pay-submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('submit')}</button>
        <button type="button" onClick={onClose} className="text-sm underline">{te('common.cancel')}</button>
      </div>
    </form>
  );
}
