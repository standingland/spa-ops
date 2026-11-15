'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTHB, parseTHB } from '@/lib/money';
import { bangkokDay, formatTime } from '@/lib/time';
import type { ActionResult } from '@/lib/action';
import type { Earnings, Option, Rule } from '../schema';
import { removeRule, saveRule } from '../actions';
import { Metric, PeriodFilter, downloadCsv } from './BusinessShared';

export function EarningsDashboard({ from, to, report, rules, services, therapists }: {
  from: string; to: string; report: Earnings; rules: Rule[]; services: Option[]; therapists: Option[];
}) {
  const t = useTranslations('business'); const te = useTranslations(); const router = useRouter();
  const [busy, startTransition] = useTransition(); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent');
  const commission = report.summary.reduce((n, r) => n + r.commission_satang, 0);
  const treatments = report.summary.reduce((n, r) => n + r.treatments, 0);
  const name = (list: Option[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  function act(task: () => Promise<ActionResult>, after?: () => void) {
    setError(null); setSaved(false);
    startTransition(async () => {
      try {
        const r = await task();
        if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
        after?.(); setSaved(true); router.refresh();
      } catch { setError(te('common.failed')); }
    });
  }
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('earningsTitle')} subtitle={t('earningsSubtitle')} actions={<Button variant="secondary" onClick={() => downloadCsv(`earnings-${from}-${to}.csv`, [
      { header: t('therapist'), value: (r: Earnings['summary'][number]) => r.therapist_name },
      { header: t('treatments'), value: (r) => r.treatments },
      { header: t('commissionBaht'), value: (r) => r.commission_satang / 100 },
    ], report.summary)}>{t('export')}</Button>} />
    <PeriodFilter from={from} to={to} />
    <div className="grid gap-3 sm:grid-cols-2"><Metric label={t('commission')} value={formatTHB(commission)} /><Metric label={t('treatments')} value={String(treatments)} /></div>
    <Alert>{t('earningsHelp')}</Alert>
    {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
    {saved && <p role="status" className="text-body text-ink">{t('saved')}</p>}
    <section className="flex flex-col gap-3" aria-label={t('byTherapist')}>
      <h2 className="font-serif text-heading text-ink">{t('byTherapist')}</h2>
      {report.summary.length === 0 && <Card>{te('common.empty')}</Card>}
      <div className="grid gap-3 md:grid-cols-2">{report.summary.map((r) => <Card key={r.therapist_id} data-testid="earnings-summary" className="flex flex-col gap-2">
        <strong className="text-ink">{r.therapist_name}</strong><span className="text-caption text-ink-muted">{t('treatmentCount', { count: r.treatments })}</span>
        <dl className="grid grid-cols-2 gap-2 text-body"><dt>{t('commission')}</dt><dd className="tnum text-right">{formatTHB(r.commission_satang)}</dd></dl>
      </Card>)}</div>
    </section>
    <section className="flex flex-col gap-3" aria-label={t('rules')}>
      <h2 className="font-serif text-heading text-ink">{t('rules')}</h2><p className="text-body text-ink-muted">{t('rulesHelp')}</p>
      <Card><form className="grid gap-3 sm:grid-cols-2" data-testid="commission-rule-form" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget); const value = String(f.get('value'));
        const fixed = mode === 'fixed' ? parseTHB(value) : 0;
        const rate = mode === 'percent' ? Number(value) * 100 : 0;
        if (fixed === null || !Number.isInteger(Math.round(rate)) || Math.abs(rate - Math.round(rate)) > 0.0001) { setError(te('errors.INVALID_AMOUNT')); return; }
        act(() => saveRule({ serviceId: String(f.get('service')), therapistId: String(f.get('therapist')) || null, mode, rateBps: Math.round(rate), fixedSatang: fixed }));
      }}>
        <Field label={t('service')}><Select name="service" required defaultValue=""><option value="" disabled>{t('choose')}</option>{services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={t('therapist')}><Select name="therapist"><option value="">{t('allTherapists')}</option>{therapists.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={t('commissionMode')}><Select value={mode} onChange={(e) => setMode(e.target.value as 'percent' | 'fixed')}><option value="percent">{t('percent')}</option><option value="fixed">{t('fixed')}</option></Select></Field>
        <Field label={mode === 'percent' ? t('ratePercent') : t('fixedBaht')}><Input key={mode} name="value" type="number" min="0" max={mode === 'percent' ? '100' : '1000000'} step="0.01" required /></Field>
        <Button type="submit" disabled={busy}>{te('common.save')}</Button>
      </form></Card>
      {rules.map((r) => <Card key={r.id} className="flex flex-wrap items-center gap-3" data-testid="commission-rule">
        <div className="min-w-0 flex-1"><strong className="break-words text-body">{name(services, r.service_id)}</strong><p className="text-caption text-ink-muted">{r.therapist_id ? name(therapists, r.therapist_id) : t('allTherapists')}</p></div>
        <Badge>{r.mode === 'percent' ? `${r.rate_bps / 100}%` : formatTHB(r.fixed_satang)}</Badge>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => removeRule(r.id))}>{t('removeRule')}</Button>
      </Card>)}
    </section>
    <section className="flex flex-col gap-3" aria-label={t('details')}>
      <h2 className="font-serif text-heading text-ink">{t('details')}</h2><p className="text-caption text-ink-muted">{t('latestRows', { shown: report.entries.length, total: report.entry_count })}</p>
      {report.entries.map((r) => <Card key={r.id} className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><strong className="break-words">{r.therapist_name} · {name(services, r.service_id)}</strong><p className="text-caption text-ink-muted">{bangkokDay(r.completed_at)} {formatTime(r.completed_at)} · {r.booking_id.slice(0, 8)}</p></div><span className="text-caption">{t('netBase')}: {formatTHB(r.net_satang)}</span><strong className="tnum">{formatTHB(r.commission_satang)}</strong></Card>)}
    </section>
  </div>;
}
