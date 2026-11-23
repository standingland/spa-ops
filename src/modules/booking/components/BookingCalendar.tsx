'use client';

import { useMemo, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { useLiveRefresh } from '@/lib/realtime';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { moveBooking, type BoardRow } from '../actions';
import { isDraggable, moveFromDrop } from '../drop';
import type { MoveBookingInput } from '../schema';
import { NewBookingForm } from './NewBookingForm';
import { SpanSwitch } from './SpanSwitch';
import { Avatar } from '@/components/ui/avatar';
import { bookingStatusStyle } from '@/components/ui/status';
import { BookingDetails } from './BookingDetails';
import type { Role, RoomOpt, ServiceOpt, TherapistOpt } from './types';

const PX_PER_MIN = 1;
const LIVE_TABLES = ['bookings', 'room_blocks', 'therapist_shifts', 'therapist_time_off', 'payments'] as const;

export function BookingCalendar({ day, view, role, rows, therapists, rooms, services, retiredRooms = [], initiallyCreating = false }: {
  /** Deactivated rooms: not offered or shown as columns, but their code still appears on past bookings. */
  initiallyCreating?: boolean;
  retiredRooms?: { id: string; code: string }[];
  day: string; view: 'therapists' | 'rooms'; role: Role; rows: BoardRow[];
  therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[];
}) {
  const t = useTranslations('booking');
  const nav = useTranslations('nav');
  const design = useTranslations('workspaceDesign');
  const c = useTranslations('common');
  const locale = useLocale();
  useLiveRefresh(LIVE_TABLES);
  const [creating, setCreating] = useState(initiallyCreating && role !== 'therapist');
  const [selected, setSelected] = useState<string | null>(null);
  const isDesk = role !== 'therapist';

  const dayStartMs = new Date(`${day}T00:00:00+07:00`).getTime();
  const minOf = (iso: string) => Math.max(0, Math.min(1440, (new Date(iso).getTime() - dayStartMs) / 60000));
  const earliest = rows.length ? Math.min(...rows.map((r) => minOf(r.startsAt))) : 1440;
  const startHour = Math.min(8, Math.floor(earliest / 60));
  const height = (24 - startHour) * 60 * PX_PER_MIN;
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);

  const svc = (id: string) => services.find((s) => s.id === id);
  const svcName = (id: string) => { const s = svc(id); return s ? (locale === 'en' && s.name_en ? s.name_en : s.name_th) : ''; };
  const therapistName = (id: string) => therapists.find((x) => x.id === id)?.display_name ?? '';
  const therapistOf = (id: string) => therapists.find((x) => x.id === id);
  const roomOf = (id: string) => rooms.find((r) => r.id === id);
  const roomCodeOf = (id: string) => roomOf(id)?.code ?? retiredRooms.find((r) => r.id === id)?.code ?? '';

  const columns = useMemo(() => {
    if (view === 'therapists') return therapists.map((x) => ({ id: x.id, title: x.display_name, zone: '', lanes: 1, match: (r: BoardRow) => r.therapistId === x.id, lane: () => 0 }));
    return [...rooms].map((room) => {
      const posIds = room.room_positions.filter((p) => p.active).map((p) => p.id).sort();
      return { id: room.id, title: `${room.code}`, zone: room.zone ?? '', lanes: Math.max(1, posIds.length), match: (r: BoardRow) => r.roomId === room.id, lane: (r: BoardRow) => Math.max(0, posIds.indexOf(r.positionId)) };
    });
  }, [view, therapists, rooms]);

  const open = rows.find((r) => r.bookingId === selected) ?? null;
  const q = (d: string, v: string = view) => `/calendar?day=${d}&view=${v}`;

  const te = useTranslations();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [pending, setPending] = useState<{ row: BoardRow; input: MoveBookingInput } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [dropBusy, setDropBusy] = useState(false);

  function onDragEnd(e: DragEndEvent) {
    const row = rows.find((r) => r.bookingId === e.active.id);
    if (!row || !e.over) return;
    const input = moveFromDrop(row, { view, columnId: String(e.over.id), day, minutesFromMidnight: minOf(row.startsAt) + Math.round(e.delta.y / PX_PER_MIN) }, rooms);
    if (input.start === new Date(row.startsAt).toISOString() && input.therapistId === row.therapistId && input.positionId === row.positionId) return;
    setDropError(null);
    setPending({ row, input });
  }
  async function confirmDrop() {
    if (!pending) return;
    setDropBusy(true);
    const r = await moveBooking(pending.input);
    setDropBusy(false);
    setPending(null);
    if (!r.ok) { setDropError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }
  const posCode = (positionId: string) => rooms.find((x) => x.room_positions.some((p) => p.id === positionId))?.code ?? '';

  return (
    <div className={`flex min-w-0 flex-col gap-3 ${open ? 'lg:pr-[29rem]' : ''}`}>
      <WorkspaceHero title={nav('schedule')} description={design('calendarDesc')} icon="today" />
      <div className="workspace-surface workspace-toolbar">
        <Link href={q(addDays(day, -1))} className="underline" data-testid="day-prev">← {t('previousDay')}</Link>
        <span className="tnum font-semibold" data-testid="day-label">{day}</span>
        <Link href={q(addDays(day, 1))} className="underline" data-testid="day-next">{t('nextDay')} →</Link>
        <Link href={q(bangkokDay(new Date()))} className="underline">{t('today')}</Link>
        <Link href="/counter" className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm">{locale === 'th' ? 'จอเคาน์เตอร์ ↗' : 'Counter display ↗'}</Link><span className="ml-auto"><SpanSwitch span="day" day={day} view={view} /></span>
        <nav className="workspace-segmented" aria-label={t('viewTimeline')}>
          <Link href={q(day, 'therapists')} data-testid="view-therapists" aria-current={view === 'therapists' ? 'true' : undefined} className={view === 'therapists' ? 'font-semibold underline' : ''}>{t('viewTherapists')}</Link>
          <Link href={q(day, 'rooms')} data-testid="view-rooms" aria-current={view === 'rooms' ? 'true' : undefined} className={view === 'rooms' ? 'font-semibold underline' : ''}>{t('viewRooms')}</Link>
          <Link href={q(day, 'timeline')} data-testid="view-timeline">{t('viewTimeline')}</Link>
        </nav>
        {isDesk && <button className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="new-booking" onClick={() => setCreating(true)}>{t('new')}</button>}
      </div>

      {creating && isDesk && (
        <NewBookingForm therapists={therapists} rooms={rooms} services={services} view={view} onClose={() => setCreating(false)} />
      )}

      {open && <BookingDetails key={open.bookingId + open.version} row={open} role={role} moveOptions={{ therapists, rooms }}
        labels={{ service: svcName(open.serviceId), therapist: therapistName(open.therapistId), room: roomCodeOf(open.roomId) }} onClose={() => setSelected(null)} />}

      {dropError && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay"><ErrorText text={dropError} /></p>}
      {pending && (
        <div data-testid="drop-bar" className="tnum flex flex-wrap items-center gap-3 rounded border border-charcoal bg-white p-3 text-sm">
          <span>{pending.row.customerDisplayName}: {formatTime(pending.row.startsAt)} → <strong>{formatTime(pending.input.start)}</strong></span>
          <span>{therapistName(pending.row.therapistId)} → <strong>{therapistName(pending.input.therapistId)}</strong></span>
          <span>{posCode(pending.row.positionId)} → <strong>{posCode(pending.input.positionId)}</strong></span>
          <button disabled={dropBusy} onClick={confirmDrop} data-testid="drop-confirm" className="ml-auto rounded bg-charcoal px-3 py-1.5 text-ivory">{t('confirmMove')}</button>
          <button onClick={() => setPending(null)} data-testid="drop-undo" className="underline">{c('cancel')}</button>
        </div>
      )}

      {rows.length === 0 && <p className="text-stone-dark" data-testid="calendar-empty">{t('noBookings')}</p>}

      <div tabIndex={0} className="workspace-surface workspace-scroll" data-testid="calendar-scroll">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-stone bg-ivory" aria-hidden data-testid="time-axis">
            <div className="h-10 border-b border-stone" />
            <div className="relative" style={{ height }}>
              {hours.map((h) => <div key={h} className="tnum absolute left-0 w-full pr-1 text-right text-xs text-stone-dark" style={{ top: (h - startHour) * 60 * PX_PER_MIN }}>{String(h).padStart(2, '0')}:00</div>)}
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          {columns.map((col) => (
            <Column key={col.id} id={col.id} title={col.title} zone={col.zone} height={height}>
              {hours.map((h) => <div key={h} className="absolute w-full border-t border-stone/60" style={{ top: (h - startHour) * 60 * PX_PER_MIN }} />)}
              {rows.filter(col.match).map((r) => {
                const top = (minOf(r.startsAt) - startHour * 60) * PX_PER_MIN;
                const h = Math.max(28, (minOf(r.endsAt) - minOf(r.startsAt)) * PX_PER_MIN);
                const lane = col.lane(r);
                return (
                  <Card key={r.bookingId} row={r} draggable={isDraggable(r, role)} onClick={() => setSelected(r.bookingId)}
                    className={`${bookingStatusStyle(r.status).card} ${selected === r.bookingId ? 'ring-2 ring-charcoal' : ''}`}
                    style={{ top, height: h, left: `calc(${(lane / col.lanes) * 100}% + 2px)`, width: `calc(${100 / col.lanes}% - 4px)` }}>
                    {therapistOf(r.therapistId) && <Avatar name={therapistName(r.therapistId)} src={therapistOf(r.therapistId)?.photoUrl} size="sm" className="absolute right-1 top-1" />}
                    <span className="tnum font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</span>
                    <span className="block truncate">{svcName(r.serviceId)}</span>
                    <span className="block truncate">{r.customerDisplayName}</span>
                    <span className="block truncate">{therapistName(r.therapistId)} · {roomCodeOf(r.roomId)}</span>
                    <span className="block truncate font-medium">{t(`status.${r.status}`)}</span>
                  </Card>
                );
              })}
            </Column>
          ))}
          </DndContext>
          {columns.length === 0 && <p className="p-4 text-stone-dark">{c('empty')}</p>}
        </div>
      </div>
    </div>
  );
}

function Column({ id, title, zone, height, children }: { id: string; title: string; zone: string; height: number; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-testid="calendar-column" data-column-id={id} className="w-44 shrink-0 border-r border-stone">
      <div className="flex h-10 flex-col justify-center border-b border-stone px-2 text-sm font-medium">
        <span>{title}</span>{zone && <span className="text-xs font-normal text-stone-dark">{zone}</span>}
      </div>
      <div className="relative" style={{ height }}>{children}</div>
    </div>
  );
}

function Card({ row, draggable, className, style, onClick, children }: {
  row: BoardRow; draggable: boolean; className: string; style: React.CSSProperties; onClick: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.bookingId, disabled: !draggable });
  return (
    <button ref={setNodeRef} {...(draggable ? attributes : {})} {...(draggable ? listeners : {})}
      data-testid="booking-card" data-booking-id={row.bookingId} data-status={row.status} data-start={row.startsAt}
      onClick={onClick}
      className={`absolute overflow-hidden rounded px-1.5 py-1 text-left text-xs leading-tight ${className}`}
      style={{ ...style, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}), zIndex: isDragging ? 30 : undefined, touchAction: draggable ? 'none' : undefined }}>
      {children}
    </button>
  );
}
