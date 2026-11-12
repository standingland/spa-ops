'use client';

import { useState, useSyncExternalStore } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusDot } from '@/components/ui/badge';
import { ROOM_STATUS_KEY } from '@/components/ui/status';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import type { BoardRow } from '@/modules/booking/actions';
import { BookingDetails } from '@/modules/booking/components/BookingDetails';
import { markRoomReady, resolveRoomReport } from '../actions';
import type { RoomStatus, TodayModel } from '../today';
import { AttentionList, type Names, type OpenReport } from './AttentionList';
import { BookingActions } from './BookingActions';
import { ReassignDialog } from './ReassignDialog';
import { ReportForm } from './ReportForm';
import { RoomStatusPanel } from './RoomStatusPanel';
import { TreatmentNote } from '@/modules/customers/components/TreatmentNote';
import { PendingPayments } from '@/modules/payments/components/PendingPayments';
import type { PaymentMethod, PendingPayment } from '@/modules/payments/schema';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
const LIVE_TABLES = ['bookings', 'room_turnovers', 'room_blocks', 'room_reports', 'therapist_time_off', 'payments'] as const;
const STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];

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

export function TodayBoard({ model, role, names, reports, roomZones = {}, pending = [], methods = [], canRecord = false }: {
  model: TodayModel; role: Role; names: Names; reports: OpenReport[]; roomZones?: Record<string, string | null>;
  pending?: PendingPayment[]; methods?: PaymentMethod[]; canRecord?: boolean;
}) {
  const t = useTranslations('today');
  const s = useTranslations('status');
  const b = useTranslations('booking');
  const te = useTranslations();
  const router = useRouter();
  const [shared, setShared] = useShared();
  useLiveRefresh(LIVE_TABLES);
  const [error, setError] = useState<string | null>(null);
  const [reportRoom, setReportRoom] = useState<string | null>(null);
  const [reassign, setReassign] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const all = [...model.arrivals, ...model.waiting, ...model.inTreatment];

  const who = (r: BoardRow) => (shared ? names.services[r.serviceId] : r.customerDisplayName);
  const line = (r: BoardRow) => (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="tnum font-semibold">{formatTime(r.startsAt)}–{formatTime(r.endsAt)}</span>
      <span className="min-w-0 break-words">{who(r)}</span>
      <span className="min-w-0 break-words text-ink-muted">{names.therapists[r.therapistId]} · {names.rooms[r.roomId]}</span>
      {!shared && <TreatmentNote bookingId={r.bookingId} />}
    </span>
  );

  async function ready(roomId: string) {
    setError(null);
    const r = await markRoomReady(roomId);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  const section = (title: string, children: React.ReactNode) => (
    <Card className="flex min-w-0 flex-col gap-2"><h2 className="font-serif text-heading text-ink">{title}</h2>{children}</Card>
  );
  const empty = <EmptyState>{t('nothing')}</EmptyState>;
  const rowBox = 'flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-surface p-3';
  const actions = (r: BoardRow) => (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" data-testid="open-details" onClick={() => setDetailsId(r.bookingId)}>{b('openDetails')}</Button>
      <BookingActions row={r} role={role} onError={setError} />
    </span>
  );
  const detailsRow = detailsId ? all.find((r) => r.bookingId === detailsId) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('title')} subtitle={model.day}
        actions={<Button variant="secondary" size="sm" data-testid="shared-toggle" aria-pressed={shared} onClick={() => setShared(!shared)}>{shared ? t('sharedOn') : t('sharedOff')}</Button>} />

      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}

      <section aria-label={t('roomStatus')} className="flex flex-wrap gap-x-5 gap-y-2 rounded-[var(--radius)] border border-line bg-surface px-4 py-2">
        <Stat label={t('reservations')} value={model.counts.reservations} id="reservations" />
        <Stat label={t('cancelled')} value={model.counts.cancelled} id="cancelled" />
        <Stat label={t('noShow')} value={model.counts.noShow} id="noshow" />
        {STATUSES.map((k) => <Stat key={k} label={s(ROOM_STATUS_KEY[k])} value={model.counts[k]} id={k} dot={k} />)}
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <RoomStatusPanel model={model} names={names} roomZones={roomZones} shared={shared} role={role} onError={setError} />
        <div className="flex min-w-0 flex-col gap-6">
          {section(t('upcomingArrivals'), model.arrivals.length === 0 ? empty : (
            <ul className="flex flex-col gap-2">{model.arrivals.map((r) => (
              <li key={r.bookingId} data-testid="arrival-row" className={rowBox}>{line(r)}{actions(r)}</li>
            ))}</ul>
          ))}
          {section(t('attention'), (
            <>
              <AttentionList items={model.attention} rows={[...all, ...model.attentionRows]} names={names} reports={reports} shared={shared}
                onOpen={role === 'therapist' ? undefined : (a) => a.bookingId && setReassign(a.bookingId)}
                onResolve={role === 'therapist' ? undefined : async (id) => {
                  setError(null);
                  const r = await resolveRoomReport(id);
                  if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
                  router.refresh();
                }} />
              {reassign && <ReassignDialog bookingId={reassign} names={names} onClose={() => setReassign(null)} />}
            </>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        {section(t('waiting'), model.waiting.length === 0 ? empty : (
          <ul className="flex flex-col gap-2">{model.waiting.map((r) => (
            <li key={r.bookingId} data-testid="waiting-row" className={rowBox}>{line(r)}{actions(r)}</li>
          ))}</ul>
        ))}

        {section(t('inTreatment'), model.inTreatment.length === 0 ? empty : (
          <ul className="flex flex-col gap-2">{model.inTreatment.map((r) => {
            const soon = model.endingSoon.some((x) => x.bookingId === r.bookingId);
            return (
              <li key={r.bookingId} data-testid="treatment-row" className={rowBox}>
                {line(r)}
                <span className="tnum text-caption">{t('expectedEnd')} {r.expectedEnd ? formatTime(r.expectedEnd) : '—'}</span>
                {soon && <span data-testid="ending-soon" className="rounded-full bg-tint-reserved px-2 py-0.5 text-caption text-ink">{t('endingSoon')}</span>}
                {actions(r)}
              </li>
            );
          })}</ul>
        ))}

        {section(t('awaitingCleaning'), model.awaitingCleaning.length === 0 ? empty : (
          <ul className="flex flex-col gap-2">{model.awaitingCleaning.map((r) => (
            <li key={r.roomId} data-testid="cleaning-row" className={rowBox}>
              <span className="min-w-0 break-words font-semibold">{names.rooms[r.roomId]}</span>
              <span className="tnum text-caption text-ink-muted">{t('due')} {r.turnoverDueAt ? formatTime(r.turnoverDueAt) : '—'}</span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" data-testid="act-ready" onClick={() => ready(r.roomId)}>{t('ready')}</Button>
                <Button size="sm" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setReportRoom(r.roomId)}>{t('report')}</Button>
              </span>
            </li>
          ))}</ul>
        ))}

        {role !== 'therapist' && section(t('pendingPayments'), <PendingPayments rows={pending} methods={methods} canRecord={canRecord} shared={shared} />)}

        {section(t('therapistsOnShift'), model.therapists.length === 0 ? empty : (
          <ul className="flex flex-wrap gap-2">{model.therapists.map((x) => (
            <li key={x.therapistId} data-testid="therapist-state" data-state={x.state} className="min-w-0 break-words rounded-[var(--radius)] border border-line bg-surface px-3 py-1.5 text-caption">
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

      {detailsRow && (
        <BookingDetails key={detailsRow.bookingId + detailsRow.version} row={detailsRow} role={role} onClose={() => setDetailsId(null)}
          labels={{ service: names.services[detailsRow.serviceId], therapist: names.therapists[detailsRow.therapistId], room: names.rooms[detailsRow.roomId] }} />
      )}

      {reportRoom && <ReportForm roomId={reportRoom} room={names.rooms[reportRoom]} onDone={() => setReportRoom(null)} onError={setError} />}
    </div>
  );
}

function Stat({ label, value, id, dot }: { label: string; value: number; id: string; dot?: RoomStatus }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex items-center gap-1.5 text-caption text-ink-muted">{dot && <StatusDot status={dot} />}{label}</span>
      <span className="tnum text-heading text-ink" data-testid={`count-${id}`}>{value}</span>
    </div>
  );
}
