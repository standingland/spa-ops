'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import type { ActionResult } from '@/lib/action';
import { submitStaffRequest } from '../actions';
import type { RequestKind } from '../model';
import { RequestFeedback } from './RequestFeedback';

export function RequestForm({ kind, today, monthDays }: { kind: RequestKind; today: string; monthDays: string[] }) {
  const t = useTranslations('staffRequests');
  const locale = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<ActionResult>();
  const [busy, startTransition] = useTransition();
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const offset = (new Date(monthDays[0]).getUTCDay() + 6) % 7;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setResult(undefined);
    startTransition(async () => {
      const saved = await submitStaffRequest(kind === 'sick' ? { kind, from, to } : {
        kind, days: selected, start: fields.get('start'), end: fields.get('end'),
      });
      setResult(saved);
      if (saved.ok) setSelected([]);
    });
  }

  return (
    <Card className="max-w-3xl">
      <form className="grid gap-4" onSubmit={submit}>
        <p className="text-body text-ink-muted">{t(kind === 'sick' ? 'sickIntro' : 'shiftIntro')}</p>
        {kind === 'sick' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('firstDay')}>
              <Input type="date" required value={from} name="from" onChange={(e) => {
                const date = e.currentTarget.value;
                setFrom(date);
                if (date > to) setTo(date);
              }} />
            </Field>
            <Field label={t('lastDay')}>
              <Input type="date" required value={to} name="to" min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 font-semibold">{month.format(new Date(monthDays[0]))}</legend>
              <div className="grid max-w-md grid-cols-7 gap-1.5">
                {Array.from({ length: 7 }, (_, day) => (
                  <span key={day} aria-hidden="true" className="text-center text-caption text-ink-muted">
                    {weekday.format(new Date(Date.UTC(2026, 0, 5 + day)))}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => <span key={i} aria-hidden="true" />)}
                {monthDays.map((date) => (
                  <label key={date} className="block cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={selected.includes(date)}
                      aria-label={fullDate.format(new Date(date))}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelected((days) => checked ? [...days, date] : days.filter((d) => d !== date));
                      }}
                    />
                    <span className="grid min-h-11 place-items-center rounded-md border border-line bg-surface text-body
                      peer-checked:border-ink peer-checked:bg-tint-available peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                      {Number(date.slice(-2))}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('shiftStart')}><Input type="time" name="start" required /></Field>
              <Field label={t('shiftEnd')}><Input type="time" name="end" required /></Field>
            </div>
            <p className="text-caption text-ink-muted">{t('overnight')}</p>
          </>
        )}
        <Button className="w-fit" type="submit" disabled={busy || (kind === 'shift' && selected.length === 0)}>
          {t('send')}
        </Button>
        <RequestFeedback result={result} success="sent" />
      </form>
    </Card>
  );
}
