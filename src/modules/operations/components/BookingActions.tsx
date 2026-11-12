'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { setBookingStatus, type BoardRow } from '@/modules/booking/actions';
import type { BookingStatus } from '@/modules/booking/schema';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';

export const DESK_NEXT: Partial<Record<BookingStatus, BookingStatus[]>> = {
  requested: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'no_show', 'cancelled'], checked_in: ['in_treatment', 'cancelled'], in_treatment: ['completed'],
};
export const THERAPIST_NEXT: Partial<Record<BookingStatus, BookingStatus[]>> = { checked_in: ['in_treatment'], in_treatment: ['completed'] };

/** Only the actions the signed-in role may take; the database still enforces them. */
export function BookingActions({ row, role, onError }: { row: BoardRow; role: Role; onError: (message: string | null) => void }) {
  const t = useTranslations('booking');
  const te = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const next = (role === 'therapist' ? THERAPIST_NEXT : DESK_NEXT)[row.status] ?? [];

  async function go(to: BookingStatus) {
    setBusy(true); onError(null);
    const r = await setBookingStatus({ bookingId: row.bookingId, to, expectedVersion: row.version });
    setBusy(false);
    if (!r.ok) { onError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  return (
    <span className="flex flex-wrap gap-2 text-sm">
      {next.filter((s) => s !== 'cancelled').map((s) => (
        <button key={s} disabled={busy} data-testid={`act-${s}`} onClick={() => go(s)}
          className="rounded border border-charcoal px-3 py-1.5 disabled:opacity-60">{t(`actions.${s}`)}</button>
      ))}
      {next.includes('cancelled') && !confirming && (
        <button disabled={busy} data-testid="act-cancelled" onClick={() => setConfirming(true)}
          className="rounded border border-clay px-3 py-1.5 text-clay">{t('actions.cancelled')}</button>
      )}
      {confirming && (
        <>
          <button disabled={busy} data-testid="act-cancelled-confirm" onClick={() => { setConfirming(false); void go('cancelled'); }}
            className="rounded bg-clay px-3 py-1.5 text-white">{t('actions.confirmCancel')}</button>
          <button onClick={() => setConfirming(false)} className="underline">×</button>
        </>
      )}
    </span>
  );
}
