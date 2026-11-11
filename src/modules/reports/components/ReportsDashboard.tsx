'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { addDays } from '@/lib/time';
import { formatTHB } from '@/lib/money';
import type { MetricKey } from '../definitions';
import type { ReportData, ReportRange } from '../schema';
import { Bars } from './Bars';
import { PeakGrid } from './PeakGrid';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
type Range = Required<ReportRange>;

function presetRange(preset: string, today: string): { from: string; to: string } {
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7days') return { from: addDays(today, -6), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const first = `${today.slice(0, 7)}-01`;
  const lastPrev = addDays(first, -1);
  return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
}

export function ReportsDashboard({ range, today, data }: { range: Range; today: string; data: ReportData }) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [group, setGroup] = useState<'zone' | 'category'>('zone');
  const go = (r: { from: string; to: string }, grain = range.grain) => router.push(`/reports?from=${r.from}&to=${r.to}&grain=${grain}`);

  const s = data.summary;
  const collected = data.revenue.reduce((n, r) => n + r.collectedSatang, 0);
  const refunded = data.revenue.reduce((n, r) => n + r.refundedSatang, 0);
  const csv = (name: string) => `/api/reports/${name}/csv?from=${range.from}&to=${range.to}&grain=${range.grain}&lang=${locale}`;

  const help = (k: MetricKey) => <p data-testid="metric-help" className="text-xs text-stone-dark">{t(`metrics.${k}`)}</p>;
  const exportLink = (name: string) => <a href={csv(name)} download data-testid={`export-${name}`} className="text-sm underline">{t('export')}</a>;
  const kpi = (id: string, label: string, value: string, metric: MetricKey) => (
    <div className="flex flex-col gap-1 rounded border border-stone bg-white p-3">
      <div className="text-xs text-stone-dark">{label}</div>
      <div className="tnum text-2xl" data-testid={`kpi-${id}`}>{value}</div>
      {help(metric)}
    </div>
  );
  const section = (title: string, exportName: string | null, children: React.ReactNode, metric?: MetricKey) => (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-4"><h2 className="text-lg">{title}</h2>{exportName && <span className="ml-auto">{exportLink(exportName)}</span>}</div>
      {metric && help(metric)}
      {children}
    </section>
  );
  const table = (head: string[], rows: (string | number)[][], id: string) => (
    <div className="overflow-x-auto">
      <table className="tnum w-full min-w-[28rem] border-collapse text-sm" data-testid={id}>
        <thead><tr className="border-b border-stone text-left">{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-stone/60">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  const groups = new Map<string, typeof data.rooms>();
  for (const r of data.rooms) {
    const key = (group === 'zone' ? r.zone : r.categoryName) || '—';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-2 text-2xl">{t('title')}</h1>
        {(['today', '7days', 'month', 'lastMonth'] as const).map((p) => (
          <button key={p} data-testid={`range-preset-${p === '7days' ? '7days' : p === 'lastMonth' ? 'last-month' : p}`} onClick={() => go(presetRange(p, today))}
            className="rounded border border-charcoal px-3 py-1.5 text-sm">{t(`presets.${p}`)}</button>
        ))}
        <label className="flex flex-col text-xs">{t('from')}<input type="date" data-testid="range-from" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
        <label className="flex flex-col text-xs">{t('to')}<input type="date" data-testid="range-to" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        <button data-testid="range-apply" onClick={() => from && to && go({ from, to })} className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('apply')}</button>
        <label className="flex flex-col text-xs">{t('grain')}
          <select data-testid="grain" value={range.grain} onChange={(e) => go(range, e.target.value as Range['grain'])} className={field}>
            {(['day', 'week', 'month'] as const).map((g) => <option key={g} value={g}>{t(`grains.${g}`)}</option>)}
          </select></label>
        <span className="tnum ml-auto text-sm text-stone-dark" data-testid="range-label">{range.from} → {range.to}</span>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('headline')}>
        {kpi('booked', t('kpi.booked'), formatTHB(s.bookedSatang), 'booked')}
        {kpi('collected', t('kpi.collected'), formatTHB(collected), 'collected')}
        {kpi('net', t('kpi.net'), formatTHB(collected - refunded), 'net')}
        {kpi('bookings', t('kpi.bookings'), String(s.bookings), 'reschedules')}
        {kpi('avg', t('kpi.avg'), formatTHB(s.avgTransactionSatang), 'avgTransaction')}
        {kpi('cancel-rate', t('kpi.cancelRate'), pct(s.cancellationRate), 'cancellationRate')}
        {kpi('no-show-rate', t('kpi.noShowRate'), pct(s.noShowRate), 'noShowRate')}
        {kpi('returning-rate', t('kpi.returningRate'), pct(s.returningRate), 'returningRate')}
      </section>

      {section(t('revenueOverTime'), 'revenue',
        data.revenue.length === 0 ? <p className="text-sm text-stone-dark">{t('none')}</p>
          : <Bars rows={data.revenue.map((r) => ({ label: r.bucket, a: r.bookedSatang, b: r.collectedSatang }))} aLabel={t('kpi.booked')} bLabel={t('kpi.collected')} />,
        'refunded')}

      {section(t('byService'), 'services',
        table([t('col.service'), t('col.completed'), t('col.minutes'), t('col.booked')], data.services.map((r) => [r.name, r.completed, r.minutes, formatTHB(r.bookedSatang)]), 'services-table'), 'byService')}

      {section(t('byTherapist'), 'therapists',
        table([t('col.therapist'), t('col.completed'), t('col.minutes'), t('col.booked')], data.therapists.map((r) => [r.name, r.completed, r.minutes, formatTHB(r.bookedSatang)]), 'therapists-table'), 'byTherapist')}

      {section(t('roomUtilization'), 'rooms', (
        <>
          <label className="flex items-center gap-2 text-sm">{t('groupBy')}
            <select data-testid="group-by" value={group} onChange={(e) => setGroup(e.target.value as 'zone' | 'category')} className={field}>
              <option value="zone">{t('byZone')}</option><option value="category">{t('byCategory')}</option>
            </select></label>
          {[...groups.entries()].map(([name, rows]) => (
            <div key={name} data-testid="room-group" data-group={name} className="flex flex-col gap-1">
              <h3 className="font-medium" data-testid="room-group-title">{name}</h3>
              {table([t('col.room'), t('col.openMinutes'), t('col.bookedMinutes'), t('col.utilization'), t('col.turnovers'), t('col.avgTurnover'), t('col.onTime')],
                rows.map((r) => [r.code, r.openMinutes, r.bookedMinutes, pct(r.utilization), r.turnovers, r.avgTurnoverMin === null ? '—' : r.avgTurnoverMin.toFixed(1), pct(r.onTimeRate)]), 'rooms-table')}
            </div>
          ))}
        </>
      ), 'roomUtilization')}

      {section(t('therapistUtilization'), 'therapist-utilization',
        table([t('col.therapist'), t('col.shiftMinutes'), t('col.timeOffMinutes'), t('col.bookedMinutes'), t('col.utilization')],
          data.therapistUtil.map((r) => [r.name, r.shiftMinutes, r.timeOffMinutes, r.bookedMinutes, pct(r.utilization)]), 'therapist-util-table'), 'therapistUtilization')}

      {section(t('peaks'), 'peaks', <PeakGrid cells={data.peaks} weekday={(d) => t(`weekdays.${d}`)} />, 'peaks')}
    </div>
  );
}
