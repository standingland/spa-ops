'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatAmount, formatTHB } from '@/lib/money';
import { formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { closeCashDay, refundPayment, verifyPayment, voidPayment, type Closing, type LedgerEntry, type LedgerSummaryRow } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl">{t('title')}</h1>
        <label className="flex items-center gap-2 text-sm">{t('day')}
          <input type="date" value={day} data-testid="ledger-day" className={field}
            onChange={(e) => e.target.value && router.push(`/payments?day=${e.target.value}`)} />
        </label>
      </div>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{t('byMethod')}</h2>
        {summary.length === 0 ? <p className="text-sm text-stone-dark">{t('none')}</p> : (
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[40rem] border-collapse text-sm">
              <thead><tr className="border-b border-stone text-left">
                <th className="py-1">{t('method')}</th><th>{t('recorded')}</th><th>{t('verified')}</th><th>{t('awaiting')}</th><th>{t('refunded')}</th><th>{t('voided')}</th>
              </tr></thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.methodId} data-testid="ledger-method-row" data-code={s.code} className="border-b border-stone/60">
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
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{t('entries')}</h2>
        {entries.length === 0 && <p className="text-sm text-stone-dark">{t('none')}</p>}
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} data-testid="ledger-entry" data-state={state(e)} data-kind={e.kind}
              className={`flex flex-col gap-2 rounded border border-stone bg-white p-3 text-sm ${e.voided ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="tnum">{formatTime(e.receivedAt)}</span>
                <span>{e.customerDisplayName}</span>
                <span className="rounded bg-ivory px-2 py-0.5 text-xs">{e.kind === 'refund' ? t('refund') : t('payment')} · {e.methodCode}</span>
                <span className={`tnum font-semibold ${e.voided ? 'line-through' : ''}`}>{e.kind === 'refund' ? '-' : ''}{formatTHB(e.amountSatang)}</span>
                {e.reference && <span className="text-stone-dark">{e.reference}</span>}
                <span className="text-xs">{t(`state.${state(e)}`)}</span>
                {e.voidReason && <span className="text-xs text-clay">{e.voidReason}</span>}
                {!e.voided && (
                  <span className="ml-auto flex gap-2">
                    {!e.verified && <button data-testid="entry-verify" onClick={() => open('verify', e)} className="rounded border border-charcoal px-3 py-1">{t('verify')}</button>}
                    {e.kind === 'payment' && <button data-testid="entry-refund" onClick={() => open('refund', e)} className="rounded border border-charcoal px-3 py-1">{t('refund')}</button>}
                    <button data-testid="entry-void" onClick={() => open('void', e)} className="rounded border border-clay px-3 py-1 text-clay">{t('void')}</button>
                  </span>
                )}
              </div>
              {action?.entry.id === e.id && (
                <div className="flex flex-wrap items-end gap-3 border-t border-stone pt-2">
                  {action.kind === 'refund' && (
                    <label className="flex flex-col text-xs">{t('refundAmount')}
                      <input data-testid="refund-amount" value={amount} onChange={(x) => setAmount(x.target.value)} className={`${field} tnum`} /></label>
                  )}
                  {action.kind !== 'verify' && (
                    <label className="flex flex-col text-xs">{t('reason')}
                      <input data-testid="reason" value={reason} onChange={(x) => setReason(x.target.value)} className={field} /></label>
                  )}
                  <button data-testid="confirm" disabled={busy} onClick={confirm} className="rounded bg-charcoal px-3 py-1.5 text-ivory">{te('common.confirm')}</button>
                  <button onClick={() => setAction(null)} className="underline">{te('common.cancel')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{t('cash')}</h2>
        <form onSubmit={close} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">{t('counted')}
            <input data-testid="cash-counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className={`${field} tnum`} /></label>
          <label className="flex flex-col text-sm">{t('note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
          <button type="submit" disabled={busy} data-testid="cash-close" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('closeDay')}</button>
        </form>
        {closing && (
          <div className="tnum flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" data-testid="cash-closing">
            <span>{t('expected')} {formatTHB(closing.expectedSatang)}</span>
            <span>{t('counted')} {formatTHB(closing.countedSatang)}</span>
            <span>{t('difference')} <strong data-testid="cash-difference">{formatTHB(closing.countedSatang - closing.expectedSatang)}</strong></span>
            {closing.expectedNowSatang !== closing.expectedSatang && (
              <span data-testid="cash-changed" role="note" className="rounded bg-brass px-2 py-0.5 text-white">{t('cashChanged', { now: formatTHB(closing.expectedNowSatang) })}</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
