'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRouter } from '@/i18n/navigation';
import { formatTHB } from '@/lib/money';
import { formatTime } from '@/lib/time';
import { bookOnline, loadTimes } from '../actions';
import { afterBookError } from './bookingState';
import type { PublicService } from '../queries';

export type Selection = { serviceId?: string; day?: string; start?: string };

/** The state a failed LINE login or a taken slot sends the guest back with; unknown codes show a generic message. */
const KNOWN = new Set(['closed', 'login', 'busy']);

export function BookingPanel({ therapistId, services, guestName, today, initial, error: initialError }: {
  therapistId: string; services: PublicService[]; guestName: string | null; today: string; initial: Selection; error: string | null;
}) {
  const t = useTranslations('public');
  const locale = useLocale();
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services.some((s) => s.id === initial.serviceId) ? initial.serviceId! : '');
  const [day, setDay] = useState(initial.day && initial.day >= today ? initial.day : today);
  const [loaded, setLoaded] = useState<{ key: string; list: string[] } | null>(null);
  const [start, setStart] = useState(initial.start ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError && KNOWN.has(initialError) ? initialError : null);
  const [reload, setReload] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const attempt = useRef<{ sel: string; key: string } | null>(null);

  // "loading" is derived: the list on hand belongs to a (service, day) key, and any other key means it is still loading
  const timesKey = `${serviceId}|${day}|${reload}`;
  const times = serviceId && loaded?.key === timesKey ? loaded.list : null;
  useEffect(() => {
    if (!serviceId) return;
    let live = true;
    loadTimes({ therapistId, serviceId, day }).then((list) => {
      if (!live) return;
      setLoaded({ key: timesKey, list });
      setStart((s) => (s && !list.includes(s) ? '' : s));   // a choice that is no longer free is dropped, not submitted
    });
    return () => { live = false; };
  }, [therapistId, serviceId, day, timesKey]);

  const name = (s: PublicService) => (locale === 'en' && s.nameEn ? s.nameEn : s.nameTh);
  const ready = Boolean(serviceId && start);
  const returnTo = `/${locale}/book/${therapistId}`;
  const loginHref = `/api/line/login?${new URLSearchParams({ returnTo, ...(serviceId ? { serviceId } : {}), ...(day ? { day } : {}), ...(start ? { start } : {}) })}`;
  const errText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN'));

  async function confirm() {
    if (!ready || busy) return;
    const sel = `${serviceId}|${start}`;
    // the same choice keeps one idempotency key, so a double tap or a retry can never book twice
    if (attempt.current?.sel !== sel) attempt.current = { sel, key: crypto.randomUUID() };
    setBusy(true); setError(null);
    const r = await bookOnline({ therapistId, serviceId, start, idempotencyKey: attempt.current.key });
    setBusy(false);
    if (r.ok) { router.push(`/book/done?token=${encodeURIComponent(r.cancelToken)}`); return; }
    setError(r.code);
    const next = afterBookError(r.code);
    if (next.clearStart) setStart('');
    if (next.reload) setReload((n) => n + 1);
    if (next.signedOut) setSignedOut(true);
  }

  if (services.length === 0) return <Alert>{t('noServices')}</Alert>;

  return (
    <Card className="flex flex-col gap-5" data-testid="booking-panel">
      {error && <Alert tone="error" data-testid="book-error">{KNOWN.has(error) ? t(`errors.${error}`) : errText(error)}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-serif text-heading text-ink">{t('services')}</legend>
        {services.map((s) => (
          <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-line p-3 has-[:checked]:border-primary">
            <input type="radio" name="service" className="size-5 accent-primary" checked={serviceId === s.id} data-testid="service-option"
              onChange={() => { setServiceId(s.id); setStart(''); }} />
            <span className="min-w-0 flex-1 break-words">{name(s)}</span>
            <span className="tnum shrink-0 text-caption text-ink-muted">{t('minutes', { n: s.durationMin })} · {formatTHB(s.priceSatang)}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="book-day" className="font-serif text-heading text-ink">{t('date')}</label>
        <input id="book-day" type="date" min={today} value={day} data-testid="book-day"
          onChange={(e) => { setDay(e.target.value || today); setStart(''); }}
          className="min-h-11 w-full rounded-[var(--radius)] border border-line-strong bg-surface px-3 text-body" />
      </div>

      {serviceId && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <h2 className="font-serif text-heading text-ink">{t('time')}</h2>
          {times === null && <p className="text-caption text-ink-muted">{t('loadingTimes')}</p>}
          {times?.length === 0 && <p className="text-body text-ink-muted" data-testid="no-times">{t('noTimes')}</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {times?.map((iso) => (
              <button key={iso} type="button" data-testid="time-option" aria-pressed={start === iso} onClick={() => setStart(iso)}
                className={`tnum min-h-11 rounded-[var(--radius)] border text-body ${start === iso ? 'border-primary bg-primary text-primary-foreground' : 'border-line-strong bg-surface text-ink'}`}>
                {formatTime(iso)}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-muted">{t('timezone')}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {!ready && <p className="text-caption text-ink-muted">{t('choose')}</p>}
        {guestName !== null && !signedOut ? (
          <>
            <p className="text-body text-ink" data-testid="booking-as">{t('bookingAs', { name: guestName || 'LINE' })}</p>
            <Button type="button" disabled={!ready || busy} onClick={confirm} data-testid="book-confirm">{busy ? t('confirming') : t('confirm')}</Button>
          </>
        ) : (
          <>
            <p className="text-caption text-ink-muted">{t('signInHelp')}</p>
            {/* a plain link: the sign-in is a server route that redirects to LINE, not a page of this app */}
            <a href={loginHref} data-testid="book-line" aria-disabled={!ready} className={buttonVariants({}) + (ready ? '' : ' pointer-events-none opacity-60')}>{t('continueLine')}</a>
          </>
        )}
      </div>
    </Card>
  );
}
