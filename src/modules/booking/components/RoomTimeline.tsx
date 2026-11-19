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
import { SpanSwitch } from './SpanSwitch';
import type { Role, RoomOpt, ServiceOpt, TherapistOpt } from './types';

const LANE_H = 48;
const LIVE_TABLES = ['bookings', 'room_blocks', 'therapist_shifts', 'therapist_time_off', 'payments'] as const;

/** The whole day left to right, one row per room (a room with several positions gets one lane per position). Click a booking to open it. */
export function RoomTimeline({ day, by = 'room', role, rows, therapists, rooms, services, embedded = false }: {
  embedded?: boolean;
  day: string; by?: 'room' | 'therapist'; role: Role; rows: BoardRow[]; therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[];
}) {
  const t = useTranslations('booking');
  const c = useTranslations('common');
  const locale = useLocale();
  useLiveRefresh(LIVE_TABLES);
  const [selected, setSelected] = useState<string | null>(null);

  const pixelsPerMinute = embedded ? 0.58 : 1;
  const labelWidth = embedded ? 96 : 144;
  const dayStartMs = new Date(`${day}T00:00:00+07:00`).getTime();
  const minOf = (iso: string) => Math.max(0, Math.min(1440, (new Date(iso).getTime() - dayStartMs) / 60000));
  const earliest = rows.length ? Math.min(...rows.map((r) => minOf(r.startsAt))) : 1440;
  const startHour = Math.min(8, Math.floor(earliest / 60));
  const width = (24 - startHour) * 60 * pixelsPerMinute;
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);

  const svcName = (id: string) => { const s = services.find((x) => x.id === id); return s ? (locale === 'en' && s.name_en ? s.name_en : s.name_th) : ''; };
  const therapistName = (id: string) => therapists.find((x) => x.id === id)?.display_name ?? '';
  const roomCodeOf = (id: string) => rooms.find((r) => r.id === id)?.code ?? '';
  const open = rows.find((r) => r.bookingId === selected) ?? null;
  const q = (d: string, v: string, b = by) => `/calendar?day=${d}&view=${v}${v === 'timeline' && b === 'therapist' ? '&by=therapist' : ''}`;
  const lines = by === 'therapist'
    ? therapists.map((x) => ({ id: x.id, title: x.display_name, sub: '', photo: x.photoUrl ?? null, lanes: 1, match: (r: BoardRow) => r.therapistId === x.id, lane: () => 0 }))
    : rooms.map((room) => {
      const posIds = room.room_positions.filter((p) => p.active).map((p) => p.id).sort();
      return { id: room.id, title: room.code, sub: `${room.display_name}${room.zone ? ` · ${room.zone}` : ''}`, photo: undefined, lanes: Math.max(1, posIds.length), match: (r: BoardRow) => r.roomId === room.id, lane: (r: BoardRow) => Math.max(0, posIds.indexOf(r.positionId)) };
    });

  return (
    <div className={`min-w-0 flex flex-col gap-3 ${open && !embedded ? 'lg:pr-[29rem]' : ''}`}>
      {!embedded && <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl">{t('title')}</h1>
        <Link href={q(addDays(day, -1), 'timeline')} className="underline">← {t('previousDay')}</Link>
        <span className="tnum font-semibold" data-testid="day-label">{day}</span>
        <Link href={q(addDays(day, 1), 'timeline')} className="underline">{t('nextDay')} →</Link>
        <Link href={q(bangkokDay(new Date()), 'timeline')} className="underline">{t('today')}</Link>
        <Link href="/counter" className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm">{locale === 'th' ? 'จอเคาน์เตอร์ ↗' : 'Counter display ↗'}</Link><span className="ml-auto"><SpanSwitch span="day" day={day} view="timeline" /></span>
        <nav className="flex gap-2 text-sm" aria-label="view">
          <Link href={q(day, 'therapists')}>{t('viewTherapists')}</Link>
          <Link href={q(day, 'rooms')}>{t('viewRooms')}</Link>
          <Link href={q(day, 'timeline')} aria-current="true" className="font-semibold underline">{t('viewTimeline')}</Link>
          <span aria-hidden className="text-stone-dark">|</span>
          <Link href={q(day, 'timeline', 'room')} data-testid="timeline-by-room" aria-current={by === 'room' ? 'true' : undefined} className={by === 'room' ? 'font-semibold underline' : ''}>{t('viewRooms')}</Link>
          <Link href={q(day, 'timeline', 'therapist')} data-testid="timeline-by-therapist" aria-current={by === 'therapist' ? 'true' : undefined} className={by === 'therapist' ? 'font-semibold underline' : ''}>{t('viewTherapists')}</Link>
        </nav>
      </div>}

      {open && <BookingDetails key={open.bookingId + open.version} row={open} role={role} moveOptions={{ therapists, rooms }}
        labels={{ service: svcName(open.serviceId), therapist: therapistName(open.therapistId), room: roomCodeOf(open.roomId) }} onClose={() => setSelected(null)} />}

      {rows.length === 0 && <p className={embedded ? 'px-4 pt-3 text-sm text-ink-muted' : 'text-stone-dark'}>{t('noBookings')}</p>}

      <div tabIndex={0} role="region" aria-label={t('viewTimeline')}
        className={embedded ? 'overflow-x-auto' : 'overflow-x-auto rounded border border-stone bg-white'} data-testid="timeline-scroll">
        <div className="min-w-max">
          <div className="flex h-8 border-b border-stone bg-ivory">
            <div className="sticky left-0 z-20 shrink-0 border-r border-stone bg-ivory" style={{ width: labelWidth }} />
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
                {line.photo !== undefined && <Avatar name={line.title} src={line.photo} size="sm" />}
                <span className="min-w-0 flex flex-col"><span className="truncate font-medium">{line.title}</span>{line.sub && <span className="truncate text-xs text-stone-dark">{line.sub}</span>}</span>
              </div>
              <div className="relative" style={{ width, height: line.lanes * LANE_H }}>
                {hours.map((h) => <div key={h} className="absolute h-full border-l border-stone/60" style={{ left: (h - startHour) * 60 * pixelsPerMinute }} />)}
                {rows.filter(line.match).map((r) => {
                  const left = (minOf(r.startsAt) - startHour * 60) * pixelsPerMinute;
                  const w = Math.max(28, (minOf(r.endsAt) - minOf(r.startsAt)) * pixelsPerMinute);
                  return (
                    <button key={r.bookingId} onClick={() => setSelected(r.bookingId)} data-testid="booking-card" data-booking-id={r.bookingId} data-status={r.status}
                      className={`absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-xs leading-tight ${bookingStatusStyle(r.status).card} ${selected === r.bookingId ? 'ring-2 ring-charcoal' : ''}`}
                      style={{ left, width: w - 2, top: line.lane(r) * LANE_H + 2, height: LANE_H - 4 }}>
                      <span className="tnum block truncate font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)} · {r.customerDisplayName}</span>
                      <span className="block truncate">{svcName(r.serviceId)}</span>
                      <span className="block truncate">{by === 'therapist' ? roomCodeOf(r.roomId) : therapistName(r.therapistId)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {lines.length === 0 && <p className="p-4 text-stone-dark">{c('empty')}</p>}
        </div>
      </div>
    </div>
  );
}
