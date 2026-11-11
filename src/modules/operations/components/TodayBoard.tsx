'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import { markRoomReady } from '../actions';
import type { RoomStatus, TodayModel } from '../today';
import { AttentionList, type Names, type OpenReport } from './AttentionList';
import { BookingActions } from './BookingActions';
import { ReportForm } from './ReportForm';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
const STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
const STATUS_KEY: Record<RoomStatus, string> = { available: 'available', reserved: 'reserved', occupied: 'occupied', cleaning: 'cleaning', out_of_service: 'outOfService' };
const STATUS_BG: Record<RoomStatus, string> = {
  available: 'bg-sage', reserved: 'bg-brass', occupied: 'bg-charcoal', cleaning: 'bg-clay', out_of_service: 'bg-stone-dark',
};

// "Shared screen" is remembered per device; storage can be unavailable, and until it is read the names stay hidden.
const SHARED_KEY = 'spa.sharedScreen';
const listeners = new Set<() => void>();
function readShared(): boolean {
  try { return localStorage.getItem(SHARED_KEY) === '1'; } catch { return false; }
}
function writeShared(v: boolean) {
  try { localStorage.setItem(SHARED_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
function useShared(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    readShared,
    () => true,
  );
  return [v, writeShared];
}

export function TodayBoard({ model, role, names, reports }: { model: TodayModel; role: Role; names: Names; reports: OpenReport[] }) {
  const t = useTranslations('today');
  const s = useTranslations('status');
  const te = useTranslations();
  const router = useRouter();
  const [shared, setShared] = useShared();
  const [error, setError] = useState<string | null>(null);
  const [reportRoom, setReportRoom] = useState<string | null>(null);
  const all = [...model.arrivals, ...model.waiting, ...model.inTreatment];

  const who = (r: BoardRow) => (shared ? names.services[r.serviceId] : r.customerDisplayName);
  const line = (r: BoardRow) => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="tnum font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</span>
      <span>{who(r)}</span>
      <span className="text-stone-dark">{names.therapists[r.therapistId]} · {names.rooms[r.roomId]}</span>
    </span>
  );

  async function ready(roomId: string) {
    setError(null);
    const r = await markRoomReady(roomId);
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    router.refresh();
  }

  const section = (title: string, children: React.ReactNode) => (
    <section className="flex flex-col gap-2"><h2 className="text-lg">{title}</h2>{children}</section>
  );
  const empty = <p className="text-sm text-stone-dark">{t('nothing')}</p>;
  const rowBox = 'flex flex-wrap items-center gap-3 rounded border border-stone bg-white p-3';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl">{t('title')}</h1>
        <span className="tnum text-stone-dark">{model.day}</span>
        <button data-testid="shared-toggle" aria-pressed={shared} onClick={() => setShared(!shared)}
          className="ml-auto rounded border border-charcoal px-3 py-1.5 text-sm">{shared ? t('sharedOn') : t('sharedOff')}</button>
      </div>

      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}

      <section aria-label={t('roomStatus')} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label={t('reservations')} value={model.counts.reservations} id="reservations" />
        <Stat label={t('cancelled')} value={model.counts.cancelled} id="cancelled" />
        <Stat label={t('noShow')} value={model.counts.noShow} id="noshow" />
        {STATUSES.map((k) => <Stat key={k} label={s(STATUS_KEY[k])} value={model.counts[k]} id={k} dot={STATUS_BG[k]} />)}
      </section>

      {section(t('attention'), (
        <AttentionList items={model.attention} rows={all} names={names} reports={reports} shared={shared} />
      ))}

      {section(t('arrivals'), model.arrivals.length === 0 ? empty : (
        <ul className="flex flex-col gap-2">{model.arrivals.map((r) => (
          <li key={r.bookingId} data-testid="arrival-row" className={rowBox}>{line(r)}<span className="ml-auto"><BookingActions row={r} role={role} onError={setError} /></span></li>
        ))}</ul>
      ))}

      {section(t('waiting'), model.waiting.length === 0 ? empty : (
        <ul className="flex flex-col gap-2">{model.waiting.map((r) => (
          <li key={r.bookingId} data-testid="waiting-row" className={rowBox}>{line(r)}<span className="ml-auto"><BookingActions row={r} role={role} onError={setError} /></span></li>
        ))}</ul>
      ))}

      {section(t('inTreatment'), model.inTreatment.length === 0 ? empty : (
        <ul className="flex flex-col gap-2">{model.inTreatment.map((r) => {
          const soon = model.endingSoon.some((x) => x.bookingId === r.bookingId);
          return (
            <li key={r.bookingId} data-testid="treatment-row" className={rowBox}>
              {line(r)}
              <span className="tnum text-sm">{t('expectedEnd')} {r.expectedEnd ? formatTime(r.expectedEnd) : '—'}</span>
              {soon && <span data-testid="ending-soon" className="rounded bg-brass px-2 py-0.5 text-xs text-white">{t('endingSoon')}</span>}
              <span className="ml-auto"><BookingActions row={r} role={role} onError={setError} /></span>
            </li>
          );
        })}</ul>
      ))}

      {section(t('awaitingCleaning'), model.awaitingCleaning.length === 0 ? empty : (
        <ul className="flex flex-col gap-2">{model.awaitingCleaning.map((r) => (
          <li key={r.roomId} data-testid="cleaning-row" className={rowBox}>
            <span className="font-semibold">{names.rooms[r.roomId]}</span>
            <span className="tnum text-sm text-stone-dark">{t('due')} {r.turnoverDueAt ? formatTime(r.turnoverDueAt) : '—'}</span>
            <span className="ml-auto flex gap-2 text-sm">
              <button data-testid="act-ready" onClick={() => ready(r.roomId)} className="rounded border border-charcoal px-3 py-1.5">{t('ready')}</button>
              <button onClick={() => setReportRoom(r.roomId)} className="underline">{t('report')}</button>
            </span>
          </li>
        ))}</ul>
      ))}

      {reportRoom && <ReportForm roomId={reportRoom} room={names.rooms[reportRoom]} onDone={() => setReportRoom(null)} onError={setError} />}

      {section(t('therapistsOnShift'), model.therapists.length === 0 ? empty : (
        <ul className="flex flex-wrap gap-2">{model.therapists.map((x) => (
          <li key={x.therapistId} data-testid="therapist-state" data-state={x.state} className="rounded border border-stone bg-white px-3 py-1.5 text-sm">
            {names.therapists[x.therapistId]} · {t(`therapistState.${x.state}`)}
          </li>
        ))}</ul>
      ))}

      {section(t('cancellations'), model.cancellations.length === 0 ? empty : (
        <ul className="flex flex-col gap-2">{model.cancellations.map((r) => (
          <li key={r.bookingId} data-testid="cancellation-row" className={`${rowBox} opacity-70`}>{line(r)}</li>
        ))}</ul>
      ))}
    </div>
  );
}

function Stat({ label, value, id, dot }: { label: string; value: number; id: string; dot?: string }) {
  return (
    <div className="rounded border border-stone bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-stone-dark">{dot && <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />}{label}</div>
      <div className="tnum text-2xl" data-testid={`count-${id}`}>{value}</div>
    </div>
  );
}
