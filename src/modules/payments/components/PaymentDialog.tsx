'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useLocale, useTranslations } from 'next-intl';
import { formatAmount } from '@/lib/money';
import { errorText, uiErrorKey } from '@/lib/errors';
import { recordPayment } from '../actions';
import type { PaymentMethod } from '../schema';

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
    <form onSubmit={submit} aria-label={t('record')} data-testid="pay-dialog" className="grid min-w-0 gap-3 rounded-[var(--radius)] border border-line-strong bg-surface p-3 sm:grid-cols-4">
      <Field label={t('amount')}>
        <Input data-testid="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" />
      </Field>
      <Field label={t('method')}>
        <Select data-testid="pay-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          {methods.map((m) => <option key={m.id} value={m.id}>{locale === 'en' && m.nameEn ? m.nameEn : m.nameTh}</option>)}
        </Select>
      </Field>
      <Field label={t('reference')}>
        <Input data-testid="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t('note')}>
        <Input data-testid="pay-note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
      </Field>
      {method?.needsVerification && <p className="text-caption text-ink-muted sm:col-span-4">{t('needsVerificationHint')}</p>}
      <p className="text-caption text-ink-muted sm:col-span-4">{t('noCardNumbers')}</p>
      {error && <Alert tone="error" className="break-words sm:col-span-4"><ErrorText text={error} /></Alert>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <Button type="submit" disabled={busy} data-testid="pay-submit">{t('submit')}</Button>
        <Button type="button" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={onClose}>{te('common.cancel')}</Button>
      </div>
    </form>
  );
}
