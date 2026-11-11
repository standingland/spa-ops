'use client';

import { useEffect, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { moveBooking, type BoardRow } from '@/modules/booking/actions';
import type { Candidate } from '@/modules/booking/allocation';
import { suggestReassign } from '../actions';
import type { Names } from './AttentionList';

/** Lists ranked alternatives at the same time and applies the chosen one with moveBooking. */
export function ReassignDialog({ bookingId, names, onClose }: { bookingId: string; names: Names; onClose: () => void }) {
  const t = useTranslations('exceptions');
  const te = useTranslations();
  const router = useRouter();
  const [data, setData] = useState<{ booking: BoardRow; candidates: Candidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await suggestReassign(bookingId);
      if (!live) return;
      if (r.ok) setData({ booking: r.booking, candidates: r.candidates });
      else setError(errorText(te(uiErrorKey(r.code)), r));
    })();
    return () => { live = false; };
  }, [bookingId, te]);

  async function apply(c: Candidate) {
    if (!data) return;
    setBusy(true); setError(null);
    const r = await moveBooking({
      bookingId, start: data.booking.startsAt, therapistId: c.therapistId, positionId: c.positionId, expectedVersion: data.booking.version,
    });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    onClose();
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-stone bg-white p-4" aria-label={t('reassignTitle')} data-testid="reassign-dialog">
      <div className="flex items-center gap-3">
        <h2 className="text-lg">{t('reassignTitle')}</h2>
        <button className="ml-auto text-sm underline" onClick={onClose}>{t('close')}</button>
      </div>
      {data && <p className="tnum text-sm">{data.booking.customerDisplayName} · {bangkokDay(data.booking.startsAt)} {formatTime(data.booking.startsAt)}–{formatTime(data.booking.endsAt)}</p>}
      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
      {data && data.candidates.length === 0 && (
        <p className="text-sm">{t('noAlternatives')}{' '}
          <Link className="underline" href={`/calendar?day=${bangkokDay(data.booking.startsAt)}`}>{t('openCalendar')}</Link></p>
      )}
      <ul className="flex flex-wrap gap-2">
        {data?.candidates.slice(0, 12).map((c) => (
          <li key={c.therapistId + c.positionId}>
            <button disabled={busy} data-testid="reassign-option" onClick={() => apply(c)} className="rounded border border-charcoal px-3 py-1.5 text-sm">
              {names.therapists[c.therapistId]} · {names.rooms[c.roomId]}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
