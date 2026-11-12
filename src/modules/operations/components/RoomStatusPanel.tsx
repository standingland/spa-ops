'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusChip } from '@/components/ui/badge';
import { ROOM_STATUS_KEY } from '@/components/ui/status';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { setBookingStatus } from '@/modules/booking/actions';
import type { BookingStatus } from '@/modules/booking/schema';
import { markRoomReady } from '../actions';
import { roomAction } from '../roomAction';
import type { RoomState, TodayModel } from '../today';
import type { Names } from './AttentionList';
import { DESK_NEXT, THERAPIST_NEXT } from './BookingActions';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';

/** One row per room, grouped by zone, with the single next action the signed-in role may take. */
export function RoomStatusPanel({ model, names, roomZones, shared, role, onError }: {
  model: TodayModel; names: Names; roomZones: Record<string, string | null>; shared: boolean; role: Role;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('today');
  const s = useTranslations('status');
  const tb = useTranslations('booking');
  const tr = useTranslations('roomBoard');
  const te = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = (role === 'therapist' ? THERAPIST_NEXT : DESK_NEXT);
  const may = (from: BookingStatus, to: BookingStatus) => (allowed[from] ?? []).includes(to);

  const code = (r: RoomState) => names.rooms[r.roomId] ?? '';
  const groups = new Map<string, RoomState[]>();
  for (const r of [...model.rooms].sort((a, b) => code(a).localeCompare(code(b), undefined, { numeric: true }))) {
    const z = roomZones[r.roomId] ?? '';
    groups.set(z, [...(groups.get(z) ?? []), r]);
  }
  const zones = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));

  // Never the customer name on a shared screen: the service, found from the booking in treatment.
  const what = (r: RoomState): string => {
    if (!r.currentBookingId) return '';
    if (!shared) return r.currentCustomerDisplayName ?? '';
    const row = model.inTreatment.find((x) => x.bookingId === r.currentBookingId);
    return row ? (names.services[row.serviceId] ?? '') : '';
  };

  async function run(key: string, fn: () => ReturnType<typeof markRoomReady>) {
    setBusy(key); onError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) { onError(errorText(te(uiErrorKey(res.code)), res)); return; }
    router.refresh();
  }

  function action(r: RoomState) {
    const a = roomAction(r, model);
    if (!a) return null;
    if (a.kind === 'ready') {
      return <Button size="sm" variant="secondary" disabled={busy === r.roomId} data-testid="room-act-ready" onClick={() => run(r.roomId, () => markRoomReady(r.roomId))}>{t('ready')}</Button>;
    }
    const to: BookingStatus = a.kind === 'start' ? 'in_treatment' : 'completed';
    if (!may(a.row.status, to)) return null;
    return (
      <Button size="sm" variant="secondary" disabled={busy === r.roomId} data-testid={a.kind === 'start' ? 'room-act-start' : 'room-act-finish'}
        onClick={() => run(r.roomId, () => setBookingStatus({ bookingId: a.row.bookingId, to, expectedVersion: a.row.version }))}>
        {tb(`actions.${to}`)}
      </Button>
    );
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <h2 className="font-serif text-heading text-ink">{t('roomStatus')}</h2>
      {model.rooms.length === 0 ? <EmptyState>{t('nothing')}</EmptyState> : (
        <div tabIndex={0} className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto pr-1">
          {zones.map((z) => (
            <div key={z || '__none'} className="flex flex-col gap-2">
              <h3 className="text-caption font-medium text-ink-muted">{z || tr('noZone')}</h3>
              <ul className="flex flex-col gap-2">
                {groups.get(z)!.map((r) => {
                  const w = what(r);
                  return (
                    <li key={r.roomId} data-testid="room-status-row" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-line bg-surface p-3">
                      <span className="font-semibold break-words text-ink">{code(r)}</span>
                      <StatusChip kind="room" status={r.status} label={s(ROOM_STATUS_KEY[r.status])} />
                      {w && <span className="min-w-0 break-words text-body text-ink">{w}</span>}
                      {r.status === 'occupied' && r.expectedEnd && <span className="tnum text-caption text-ink-muted">{t('expectedEnd')} {formatTime(r.expectedEnd)}</span>}
                      {r.status === 'cleaning' && r.turnoverDueAt && <span className="tnum text-caption text-ink-muted">{t('due')} {formatTime(r.turnoverDueAt)}</span>}
                      <span className="ml-auto">{action(r)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
