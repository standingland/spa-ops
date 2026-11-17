'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getBookingPreferences } from '../actions';
import type { Preferences } from '../schema';

export function BookingPreferences({ bookingId }: { bookingId: string }) {
  const t = useTranslations('care'); const [loaded, setLoaded] = useState<{ id: string; value: Preferences } | null>(null);
  useEffect(() => { let live = true; getBookingPreferences(bookingId).then((value) => { if (live) setLoaded({ id: bookingId, value }); }); return () => { live = false; }; }, [bookingId]);
  const p = loaded?.id === bookingId ? loaded.value : {};
  const details = [p.pressure ? `${t('pressure')}: ${t(`pressures.${p.pressure}`)}` : '', p.oil ? `${t('oil')}: ${p.oil}` : '', p.room ? `${t('room')}: ${p.room}` : '', p.notes].filter(Boolean);
  return details.length ? <span className="block w-full break-words rounded-xl border border-line p-3 text-caption text-ink" data-testid="booking-preferences"><strong>{t('preferences')}</strong> · {details.join(' · ')}</span> : null;
}
