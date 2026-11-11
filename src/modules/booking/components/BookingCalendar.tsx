'use client';

import { useMemo, useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { useLiveRefresh } from '@/lib/realtime';
import { addDays, bangkokDay, formatTime } from '@/lib/time';
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { moveBooking, setBookingStatus, type BoardRow } from '../actions';
import { isDraggable, moveFromDrop } from '../drop';
import type { MoveBookingInput } from '../schema';
import type { BookingStatus } from '../schema';
import { NewBookingForm } from './NewBookingForm';
import { SpanSwitch } from './SpanSwitch';
import { TreatmentNote } from '@/modules/customers/components/TreatmentNote';
import { PaymentSection } from '@/modules/payments/components/PaymentSection';
import type { Role, RoomOpt, ServiceOpt, TherapistOpt } from './types';

const PX_PER_MIN = 1;
const LIVE_TABLES = ['bookings', 'room_blocks', 'therapist_shifts', 'therapist_time_off', 'payments'] as const;
const field = 'rounded border border-stone-dark px-2 py-1 text-sm';
const toIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : '');
const localOf = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;

/** Status → background class. Every card also prints its status as text. */
const STATUS_BG: Record<BookingStatus, string> = {
  requested: 'bg-stone text-charcoal', confirmed: 'bg-brass text-white', checked_in: 'bg-sage text-white', in_treatment: 'bg-charcoal text-ivory',
  completed: 'bg-stone-dark text-white', cancelled: 'bg-stone text-stone-dark line-through opacity-60', no_show: 'bg-clay text-white opacity-80',
};

const DESK_NEXT: Partial<Record<BookingStatus, BookingStatus[]>> = {
  requested: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled', 'no_show'], checked_in: ['in_treatment', 'cancelled'], in_treatment: ['completed'],
};
const THERAPIST_NEXT: Partial<Record<BookingStatus, BookingStatus[]>> = { checked_in: ['in_treatment'], in_treatment: ['completed'] };

export function BookingCalendar({ day, view, role, rows, therapists, rooms, services, retiredRooms = [] }: {
  /** Deactivated rooms: not offered or shown as columns, but their code still appears on past bookings. */
  retiredRooms?: { id: string; code: string }[];
  day: string; view: 'therapists' | 'rooms'; role: Role; rows: BoardRow[];
  therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[];
}) {
  const t = useTranslations('booking');
  const c = useTranslations('common');
  const locale = useLocale();
  useLiveRefresh(LIVE_TABLES);
  const [creating, setCreating] = useState(false);
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
  const q = (d: string, v = view) => `/calendar?day=${d}&view=${v}`;

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl">{t('title')}</h1>
        <Link href={q(addDays(day, -1))} className="underline" data-testid="day-prev">← {t('previousDay')}</Link>
        <span className="tnum font-semibold" data-testid="day-label">{day}</span>
        <Link href={q(addDays(day, 1))} className="underline" data-testid="day-next">{t('nextDay')} →</Link>
        <Link href={q(bangkokDay(new Date()))} className="underline">{t('today')}</Link>
        <span className="ml-auto"><SpanSwitch span="day" day={day} view={view} /></span>
        <nav className="flex gap-2 text-sm" aria-label="view">
          <Link href={q(day, 'therapists')} data-testid="view-therapists" aria-current={view === 'therapists' ? 'true' : undefined} className={view === 'therapists' ? 'font-semibold underline' : ''}>{t('viewTherapists')}</Link>
          <Link href={q(day, 'rooms')} data-testid="view-rooms" aria-current={view === 'rooms' ? 'true' : undefined} className={view === 'rooms' ? 'font-semibold underline' : ''}>{t('viewRooms')}</Link>
        </nav>
        {isDesk && <button className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="new-booking" onClick={() => setCreating(true)}>{t('new')}</button>}
      </div>

      {creating && isDesk && (
        <NewBookingForm therapists={therapists} rooms={rooms} services={services} view={view} onClose={() => setCreating(false)} />
      )}

      {open && <BookingPanel key={open.bookingId + open.version} row={open} role={role} therapists={therapists} rooms={rooms}
        svcName={svcName(open.serviceId)} therapistName={therapistName(open.therapistId)} roomCode={roomCodeOf(open.roomId)} onClose={() => setSelected(null)} />}

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

      <div className="overflow-x-auto rounded border border-stone bg-white" data-testid="calendar-scroll">
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
                    className={`${STATUS_BG[r.status]} ${selected === r.bookingId ? 'ring-2 ring-charcoal' : ''}`}
                    style={{ top, height: h, left: `calc(${(lane / col.lanes) * 100}% + 2px)`, width: `calc(${100 / col.lanes}% - 4px)` }}>
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

function BookingPanel({ row, role, therapists, rooms, svcName, therapistName, roomCode, onClose }: {
  row: BoardRow; role: Role; therapists: TherapistOpt[]; rooms: RoomOpt[]; svcName: string; therapistName: string; roomCode: string; onClose: () => void;
}) {
  const t = useTranslations('booking');
  const te = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [start, setStart] = useState(localOf(row.startsAt));
  const [therapistId, setTherapistId] = useState(row.therapistId);
  const [positionId, setPositionId] = useState(row.positionId);
  const next = (role === 'therapist' ? THERAPIST_NEXT : DESK_NEXT)[row.status] ?? [];
  const movable = role !== 'therapist' && ['requested', 'confirmed', 'checked_in'].includes(row.status);
  const positions = rooms.flatMap((r) => r.room_positions.filter((p) => p.active || p.id === row.positionId).map((p) => ({ id: p.id, label: `${r.code} · ${p.label}` })));

  async function act(p: Promise<{ ok: true } | { ok: false; code: string }>) {
    setBusy(true); setError(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return false; }
    startTransition(() => router.refresh());
    onClose();
    return true;
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-stone bg-white p-4" aria-label={svcName} data-testid="booking-panel">
      <div className="flex items-center gap-3">
        <h2 className="text-lg">{row.customerDisplayName}</h2>
        <span className="rounded bg-ivory px-2 py-0.5 text-xs">{t(`status.${row.status}`)}</span>
        <button className="ml-auto text-sm underline" onClick={onClose} data-testid="panel-close">{t('close')}</button>
      </div>
      <p className="tnum text-sm">{svcName} · {formatTime(row.startsAt)}–{formatTime(row.endsAt)} · {therapistName} · {roomCode}</p>
      <TreatmentNote bookingId={row.bookingId} />
      {role !== 'therapist' && <PaymentSection bookingId={row.bookingId} version={row.version} />}
      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
      <div className="flex flex-wrap gap-2 text-sm">
        {next.filter((s) => s !== 'cancelled').map((s) => (
          <button key={s} disabled={busy} data-testid={`status-${s}`} className="rounded border border-charcoal px-3 py-1"
            onClick={() => act(setBookingStatus({ bookingId: row.bookingId, to: s, expectedVersion: row.version }))}>{t(`actions.${s}`)}</button>
        ))}
        {movable && <button className="rounded border border-charcoal px-3 py-1" data-testid="booking-move" onClick={() => setMoving(true)}>{t('actions.move')}</button>}
        {next.includes('cancelled') && !cancelling && <button className="rounded border border-clay px-3 py-1 text-clay" data-testid="booking-cancel" onClick={() => setCancelling(true)}>{t('actions.cancelled')}</button>}
        {cancelling && (
          <>
            <button disabled={busy} className="rounded bg-clay px-3 py-1 text-white" data-testid="cancel-confirm"
              onClick={() => act(setBookingStatus({ bookingId: row.bookingId, to: 'cancelled', expectedVersion: row.version }))}>{t('actions.confirmCancel')}</button>
            <button className="underline" onClick={() => setCancelling(false)}>{te('common.cancel')}</button>
          </>
        )}
      </div>
      {moving && (
        <form className="grid gap-3 border-t border-stone pt-3 sm:grid-cols-4" aria-label={t('moveTitle')}
          onSubmit={(e) => { e.preventDefault(); void act(moveBooking({ bookingId: row.bookingId, start: toIso(start), therapistId, positionId, expectedVersion: row.version })); }}>
          <label className="flex flex-col text-sm">{t('start')}<input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={field} data-testid="move-start" /></label>
          <label className="flex flex-col text-sm">{t('therapist')}
            <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} className={field} data-testid="move-therapist">
              {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-sm">{t('position')}
            <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className={field} data-testid="move-position">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="submit" disabled={busy} className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="move-confirm">{t('confirmMove')}</button></div>
        </form>
      )}
    </section>
  );
}
