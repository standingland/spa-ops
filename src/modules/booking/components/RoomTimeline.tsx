'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useLiveRefresh } from '@/lib/realtime';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { bookingStatusStyle } from '@/components/ui/status';
import type { BoardRow } from '../actions';
import { BookingDetails } from './BookingDetails';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/shell/Icon';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { StatusChip } from '@/components/ui/badge';
import { SpanSwitch } from './SpanSwitch';
import type { Role, RoomOpt, ServiceOpt, TherapistOpt } from './types';

const LANE_H = 56;
const LIVE_TABLES = ['bookings', 'room_blocks', 'therapist_shifts', 'therapist_time_off', 'payments'] as const;

export type TimelineBlock = { id: string; roomId: string; kind: 'maintenance' | 'cleaning' | 'closed'; start: string; end: string };

/** The whole day left to right, one row per room (a room with several positions gets one lane per position). Click a booking to open it. */
export function RoomTimeline({ day, now, by = 'room', role, rows, therapists, rooms, services, blocks = [], embedded = false }: {
  embedded?: boolean;
  day: string; now?: string; by?: 'room' | 'therapist'; role: Role; rows: BoardRow[];
  therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[]; blocks?: TimelineBlock[];
}) {
  const t = useTranslations('booking');
  const nav = useTranslations('nav');
  const design = useTranslations('workspaceDesign');
  const c = useTranslations('common');
  const locale = useLocale();
  useLiveRefresh(LIVE_TABLES);
  const [selected, setSelected] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [therapist, setTherapist] = useState('');

  const pixelsPerMinute = embedded ? 0.58 : 0.82;
  const labelWidth = embedded ? 96 : 128;
  const dayStartMs = new Date(`${day}T00:00:00+07:00`).getTime();
  const minOf = (iso: string) => Math.max(0, Math.min(1440, (new Date(iso).getTime() - dayStartMs) / 60000));
  const earliest = rows.length ? Math.min(...rows.map((r) => minOf(r.startsAt))) : 1440;
  const startHour = Math.min(10, Math.floor(earliest / 60));
  const latest = rows.length ? Math.max(...rows.map((row) => minOf(row.endsAt))) : 0;
  const endHour = Math.max(22, Math.ceil(latest / 60));
  const width = (endHour - startHour) * 60 * pixelsPerMinute;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const svcName = (id: string) => { const s = services.find((x) => x.id === id); return s ? (locale === 'en' && s.name_en ? s.name_en : s.name_th) : ''; };
  const therapistName = (id: string) => therapists.find((x) => x.id === id)?.display_name ?? '';
  const roomCodeOf = (id: string) => rooms.find((r) => r.id === id)?.code ?? '';
  const open = rows.find((r) => r.bookingId === selected) ?? null;
  const q = (d: string, v: string, b = by) => `/calendar?day=${d}&view=${v}${v === 'timeline' && b === 'therapist' ? '&by=therapist' : ''}`;
  const filtered = rows.filter((row) => (!room || row.roomId === room) && (!therapist || row.therapistId === therapist));
  const scheduled = filtered.filter((row) => row.status === 'requested' || row.status === 'confirmed' || row.status === 'checked_in');
  const upcoming = scheduled.filter((row) => !now || Date.parse(row.endsAt) > Date.parse(now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date(`${day}T12:00:00+07:00`));
  const lines = by === 'therapist'
    ? therapists.filter((x) => !therapist || x.id === therapist).map((x) => ({ id: x.id, title: x.display_name, sub: '', photo: x.photoUrl ?? null, lanes: 1, match: (r: BoardRow) => r.therapistId === x.id, lane: () => 0 }))
    : rooms.filter((x) => !room || x.id === room).map((room) => {
      const posIds = room.room_positions.filter((p) => p.active).map((p) => p.id).sort();
      return { id: room.id, title: room.code, sub: `${room.display_name}${room.zone ? ` · ${room.zone}` : ''}`, photo: undefined, lanes: Math.max(1, posIds.length), match: (r: BoardRow) => r.roomId === room.id, lane: (r: BoardRow) => Math.max(0, posIds.indexOf(r.positionId)) };
    });

  return (
    <div className="calendar-schedule flex min-w-0 flex-col gap-3" data-details-open={!embedded && !!open}>
      {!embedded && <>
        <WorkspaceHero title={nav('schedule')} description={design('calendarDesc')} icon="today" />
        <div className="calendar-spans">
          <SpanSwitch span="day" day={day} view="timeline" />
          {role !== 'therapist' && <Link href={`/calendar?day=${day}&create=1`} className={buttonVariants({ size: 'sm' })}>{t('new')}</Link>}
        </div>
        <div className="workspace-surface workspace-toolbar calendar-toolbar">
          <nav className="workspace-segmented" aria-label={nav('schedule')}>
            <Link href={q(addDays(day, -1), 'timeline')} aria-label={t('previousDay')}>‹</Link>
            <time className="tnum font-semibold px-2" data-testid="day-label" dateTime={day}>{date}</time>
            <Link href={q(addDays(day, 1), 'timeline')} aria-label={t('nextDay')}>›</Link>
          </nav>
          <Select aria-label={t('therapist')} value={therapist} onChange={(event) => setTherapist(event.target.value)}>
            <option value="">{design('therapistFilter')}</option>
            {therapists.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </Select>
          <Select aria-label={nav('rooms')} value={room} onChange={(event) => setRoom(event.target.value)}>
            <option value="">{design('roomFilter')}</option>
            {rooms.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
          </Select>
          <Link href={q(bangkokDay(new Date()), 'timeline')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('today')}</Link>
          <Link href="/counter" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{locale === 'th' ? 'จอเคาน์เตอร์' : 'Counter display'}</Link>
        </div>
      </>}

      {open && <BookingDetails key={open.bookingId + open.version} row={open} role={role} moveOptions={{ therapists, rooms }}
        labels={{ service: svcName(open.serviceId), therapist: therapistName(open.therapistId), room: roomCodeOf(open.roomId) }} onClose={() => setSelected(null)} />}

      <div className={embedded ? undefined : 'calendar-main'}>
        <div className={embedded ? undefined : 'calendar-content'}>
          {!embedded && <nav className="workspace-segmented calendar-views" aria-label={t('viewTimeline')}>
            <Link href={q(day, 'timeline', 'room')} data-testid="timeline-by-room" aria-current={by === 'room' ? 'true' : undefined}>{t('viewRooms')}</Link>
            <Link href={q(day, 'timeline', 'therapist')} data-testid="timeline-by-therapist" aria-current={by === 'therapist' ? 'true' : undefined}>{t('viewTherapists')}</Link>
            <Link href={q(day, 'therapists')}>{design('editSchedule')}</Link>
          </nav>}
          {!filtered.length && <p className={embedded ? 'px-4 pt-3 text-sm text-ink-muted' : 'text-caption text-ink-muted'}>{t('noBookings')}</p>}

      <div tabIndex={0} role="region" aria-label={t('viewTimeline')}
        className={embedded ? 'workspace-scroll' : 'workspace-surface workspace-scroll'} data-testid="timeline-scroll">
        <div className="min-w-max">
          <div className="flex h-8 border-b border-stone bg-ivory">
            <div className="sticky left-0 z-20 flex shrink-0 items-center border-r border-stone bg-ivory px-2 text-caption font-semibold" style={{ width: labelWidth }}>
              {by === 'room' ? nav('rooms') : t('therapist')}
            </div>
            <div className="relative" style={{ width }} aria-hidden>
              {hours.map((h) => (
                <div key={h} className="tnum absolute top-0 h-full border-l border-stone/60 pl-1 pt-1.5 text-xs text-stone-dark"
                  style={{ left: (h - startHour) * 60 * pixelsPerMinute }}>
                  {(!embedded || (h - startHour) % 2 === 0) && `${String(h).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>
          </div>
          {lines.map((line) => (
            <div key={line.id} className="flex border-b border-stone last:border-b-0" data-testid="timeline-row" data-row-id={line.id}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-stone bg-ivory px-2 text-sm" style={{ width: labelWidth }}>
                {line.photo !== undefined ? <Avatar name={line.title} src={line.photo} size="sm" /> : !embedded && <span aria-hidden="true" className="calendar-room-thumb" />}
                <span className="min-w-0 flex flex-col"><span className="truncate font-medium">{line.title}</span>{line.sub && <span className="truncate text-xs text-stone-dark">{line.sub}</span>}</span>
              </div>
              <div className="relative" style={{ width, height: line.lanes * LANE_H }}>
                {hours.map((h) => <div key={h} className="absolute h-full border-l border-stone/60" style={{ left: (h - startHour) * 60 * pixelsPerMinute }} />)}
                {by === 'room' && blocks.filter((block) => block.roomId === line.id).map((block) => {
                  const start = Math.max(startHour * 60, minOf(block.start));
                  const end = Math.min(endHour * 60, minOf(block.end));
                  if (start >= end) return null;
                  const label = design(`blocks.${block.kind}`);
                  return <div key={block.id} className="calendar-block" title={label}
                    style={{ left: (start - startHour * 60) * pixelsPerMinute, width: (end - start) * pixelsPerMinute }}>{label}</div>;
                })}
                {filtered.filter(line.match).map((r) => {
                  const left = (minOf(r.startsAt) - startHour * 60) * pixelsPerMinute;
                  const w = Math.max(28, (minOf(r.endsAt) - minOf(r.startsAt)) * pixelsPerMinute);
                  return (
                    <button key={r.bookingId} onClick={() => setSelected(r.bookingId)} data-testid="booking-card" data-booking-id={r.bookingId} data-status={r.status}
                      title={`${r.customerDisplayName} · ${svcName(r.serviceId)} · ${formatTime(r.startsAt)}–${formatTime(r.endsAt)}`}
                      className={`calendar-line-booking absolute overflow-hidden px-1.5 py-0.5 text-left text-xs leading-tight ${bookingStatusStyle(r.status).card} ${selected === r.bookingId ? 'ring-2 ring-charcoal' : ''}`}
                      style={{ left, width: w - 2, top: line.lane(r) * LANE_H + 2, height: LANE_H - 4 }}>
                      <span className="block truncate font-semibold">{r.customerDisplayName}</span>
                      <span className="block truncate">{svcName(r.serviceId)} · {by === 'therapist' ? roomCodeOf(r.roomId) : therapistName(r.therapistId)}</span>
                      <span className="tnum block truncate">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {lines.length === 0 && <p className="p-4 text-stone-dark">{c('empty')}</p>}
        </div>
      </div>
          {!embedded && therapists.length > 0 && <section className="workspace-surface calendar-team">
            <h2 className="workspace-section-title">{nav('therapists')}</h2>
            <ul>{therapists.map((person) => (
              <li key={person.id}><button type="button" aria-pressed={therapist === person.id} onClick={() => setTherapist(therapist === person.id ? '' : person.id)}>
                <Avatar name={person.display_name} src={person.photoUrl} size="sm" /><span>{person.display_name}</span>
              </button></li>
            ))}</ul>
          </section>}
        </div>
        {!embedded && <aside className="calendar-side">
          <section className="workspace-surface calendar-panel">
            <h2 className="workspace-section-title">{t('title')}</h2>
            <div className="calendar-counts">
              {([
                [design('allBookings'), filtered.length, 'today'],
                [design('scheduled'), scheduled.length, 'schedule'],
                [t('status.in_treatment'), filtered.filter((row) => row.status === 'in_treatment').length, 'checklist'],
              ] as const).map(([label, count, icon]) => <div key={label}><Icon name={icon} /><strong>{count}</strong><span>{label}</span></div>)}
            </div>
          </section>
          <section className="workspace-surface calendar-panel">
            <h2 className="workspace-section-title">{design('nextAppointments')}</h2>
            {!upcoming.length && <p className="text-caption text-ink-muted">{design('noUpcomingAppointments')}</p>}
            <ul className="calendar-next">
              {upcoming.slice(0, 6).map((row) => (
                <li key={row.bookingId}><button type="button" onClick={() => setSelected(row.bookingId)}>
                  <time className="tnum" dateTime={row.startsAt}>{formatTime(row.startsAt)}</time>
                  <span><strong>{svcName(row.serviceId)}</strong><small>{roomCodeOf(row.roomId)} · {therapistName(row.therapistId)}</small></span>
                  <StatusChip kind="booking" status={row.status} label={t(`status.${row.status}`)} />
                </button></li>
              ))}
            </ul>
          </section>
        </aside>}
      </div>
    </div>
  );
}
