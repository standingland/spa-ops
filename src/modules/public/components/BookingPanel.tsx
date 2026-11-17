'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { formatTHB } from '@/lib/money';
import { addDays, formatTime } from '@/lib/time';
import { bookOnline, loadTimes } from '../actions';
import type { PublicService } from '../queries';
import { afterBookError } from './bookingState';
import { WaitlistJoin } from '@/modules/care/components/WaitlistJoin';

export type Selection = { serviceId?: string; day?: string; start?: string };

/** The state a failed LINE login or a taken slot sends the guest back with; unknown codes show a generic message. */
const KNOWN = new Set(['closed', 'login', 'busy']);
const DAYS_SHOWN = 14;

const heading = 'font-serif text-xl font-normal text-ink';

export function BookingPanel({ therapistId, services, guestName, today, initial, error: initialError, waitlistEnabled = false }: {
  therapistId: string; services: PublicService[]; guestName: string | null; today: string; initial: Selection; error: string | null; waitlistEnabled?: boolean;
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

  const tag = locale === 'th' ? 'th-TH' : 'en-GB';
  // calendar days are labelled in UTC from a noon instant, so the label never shifts with the viewer's time zone
  const label = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const strip = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));

  const name = (s: PublicService) => (locale === 'en' && s.nameEn ? s.nameEn : s.nameTh);
  const chosen = services.find((s) => s.id === serviceId);
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

  const signedIn = guestName !== null && !signedOut;

  return (
    <div className="flex min-w-0 flex-col gap-9" data-testid="booking-panel">
      {error && <Alert tone="error" data-testid="book-error">{KNOWN.has(error) ? t(`errors.${error}`) : errText(error)}</Alert>}

      <fieldset className="flex flex-col">
        <legend className={`${heading} mb-2`}>{t('services')}</legend>
        {services.map((s) => (
          <label key={s.id} className="flex min-h-16 cursor-pointer items-center gap-4 border-b border-line py-3">
            <input type="radio" name="service" checked={serviceId === s.id} data-testid="service-option"
              onChange={() => { setServiceId(s.id); setStart(''); }}
              className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong checked:border-[6px] checked:border-primary" />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-body text-ink">{name(s)}</span>
              <span className="block text-caption text-ink-muted">{t('minutes', { n: s.durationMin })}</span>
            </span>
            <span className="tnum shrink-0 text-body text-ink">{formatTHB(s.priceSatang)}</span>
          </label>
        ))}
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="day-heading">
        <h2 id="day-heading" className={heading}>{t('date')}</h2>
        <div className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-labelledby="day-heading">
          {strip.map((d) => (
            <button key={d} type="button" data-testid="day-option" aria-pressed={day === d} onClick={() => { setDay(d); setStart(''); }}
              className={`flex min-h-[4.25rem] w-14 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border text-center ${day === d ? 'border-primary bg-primary text-primary-foreground' : 'border-line-strong text-ink'}`}>
              <span className="text-caption">{label(d, { weekday: 'short' })}</span>
              <span className="tnum font-serif text-xl leading-6">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-caption text-ink-muted">
          {t('anotherDate')}
          <input type="date" min={today} value={day} data-testid="book-day"
            onChange={(e) => { setDay(e.target.value || today); setStart(''); }}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-transparent px-3 text-body text-ink [color-scheme:dark]" />
        </label>
      </section>

      {serviceId && (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h2 className={heading}>{t('time')}</h2>
          {times === null && <p className="text-caption text-ink-muted">{t('loadingTimes')}</p>}
          {times?.length === 0 && <p className="text-body text-ink-muted" data-testid="no-times">{t('noTimes')}</p>}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {times?.map((iso) => (
              <button key={iso} type="button" data-testid="time-option" aria-pressed={start === iso} onClick={() => setStart(iso)}
                className={`tnum min-h-11 rounded-full border text-body ${start === iso ? 'border-primary bg-primary text-primary-foreground' : 'border-line-strong text-ink'}`}>
                {formatTime(iso)}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-muted">{t('timezone')}</p>
        </section>
      )}

      {waitlistEnabled && serviceId && <WaitlistJoin key={`${serviceId}|${day}`} therapistId={therapistId} serviceId={serviceId} day={day} signedIn={signedIn} />}

      <div className="flex flex-col gap-3">
        {signedIn
          ? <p className="text-caption text-ink-muted" data-testid="booking-as">{t('bookingAs', { name: guestName || 'LINE' })}</p>
          : <p className="max-w-[46ch] text-caption text-ink-muted">{t('signInHelp')}</p>}
      </div>

      {/* pinned to the bottom of the screen: what is chosen, and the one action that follows */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface-muted/90 px-5 py-3 backdrop-blur-md lg:mx-0 lg:rounded-2xl lg:border lg:px-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1" aria-live="polite">
            {ready && chosen ? (
              <>
                <p className="truncate text-body text-ink">{name(chosen)}</p>
                <p className="tnum truncate text-caption text-ink-muted">
                  {t('daySummary', { day: label(day, { weekday: 'short', day: 'numeric', month: 'short' }), time: formatTime(start) })}
                </p>
              </>
            ) : (
              <p className="text-caption text-ink-muted">{t('choose')}</p>
            )}
          </div>
          {signedIn ? (
            <Button type="button" disabled={!ready || busy} onClick={confirm} data-testid="book-confirm" className="shrink-0">{busy ? t('confirming') : t('confirm')}</Button>
          ) : (
            /* a plain link: the sign-in is a server route that redirects to LINE, not a page of this app */
            <a href={loginHref} data-testid="book-line" aria-disabled={!ready} className={`${buttonVariants({})} shrink-0${ready ? '' : ' pointer-events-none opacity-60'}`}>{t('continueLine')}</a>
          )}
        </div>
      </div>
    </div>
  );
}
