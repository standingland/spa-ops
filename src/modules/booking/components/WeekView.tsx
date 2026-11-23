'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import type { BoardRow } from '../actions';
import { SpanSwitch } from './SpanSwitch';
import type { RoomOpt, ServiceOpt, TherapistOpt } from './types';

const LIVE_TABLES = ['bookings', 'room_blocks', 'therapist_shifts', 'therapist_time_off'] as const;
const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

/** Seven days, each a time-ordered list of compact cards, with therapist and room filters built from the query. */
export function WeekView({ monday, dayView, rows, therapists, rooms, services }: {
  monday: string; dayView: string; rows: BoardRow[]; therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[];
}) {
  const t = useTranslations('span');
  const b = useTranslations('booking');
  const nav = useTranslations('nav');
  const design = useTranslations('workspaceDesign');
  const locale = useLocale();
  useLiveRefresh(LIVE_TABLES);
  const [therapist, setTherapist] = useState('');
  const [room, setRoom] = useState('');
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekdays = t.raw('weekdays') as string[];
  const svc = (id: string) => { const s = services.find((x) => x.id === id); return s ? (locale === 'en' && s.name_en ? s.name_en : s.name_th) : ''; };
  const visible = useMemo(() => rows.filter((r) => (!therapist || r.therapistId === therapist) && (!room || r.roomId === room)), [rows, therapist, room]);
  const q = (d: string) => `/calendar?span=week&day=${d}&view=${dayView}`;

  return (
    <div className="flex flex-col gap-3">
      <WorkspaceHero title={nav('schedule')} description={design('calendarDesc')} icon="today" />
      <div className="workspace-surface workspace-toolbar">
        <Link href={q(addDays(monday, -7))} className="underline" data-testid="week-prev">← {t('previousWeek')}</Link>
        <span className="tnum font-semibold" data-testid="week-label">{monday} – {days[6]}</span>
        <Link href={q(addDays(monday, 7))} className="underline" data-testid="week-next">{t('nextWeek')} →</Link>
        <select aria-label={b('therapist')} value={therapist} onChange={(e) => setTherapist(e.target.value)} className={field} data-testid="week-filter-therapist">
          <option value="">{t('allTherapists')}</option>
          {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
        </select>
        <select aria-label={b('position')} value={room} onChange={(e) => setRoom(e.target.value)} className={field} data-testid="week-filter-room">
          <option value="">{t('allRooms')}</option>
          {rooms.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
        </select>
        <span className="ml-auto"><SpanSwitch span="week" day={monday} view={dayView} /></span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((d, i) => {
          const list = visible.filter((r) => bangkokDay(r.startsAt) === d);
          return (
            <section key={d} data-testid="week-day" data-day={d} aria-label={d} className="workspace-surface flex min-h-24 flex-col gap-1 p-2">
              <Link href={`/calendar?span=day&day=${d}&view=${dayView}`} className="tnum text-sm font-semibold underline">{weekdays[i]} {d.slice(8)}/{d.slice(5, 7)}</Link>
              {list.length === 0 && <span className="text-xs text-stone-dark">{t('noBookings')}</span>}
              {list.map((r) => (
                <Link key={r.bookingId} href={`/calendar?span=day&day=${d}`} data-testid="week-card" data-status={r.status}
                  className={`rounded border border-stone px-2 py-1 text-xs leading-tight ${r.status === 'cancelled' || r.status === 'no_show' ? 'opacity-60 line-through' : ''}`}>
                  <span className="tnum font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</span>
                  <span className="block truncate">{svc(r.serviceId)}</span>
                  <span className="block truncate">{r.customerDisplayName}</span>
                  <span className="block truncate">{therapists.find((x) => x.id === r.therapistId)?.display_name} · {rooms.find((x) => x.id === r.roomId)?.code}</span>
                  <span className="block truncate font-medium">{b(`status.${r.status}`)}</span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
