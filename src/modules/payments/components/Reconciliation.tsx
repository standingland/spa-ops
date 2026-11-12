'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatAmount, formatTHB } from '@/lib/money';
import { formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { closeCashDay, refundPayment, verifyPayment, voidPayment, type Closing, type LedgerEntry, type LedgerSummaryRow } from '../actions';

type Action = { kind: 'verify' | 'void' | 'refund'; entry: LedgerEntry; key: string };
const LIVE_TABLES = ['payments'] as const;

/** Daily reconciliation: totals per method, every entry, verify / void / refund, and the cash count. */
export function Reconciliation({ day, summary, entries, closing }: {
  day: string; summary: LedgerSummaryRow[]; entries: LedgerEntry[]; closing: Closing | null;
}) {
  const t = useTranslations('reconciliation');
  const te = useTranslations();
  const router = useRouter();
  useLiveRefresh(LIVE_TABLES);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState(closing ? formatAmount(closing.countedSatang) : '');
  const [note, setNote] = useState(closing?.note ?? '');

  const total = (f: (s: LedgerSummaryRow) => number) => summary.reduce((n, s) => n + f(s), 0);
  const state = (e: LedgerEntry) => (e.voided ? 'voided' : e.verified ? 'verified' : 'unverified');

  function open(kind: Action['kind'], entry: LedgerEntry) {
    setError(null); setReason(''); setAmount(kind === 'refund' ? formatAmount(entry.amountSatang) : '');
    setAction({ kind, entry, key: crypto.randomUUID() });
  }
  async function confirm() {
    if (!action) return;
    setBusy(true); setError(null);
    const id = action.entry.id;
    const r = action.kind === 'verify' ? await verifyPayment(id)
      : action.kind === 'void' ? await voidPayment({ id, reason })
      : await refundPayment({ paymentId: id, amount, reason, idempotencyKey: action.key });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setAction(null);
    router.refresh();
  }
  async function close(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await closeCashDay({ day, counted, note });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('title')} actions={
        <Field label={t('day')}>
          <Input type="date" value={day} data-testid="ledger-day"
            onChange={(e) => e.target.value && router.push(`/payments?day=${e.target.value}`)} />
        </Field>
      } />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="font-serif text-heading text-ink">{t('byMethod')}</h2>
        {summary.length === 0 ? <EmptyState>{t('none')}</EmptyState> : (
          <Card className="overflow-x-auto p-2" tabIndex={0}>
            <table className="tnum w-full min-w-[40rem] border-collapse text-body text-ink">
              <thead><tr className="border-b border-line text-left text-caption text-ink-muted">
                <th className="py-1">{t('method')}</th><th>{t('recorded')}</th><th>{t('verified')}</th><th>{t('awaiting')}</th><th>{t('refunded')}</th><th>{t('voided')}</th>
              </tr></thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.methodId} data-testid="ledger-method-row" data-code={s.code} className="border-b border-line">
                    <td className="py-1">{s.name}</td><td>{formatTHB(s.recordedSatang)}</td><td>{formatTHB(s.verifiedSatang)}</td>
                    <td>{formatTHB(s.unverifiedSatang)}</td><td>{formatTHB(s.refundedSatang)}</td><td>{formatTHB(s.voidedSatang)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">{t('total')}</td><td>{formatTHB(total((s) => s.recordedSatang))}</td><td>{formatTHB(total((s) => s.verifiedSatang))}</td>
                  <td>{formatTHB(total((s) => s.unverifiedSatang))}</td><td>{formatTHB(total((s) => s.refundedSatang))}</td><td>{formatTHB(total((s) => s.voidedSatang))}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="font-serif text-heading text-ink">{t('entries')}</h2>
        {entries.length === 0 && <EmptyState>{t('none')}</EmptyState>}
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} data-testid="ledger-entry" data-state={state(e)} data-kind={e.kind} className="min-w-0">
              <Card className={`flex flex-col gap-2 p-3 text-body text-ink ${e.voided ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="tnum">{formatTime(e.receivedAt)}</span>
                <span className="min-w-0 break-words">{e.customerDisplayName}</span>
                <Badge>{e.kind === 'refund' ? t('refund') : t('payment')} · {e.methodCode}</Badge>
                <span className={`tnum font-semibold ${e.voided ? 'line-through' : ''}`}>{e.kind === 'refund' ? '-' : ''}{formatTHB(e.amountSatang)}</span>
                {e.reference && <span className="min-w-0 break-all text-ink-muted">{e.reference}</span>}
                <span className="text-caption">{t(`state.${state(e)}`)}</span>
                {e.voidReason && <span className="min-w-0 break-words text-caption text-danger">{e.voidReason}</span>}
                {!e.voided && (
                  <span className="ml-auto flex flex-wrap gap-2">
                    {!e.verified && <Button variant="secondary" size="sm" data-testid="entry-verify" onClick={() => open('verify', e)}>{t('verify')}</Button>}
                    {e.kind === 'payment' && <Button variant="secondary" size="sm" data-testid="entry-refund" onClick={() => open('refund', e)}>{t('refund')}</Button>}
                    <Button variant="secondary" size="sm" className="border-danger text-danger" data-testid="entry-void" onClick={() => open('void', e)}>{t('void')}</Button>
                  </span>
                )}
              </div>
              {action?.entry.id === e.id && (
                <div className="flex flex-wrap items-end gap-3 border-t border-line pt-2">
                  {action.kind === 'refund' && (
                    <Field label={t('refundAmount')}>
                      <Input data-testid="refund-amount" value={amount} onChange={(x) => setAmount(x.target.value)} className="tnum" />
                    </Field>
                  )}
                  {action.kind !== 'verify' && (
                    <Field label={t('reason')}>
                      <Input data-testid="reason" value={reason} onChange={(x) => setReason(x.target.value)} />
                    </Field>
                  )}
                  <Button data-testid="confirm" disabled={busy} onClick={confirm}>{te('common.confirm')}</Button>
                  <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setAction(null)}>{te('common.cancel')}</Button>
                </div>
              )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="font-serif text-heading text-ink">{t('cash')}</h2>
        <Card className="flex flex-col gap-3">
        <form onSubmit={close} className="flex flex-wrap items-end gap-3">
          <Field label={t('counted')}>
            <Input data-testid="cash-counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className="tnum" />
          </Field>
          <Field label={t('note')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} data-testid="cash-close">{t('closeDay')}</Button>
        </form>
        {closing && (
          <div className="tnum flex flex-wrap items-center gap-x-6 gap-y-1 text-body text-ink" data-testid="cash-closing">
            <span>{t('expected')} {formatTHB(closing.expectedSatang)}</span>
            <span>{t('counted')} {formatTHB(closing.countedSatang)}</span>
            <span>{t('difference')} <strong data-testid="cash-difference">{formatTHB(closing.countedSatang - closing.expectedSatang)}</strong></span>
            {closing.expectedNowSatang !== closing.expectedSatang && (
              <span data-testid="cash-changed" role="note" className="rounded-full bg-tint-reserved px-2 py-0.5 text-caption text-ink">{t('cashChanged', { now: formatTHB(closing.expectedNowSatang) })}</span>
            )}
          </div>
        )}
        </Card>
      </section>
    </div>
  );
}
