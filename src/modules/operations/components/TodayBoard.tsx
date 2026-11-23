'use client';

import { useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { Icon } from '@/components/shell/Icon';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { StatusChip, StatusDot } from '@/components/ui/badge';
import { ROOM_STATUS_KEY } from '@/components/ui/status';
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
import { DailyNotesStrip } from '@/modules/daily-notes/components/DailyNotesStrip';
import type { DailyNote } from '@/modules/daily-notes/schema';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
type Filter = 'all' | 'scheduled' | 'inTreatment' | 'completed' | 'cancellations';
const LIVE_TABLES = ['bookings', 'room_turnovers', 'room_blocks', 'room_reports', 'therapist_time_off', 'payments'] as const;
const STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];

const SHARED_KEY = 'spa.sharedScreen';
const listeners = new Set<() => void>();
function readShared(): boolean {
  try { return localStorage.getItem(SHARED_KEY) === '1'; } catch { return false; }
}
function writeShared(v: boolean) {
  try { localStorage.setItem(SHARED_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
function subscribeShared(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

const categoryOf = (status: BoardRow['status']): Exclude<Filter, 'all'> => {
  if (status === 'in_treatment') return 'inTreatment';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'no_show') return 'cancellations';
  return 'scheduled';
};

export function TodayBoard({ model, role, names, reports, roomZones = {}, pending = [], methods = [], canRecord = false, dailyNotes = [] }: {
  model: TodayModel; role: Role; names: Names; reports: OpenReport[]; roomZones?: Record<string, string | null>;
  pending?: PendingPayment[]; methods?: PaymentMethod[]; canRecord?: boolean; dailyNotes?: DailyNote[];
}) {
  const t = useTranslations('today');
  const s = useTranslations('status');
  const b = useTranslations('booking');
  const design = useTranslations('workspaceDesign');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const shared = useSyncExternalStore(subscribeShared, readShared, () => true);
  useLiveRefresh(LIVE_TABLES);
  const [error, setError] = useState<string | null>(null);
  const [reportRoom, setReportRoom] = useState<string | null>(null);
  const [reassign, setReassign] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const active = [...model.arrivals, ...model.waiting, ...model.inTreatment];
  const arrivals = new Set(model.arrivals.map((row) => row.bookingId));
  const byId = new Map([...model.bookings, ...active].map((row) => [row.bookingId, row]));
  const bookings = [...byId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const detailsRow = detailsId && !shared ? byId.get(detailsId) : undefined;

  const term = search.trim().toLocaleLowerCase(locale);
  const counts: Record<Filter, number> = { all: bookings.length, scheduled: 0, inTreatment: 0, completed: 0, cancellations: 0 };
  for (const row of bookings) counts[categoryOf(row.status)]++;
  const visible = bookings.filter((row) => {
    if (filter !== 'all' && categoryOf(row.status) !== filter) return false;
    return !term || [names.services[row.serviceId], names.therapists[row.therapistId], names.rooms[row.roomId], shared ? '' : row.customerDisplayName]
      .some((value) => value?.toLocaleLowerCase(locale).includes(term));
  });
  const filters = [
    ['all', design('allBookings')], ['scheduled', design('scheduled')], ['inTreatment', t('inTreatment')],
    ['completed', design('completed')], ['cancellations', t('cancellations')],
  ] as const;

  async function ready(roomId: string) {
    setError(null);
    const r = await markRoomReady(roomId);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  const section = (title: string, children: React.ReactNode) => (
    <Card className="today-section flex min-w-0 flex-col gap-3"><h2>{title}</h2>{children}</Card>
  );
  const empty = <EmptyState>{t('nothing')}</EmptyState>;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date(`${model.day}T12:00:00+07:00`));
  const tasks = [
    { label: t('upcomingArrivals'), count: model.arrivals.length, href: '#today-bookings-title', focus: 'scheduled' },
    { label: t('waiting'), count: model.waiting.length, href: '#today-bookings-title', focus: 'scheduled' },
    { label: t('awaitingCleaning'), count: model.awaitingCleaning.length, href: '#today-room-turnovers' },
  ] as const;

  return (
    <div className="today-board" data-details-open={!!detailsRow}>
      <WorkspaceHero title={t('title')} description={design('todayDesc')} icon="today" detail={<time dateTime={model.day}>{date}</time>}
        actions={<Button variant="secondary" size="sm" data-testid="shared-toggle" aria-pressed={shared} onClick={() => {
          if (!shared) { setDetailsId(null); setSearch(''); }
          writeShared(!shared);
        }}>{shared ? t('sharedOn') : t('sharedOff')}</Button>} />

      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}

      <div className="today-main-grid">
        <section aria-label={t('roomStatus')} className="today-metrics">
          <Stat label={t('reservations')} value={model.counts.reservations} id="reservations" icon="today" />
          <Stat label={t('therapistsOnShift')} value={model.therapists.length} id="therapists" icon="guests" />
          <Stat label={s(ROOM_STATUS_KEY.available)} value={model.counts.available} id="available" icon="rooms" />
          <Stat label={t('attention')} value={model.attention.length} id="attention" icon="checklist" />
        </section>

        <section className="workspace-surface today-bookings" aria-labelledby="today-bookings-title">
          <header>
            <h2 id="today-bookings-title" className="workspace-section-title">{t('reservations')} <small>({bookings.length})</small></h2>
            <label className="today-search"><Icon name="search" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              aria-label={design('searchBookings')} placeholder={design('searchBookings')} /></label>
          </header>
          <div className="workspace-segmented today-filters">
            {filters.map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{counts[id]}</span></button>)}
          </div>
          <div className="workspace-scroll" role="region" tabIndex={0} aria-labelledby="today-bookings-title">
            <table className="workspace-table today-table">
              <thead><tr>
                <th scope="col">{b('start')}</th>{!shared && <th scope="col">{b('customer')}</th>}
                <th scope="col">{b('service')}</th><th scope="col">{b('therapist')}</th>
                <th scope="col">{te('nav.rooms')}</th><th scope="col">{design('status')}</th>
                <th scope="col"><span className="sr-only">{b('openDetails')}</span></th>
              </tr></thead>
              <tbody>{visible.map((row) => {
                const rowTestId = row.status === 'checked_in' ? 'waiting-row' : row.status === 'in_treatment' ? 'treatment-row'
                  : categoryOf(row.status) === 'cancellations' ? 'cancellation-row' : arrivals.has(row.bookingId) ? 'arrival-row' : 'today-booking-row';
                return (
                  <tr key={row.bookingId} data-testid={rowTestId}>
                    <td className="tnum font-semibold" data-label={b('start')}>{formatTime(row.startsAt)}<small>{formatTime(row.endsAt)}</small></td>
                    {!shared && <td className="today-guest" data-label={b('customer')}><strong>{row.customerDisplayName}</strong><TreatmentNote bookingId={row.bookingId} /></td>}
                    <td data-label={b('service')}>{names.services[row.serviceId] || '—'}</td>
                    <td data-label={b('therapist')}>{names.therapists[row.therapistId] || '—'}</td>
                    <td data-label={te('nav.rooms')}>{names.rooms[row.roomId] || '—'}</td>
                    <td data-label={design('status')}>
                      <StatusChip kind="booking" status={row.status} label={b(`status.${row.status}`)} />
                      {row.status === 'in_treatment' && row.expectedEnd && <small>{t('expectedEnd')} {formatTime(row.expectedEnd)}</small>}
                      {model.endingSoon.some((item) => item.bookingId === row.bookingId) && <small data-testid="ending-soon">{t('endingSoon')}</small>}
                    </td>
                    <td className="workspace-entry-actions"><div className="today-row-actions">
                      {!shared && <Button size="sm" variant="secondary" data-testid="open-details" onClick={() => setDetailsId(row.bookingId)}>{b('openDetails')}</Button>}
                      <BookingActions row={row} role={role} onError={setError} />
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {!visible.length && <p className="overview-empty">{bookings.length ? design('noMatches') : t('nothing')}</p>}
        </section>

        <aside className="today-side">
          {section(t('attention'), (
            <>
              <AttentionList items={model.attention} rows={[...active, ...model.attentionRows]} names={names} reports={reports} shared={shared}
                onOpen={role === 'therapist' ? undefined : (item) => item.bookingId && setReassign(item.bookingId)}
                onResolve={role === 'therapist' ? undefined : async (id) => {
                  setError(null);
                  const result = await resolveRoomReport(id);
                  if (!result.ok) { setError(errorText(te(uiErrorKey(result.code)), result)); return; }
                  router.refresh();
                }} />
              {reassign && <ReassignDialog bookingId={reassign} names={names} onClose={() => setReassign(null)} />}
            </>
          ))}
          <DailyNotesStrip notes={dailyNotes} />
          <section className="workspace-surface today-checklist" aria-labelledby="today-work">
            <h2 className="workspace-section-title" id="today-work">{te('nav.group.operate')}</h2>
            <ul>{tasks.map((task) => (
              <li key={task.label}>
                <a href={task.href} onClick={'focus' in task ? () => { setFilter(task.focus); setSearch(''); } : undefined}>
                  <Icon name={task.count ? 'schedule' : 'checklist'} />
                  <span>{task.label}</span><strong className="tnum">{task.count}</strong>
                </a>
              </li>
            ))}</ul>
          </section>
          {section(t('therapistsOnShift'), model.therapists.length === 0 ? empty : (
            <ul className="today-team">{model.therapists.map((person) => (
              <li key={person.therapistId} data-testid="therapist-state" data-state={person.state}>
                <Icon name="therapists" /><span>{names.therapists[person.therapistId]}<small>{t(`therapistState.${person.state}`)}</small></span>
              </li>
            ))}</ul>
          ))}
        </aside>
      </div>

      <div className="today-lower">
        <RoomStatusPanel model={model} names={names} roomZones={roomZones} shared={shared} role={role} onError={setError} />
        <div className="today-side" id="today-room-turnovers">
          {section(t('awaitingCleaning'), model.awaitingCleaning.length === 0 ? empty : (
            <ul className="grid gap-2">{model.awaitingCleaning.map((room) => (
              <li key={room.roomId} data-testid="cleaning-row" className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                <strong>{names.rooms[room.roomId]}</strong>
                <span className="tnum text-caption text-ink-muted">{t('due')} {room.turnoverDueAt ? formatTime(room.turnoverDueAt) : '—'}</span>
                <Button size="sm" variant="secondary" data-testid="act-ready" onClick={() => ready(room.roomId)}>{t('ready')}</Button>
                <Button size="sm" variant="link" onClick={() => setReportRoom(room.roomId)}>{t('report')}</Button>
              </li>
            ))}</ul>
          ))}
          {role !== 'therapist' && section(t('pendingPayments'), <PendingPayments rows={pending} methods={methods} canRecord={canRecord} shared={shared} />)}
        </div>
      </div>

      <section aria-label={t('roomStatus')} className="today-secondary-counts">
        {STATUSES.filter((key) => key !== 'available').map((key) => (
          <span key={key}><StatusDot status={key} />{s(ROOM_STATUS_KEY[key])} <strong data-testid={`count-${key}`}>{model.counts[key]}</strong></span>
        ))}
        <span>{t('cancelled')} <strong data-testid="count-cancelled">{model.counts.cancelled}</strong></span>
        <span>{t('noShow')} <strong data-testid="count-noshow">{model.counts.noShow}</strong></span>
      </section>

      {detailsRow && (
        <BookingDetails key={detailsRow.bookingId + detailsRow.version} row={detailsRow} role={role} onClose={() => setDetailsId(null)}
          labels={{ service: names.services[detailsRow.serviceId], therapist: names.therapists[detailsRow.therapistId], room: names.rooms[detailsRow.roomId] }} />
      )}
      {reportRoom && <ReportForm roomId={reportRoom} room={names.rooms[reportRoom]} onDone={() => setReportRoom(null)} onError={setError} />}
    </div>
  );
}

function Stat({ label, value, id, icon }: { label: string; value: number; id: string; icon: 'today' | 'guests' | 'rooms' | 'checklist' }) {
  return (
    <div className="workspace-surface today-metric">
      <span><Icon name={icon} /></span>
      <div><h2>{label}</h2><strong className="tnum" data-testid={`count-${id}`}>{value}</strong></div>
    </div>
  );
}
