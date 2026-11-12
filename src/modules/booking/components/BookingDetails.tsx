'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { StatusChip } from '@/components/ui/badge';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { usePanelBehavior } from '@/lib/usePanelBehavior';
import { TreatmentNote } from '@/modules/customers/components/TreatmentNote';
import { DESK_NEXT, THERAPIST_NEXT } from '@/modules/operations/components/BookingActions';
import { PaymentSection } from '@/modules/payments/components/PaymentSection';
import { getBookingEvents, moveBooking, setBookingStatus, type BoardRow } from '../actions';
import type { BookingEventView } from '../events';
import type { Role, RoomOpt, TherapistOpt } from './types';

const toIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : '');
const localOf = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;

/**
 * Details for one booking: a right-hand panel from lg (the calendar stays usable beside it), a full-screen sheet below.
 * Not modal. Mounted while a booking is selected; `onClose` is called after focus has been returned to the opener.
 */
export function BookingDetails({ row, role, labels, moveOptions, onClose }: {
  row: BoardRow; role: Role;
  labels: { service: string; therapist: string; room: string };
  moveOptions?: { therapists: TherapistOpt[]; rooms: RoomOpt[] };
  onClose: () => void;
}) {
  const t = useTranslations('booking');
  const te = useTranslations();
  const router = useRouter();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [start, setStart] = useState(localOf(row.startsAt));
  const [therapistId, setTherapistId] = useState(row.therapistId);
  const [positionId, setPositionId] = useState(row.positionId);
  const [events, setEvents] = useState<BookingEventView[]>([]);

  // Order matters: usePanelBehavior notes the opener first, then focus moves into the panel.
  usePanelBehavior(open, () => setOpen(false));
  useEffect(() => { panel.current?.focus(); }, []);
  // The hook returns focus when `open` turns false; only then is the parent told to unmount us.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  useEffect(() => {
    let live = true;
    void getBookingEvents(row.bookingId).then((r) => { if (live && r.ok) setEvents(r.events); });
    return () => { live = false; };
  }, [row.bookingId, row.version]);

  const next = (role === 'therapist' ? THERAPIST_NEXT : DESK_NEXT)[row.status] ?? [];
  const movable = !!moveOptions && role !== 'therapist' && ['requested', 'confirmed', 'checked_in'].includes(row.status);
  const positions = (moveOptions?.rooms ?? []).flatMap((r) => r.room_positions.filter((p) => p.active || p.id === row.positionId).map((p) => ({ id: p.id, label: `${r.code} · ${p.label}` })));

  async function act(p: Promise<{ ok: true } | { ok: false; code: string }>) {
    setBusy(true); setError(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return false; }
    startTransition(() => router.refresh());
    setOpen(false);
    return true;
  }

  const sentence = (e: BookingEventView): string | null => {
    switch (e.kind) {
      case 'created': return t('history.created');
      case 'status_changed':
        if (!e.to) return null;
        return e.from ? t('history.statusChanged', { from: t(`status.${e.from}`), to: t(`status.${e.to}`) }) : t('history.statusSet', { to: t(`status.${e.to}`) });
      case 'rescheduled': return t('history.rescheduled');
      case 'reassigned': return t('history.reassigned');
    }
  };
  const history = events.map((e) => ({ e, text: sentence(e) })).filter((x): x is { e: BookingEventView; text: string } => x.text !== null);

  if (!open) return null;

  const details: [string, string][] = [
    [t('fields.guest'), row.customerDisplayName],
    [t('fields.date'), bangkokDay(row.startsAt)],
    [t('fields.time'), `${formatTime(row.startsAt)}–${formatTime(row.endsAt)}`],
    [t('fields.treatment'), labels.service],
    [t('fields.therapist'), labels.therapist],
    [t('fields.room'), labels.room],
  ];

  return (
    <section ref={panel} tabIndex={-1} role="dialog" aria-labelledby={titleId} data-testid="booking-panel"
      className="fixed inset-0 z-50 flex min-w-0 flex-col gap-4 overflow-y-auto bg-surface p-4 outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[28rem] lg:border-l lg:border-line lg:shadow-lg">
      <div className="flex items-start gap-3">
        <h2 id={titleId} className="min-w-0 flex-1 break-words font-serif text-heading text-ink">{row.customerDisplayName}</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} data-testid="panel-close">{t('close')}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip kind="booking" status={row.status} label={t(`status.${row.status}`)} />
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-body">
        {details.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-caption text-ink-muted">{k}</dt>
            <dd className="tnum min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <TreatmentNote bookingId={row.bookingId} />
      {role !== 'therapist' && <PaymentSection bookingId={row.bookingId} version={row.version} />}
      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}

      <div className="flex flex-wrap gap-2">
        {next.filter((s) => s !== 'cancelled').map((s) => (
          <Button key={s} variant="secondary" disabled={busy} data-testid={`status-${s}`}
            onClick={() => act(setBookingStatus({ bookingId: row.bookingId, to: s, expectedVersion: row.version }))}>{t(`actions.${s}`)}</Button>
        ))}
        {movable && <Button variant="secondary" data-testid="booking-move" onClick={() => setMoving(true)}>{t('actions.move')}</Button>}
        {next.includes('cancelled') && !cancelling && (
          <Button variant="secondary" className="border-danger text-danger" data-testid="booking-cancel" onClick={() => setCancelling(true)}>{t('actions.cancelled')}</Button>
        )}
        {cancelling && (
          <>
            <Button variant="danger" disabled={busy} data-testid="cancel-confirm"
              onClick={() => act(setBookingStatus({ bookingId: row.bookingId, to: 'cancelled', expectedVersion: row.version }))}>{t('actions.confirmCancel')}</Button>
            <Button variant="secondary" onClick={() => setCancelling(false)}>{te('common.cancel')}</Button>
          </>
        )}
      </div>

      {moving && moveOptions && (
        <form className="flex flex-col gap-3 border-t border-line pt-3" aria-label={t('moveTitle')}
          onSubmit={(e) => { e.preventDefault(); void act(moveBooking({ bookingId: row.bookingId, start: toIso(start), therapistId, positionId, expectedVersion: row.version })); }}>
          <Field label={t('start')}>
            <Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} data-testid="move-start" />
          </Field>
          <Field label={t('therapist')}>
            <Select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} data-testid="move-therapist">
              {moveOptions.therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
            </Select>
          </Field>
          <Field label={t('position')}>
            <Select value={positionId} onChange={(e) => setPositionId(e.target.value)} data-testid="move-position">
              {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <div><Button type="submit" disabled={busy} data-testid="move-confirm">{t('confirmMove')}</Button></div>
        </form>
      )}

      {history.length > 0 && (
        <section data-testid="booking-history" className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="font-serif text-heading text-ink">{t('history.title')}</h3>
          <ol className="flex flex-col gap-1.5">
            {history.map(({ e, text }, i) => (
              <li key={i} data-kind={e.kind} className="flex min-w-0 flex-wrap gap-x-3 text-body text-ink">
                <span className="tnum shrink-0 text-ink-muted">{bangkokDay(e.at)} {formatTime(e.at)}</span>
                <span className="min-w-0 break-words">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
