'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { addDays } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { monthGrid } from '../month';
import { SpanSwitch } from './SpanSwitch';

const LIVE_TABLES = ['bookings'] as const;

/** One cell per day with the booking count and booked hours; choosing a cell opens that day. */
export function MonthView({ month, days, today }: { month: string; days: { day: string; bookings: number; bookedMinutes: number }[]; today: string }) {
  const t = useTranslations('span');
  const b = useTranslations('booking');
  useLiveRefresh(LIVE_TABLES);
  const grid = monthGrid(month);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const weekdays = t.raw('weekdays') as string[];
  const first = `${month}-01`;
  const prev = addDays(first, -1).slice(0, 7);
  const next = addDays(first, 32).slice(0, 7); // 32 days after the 1st always lands in the next month
  const q = (m: string) => `/calendar?span=month&day=${m}-01`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl">{b('title')}</h1>
        <Link href={q(prev)} className="underline" data-testid="month-prev">← {t('previousMonth')}</Link>
        <span className="tnum font-semibold" data-testid="month-label">{month}</span>
        <Link href={q(next)} className="underline" data-testid="month-next">{t('nextMonth')} →</Link>
        <span className="ml-auto"><SpanSwitch span="month" day={first} view="therapists" /></span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs text-stone-dark">{weekdays.map((w) => <div key={w} className="px-1">{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((d) => {
          const c = byDay.get(d);
          const inMonth = d.startsWith(month);
          return (
            <Link key={d} href={`/calendar?span=day&day=${d}`} data-testid="month-cell" data-day={d}
              className={`flex min-h-20 flex-col gap-1 rounded border p-1.5 text-sm ${inMonth ? 'border-stone bg-white' : 'border-stone/50 bg-ivory text-stone-dark'} ${d === today ? 'ring-2 ring-charcoal' : ''}`}>
              <span className="tnum font-semibold">{d.slice(8)}</span>
              {c ? (
                <>
                  <span data-testid="month-count"><strong className="tnum">{c.bookings}</strong> {t('bookings')}</span>
                  <span className="tnum text-xs text-stone-dark">{(c.bookedMinutes / 60).toFixed(1)} {t('hours')}</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
