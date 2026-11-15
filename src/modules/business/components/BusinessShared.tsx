'use client';

import { useTranslations } from 'next-intl';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toCsv, type CsvColumn } from '@/lib/csv';

export function PeriodFilter({ from, to }: { from: string; to: string }) {
  const t = useTranslations('business');
  return <form className="flex flex-wrap items-end gap-3" method="get">
    <Field label={t('from')}><Input name="from" type="date" required defaultValue={from} /></Field>
    <Field label={t('to')}><Input name="to" type="date" required defaultValue={to} /></Field>
    <Button type="submit" variant="secondary">{t('show')}</Button>
  </form>;
}
export function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="flex min-w-0 flex-col gap-2"><span className="text-caption text-ink-muted">{label}</span><strong className="tnum break-words text-heading text-ink">{value}</strong></Card>;
}
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
