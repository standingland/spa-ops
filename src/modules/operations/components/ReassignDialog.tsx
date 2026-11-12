'use client';

import { useEffect, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <Card>
    <section className="flex flex-col gap-3" aria-label={t('reassignTitle')} data-testid="reassign-dialog">
      <div className="flex items-center gap-3">
        <h2 className="font-serif text-heading text-ink">{t('reassignTitle')}</h2>
        <Button variant="link" className="ml-auto min-h-11 px-2 pointer-fine:min-h-0" onClick={onClose}>{t('close')}</Button>
      </div>
      {data && <p className="tnum min-w-0 break-words text-body">{data.booking.customerDisplayName} · {bangkokDay(data.booking.startsAt)} {formatTime(data.booking.startsAt)}–{formatTime(data.booking.endsAt)}</p>}
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {data && data.candidates.length === 0 && (
        <p className="text-body">{t('noAlternatives')}{' '}
          <Link className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0" href={`/calendar?day=${bangkokDay(data.booking.startsAt)}`}>{t('openCalendar')}</Link></p>
      )}
      <ul className="flex flex-wrap gap-2">
        {data?.candidates.slice(0, 12).map((c) => (
          <li key={c.therapistId + c.positionId} className="min-w-0">
            <Button variant="secondary" size="sm" disabled={busy} data-testid="reassign-option" onClick={() => apply(c)} className="max-w-full break-words">
              {names.therapists[c.therapistId]} · {names.rooms[c.roomId]}
            </Button>
          </li>
        ))}
      </ul>
    </section>
    </Card>
  );
}
