'use client';
import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Field, Input } from '@/components/ui/field';
import { bangkokDay, formatTime } from '@/lib/time';
import { formatTHB } from '@/lib/money';
import { uiErrorKey } from '@/lib/errors';
import { closeCommission, recordPayout } from '../actions';
import type { Settlement } from '../schema';

export function CommissionSettlement({ from, to, data }: { from: string; to: string; data: Settlement }) {
  const t = useTranslations('care'); const te = useTranslations(); const router = useRouter();
  const [busy, transition] = useTransition(); const [error, setError] = useState(''); const [saved, setSaved] = useState(false); const [confirm, setConfirm] = useState(false);
  const request = useRef<{ revision: string; key: string } | null>(null);
  function run(task: () => Promise<{ ok: boolean; code?: string }>) { setError(''); setSaved(false); transition(async () => { try { const r = await task(); if (!r.ok) { setError(te(uiErrorKey(r.code ?? 'UNKNOWN'))); router.refresh(); return; } setSaved(true); setConfirm(false); router.refresh(); } catch { setError(te('common.failed')); } }); }
  return <section className="flex flex-col gap-4" aria-label={t('settlement')}>
    <h2 className="font-serif text-heading">{t('settlement')}</h2><Alert>{t('settlementHelp')}</Alert>
    {error && <Alert tone="error">{error}</Alert>}{saved && <p role="status">{t('saved')}</p>}
    <Card className="flex flex-col gap-3"><h3 className="font-serif text-heading">{t('pendingApproval')} · {from}–{to}</h3>
      <strong className="tnum text-title">{formatTHB(data.total_satang)}</strong><p className="text-caption">{t('settlementCount', { count: data.count })}</p>
      {data.summary.map((r) => <p className="flex flex-wrap justify-between gap-3" key={r.therapist_id}><span>{r.therapist_name}</span><span className="tnum">{formatTHB(r.amount_satang)}</span></p>)}
      {confirm ? <div className="flex flex-col gap-3"><p>{t('approveWarning')}</p><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => {
        if (request.current?.revision !== data.revision) request.current = { revision: data.revision, key: crypto.randomUUID() };
        const key = request.current.key; run(() => closeCommission({ from, to, revision: data.revision, key }));
      }}>{t('confirmApproval')}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>{te('common.cancel')}</Button></div></div>
        : <div><Button disabled={busy || !data.count || to > bangkokDay(new Date())} onClick={() => setConfirm(true)}>{t('approve')}</Button></div>}
    </Card>
    <h3 className="font-serif text-heading">{t('approvedBatches')}</h3>
    {!data.batches.length && <Card>{t('noBatches')}</Card>}
    {data.batches.map((b) => <Card key={b.id} className="flex flex-col gap-4" data-testid="commission-batch">
      <strong>{b.from_day}–{b.to_day}</strong><p className="text-caption tnum">{t('approvedAt')}: {bangkokDay(b.approved_at)} {formatTime(b.approved_at)} · {b.id.slice(0, 8)}</p>
      {b.therapists.map((r) => <div key={r.therapist_id} className="flex flex-col gap-3 border-t border-line pt-3"><p className="flex flex-wrap justify-between gap-3"><strong>{r.therapist_name}</strong><span className="tnum">{formatTHB(r.amount_satang)}</span></p>
        {r.paid_at ? <p className="break-words text-caption">{t('paid')} · {bangkokDay(r.paid_at)} {formatTime(r.paid_at)} · {r.reference}</p> : <form className="grid items-end gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => recordPayout({ batchId: b.id, therapistId: r.therapist_id, reference: String(f.get('reference')), paidAt: `${f.get('paidAt')}:00+07:00` })); }}>
          <Field label={t('payoutDate')}><Input name="paidAt" type="datetime-local" required defaultValue={`${bangkokDay(new Date())}T${formatTime(new Date().toISOString())}`} /></Field>
          <div className="min-w-0"><Field label={t('payoutReference')}><Input name="reference" required maxLength={200} /></Field></div><Button className="justify-self-start" type="submit" variant="secondary" disabled={busy}>{r.amount_satang <= 0 ? t('recordAdjustment') : t('recordPaid')}</Button>
        </form>}
      </div>)}
    </Card>)}
  </section>;
}
