'use client';

import { useEffect, useRef, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { CustomerPicker } from '@/modules/customers/components/CustomerPicker';
import type { CustomerHit } from '@/modules/customers/actions';
import { createBooking, suggestAllocations } from '../actions';
import type { Candidate } from '../allocation';
import type { RoomOpt, ServiceOpt, TherapistOpt } from './types';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';
const toIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : '');

/** Current time rounded up to the next 5 minutes, as a Bangkok datetime-local value. */
function walkInStart(): string {
  const ms = Math.ceil(Date.now() / 300000) * 300000;
  const iso = new Date(ms).toISOString();
  return `${bangkokDay(iso)}T${formatTime(iso)}`;
}

export function NewBookingForm({ therapists, rooms, services, view, onClose }: {
  therapists: TherapistOpt[]; rooms: RoomOpt[]; services: ServiceOpt[]; view: string; onClose: () => void;
}) {
  const t = useTranslations('booking');
  const c = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID()); // generated once when the form opens, reused on every retry
  const inFlight = useRef(false);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [start, setStart] = useState('');
  const [source, setSource] = useState<'advance' | 'walk_in'>('advance');
  const [therapistId, setTherapistId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [note, setNote] = useState('');
  const [suggestions, setSuggestions] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const positions = rooms.flatMap((r) => r.room_positions.filter((p) => p.active).map((p) => ({ id: p.id, roomId: r.id, label: `${r.code} · ${p.label}` })));
  const therapistName = (id: string) => therapists.find((x) => x.id === id)?.display_name ?? '';
  const positionLabel = (id: string) => positions.find((p) => p.id === id)?.label ?? '';
  const svcName = (s: ServiceOpt) => (locale === 'en' && s.name_en ? s.name_en : s.name_th);

  useEffect(() => {
    if (!serviceId || !start) return;
    let live = true;
    const id = setTimeout(async () => {
      const r = await suggestAllocations({ serviceId, start: toIso(start), customerId: customer?.id });
      if (!live) return;
      setSuggestions(r.ok ? r.candidates : []);
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [serviceId, start, customer?.id]);

  async function confirm() {
    if (inFlight.current) return;
    if (!customer || !serviceId || !start || !therapistId || !positionId) { setError(te('errors.INVALID_INPUT')); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await createBooking({
      customerId: customer.id, serviceId, therapistId, positionId, start: toIso(start), source,
      idempotencyKey: idempotencyKey.current, note,
    });
    inFlight.current = false;
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    onClose();
    router.push(`/calendar?day=${bangkokDay(r.start)}&view=${view}`);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-stone bg-white p-4" aria-label={t('new')} data-testid="new-booking-form">
      <div className="flex items-center gap-3">
        <h2 className="text-lg">{t('new')}</h2>
        <button type="button" className="ml-auto text-sm underline" onClick={onClose} data-testid="panel-close">{t('close')}</button>
      </div>
      <CustomerPicker selected={customer} onSelect={setCustomer} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm">{t('service')}
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={field} data-testid="booking-service">
            {services.map((s) => <option key={s.id} value={s.id}>{svcName(s)}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">{t('start')}
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={field} data-testid="booking-start" />
        </label>
        <div className="flex items-end gap-2 text-sm">
          <label className="flex flex-col">{t('source')}
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={field} data-testid="booking-source">
              <option value="advance">{t('sourceAdvance')}</option><option value="walk_in">{t('sourceWalkIn')}</option>
            </select>
          </label>
          <button type="button" className="rounded border border-charcoal px-2 py-1" data-testid="walk-in"
            onClick={() => { setSource('walk_in'); setStart(walkInStart()); }}>{t('walkIn')}</button>
        </div>
      </div>

      {serviceId && start && (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t('suggestions')}</h3>
          {suggestions === null && <p className="text-sm text-stone-dark">{c('loading')}</p>}
          {suggestions?.length === 0 && <p className="text-sm text-stone-dark">{t('noSuggestions')}</p>}
          <ul className="flex flex-wrap gap-2">
            {suggestions?.slice(0, 12).map((s) => (
              <li key={s.therapistId + s.positionId}>
                <button type="button" data-testid="suggestion" aria-pressed={therapistId === s.therapistId && positionId === s.positionId}
                  className={`rounded border px-2 py-1 text-sm ${therapistId === s.therapistId && positionId === s.positionId ? 'border-charcoal bg-charcoal text-ivory' : 'border-stone-dark'}`}
                  onClick={() => { setTherapistId(s.therapistId); setPositionId(s.positionId); }}>
                  {therapistName(s.therapistId)} · {positionLabel(s.positionId)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm">{t('therapist')}
          <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} className={field} data-testid="booking-therapist">
            <option value="" />
            {therapists.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">{t('position')}
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className={field} data-testid="booking-position">
            <option value="" />
            {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">{t('note')}<input value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
      </div>

      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
      <div>
        <button type="button" disabled={busy} onClick={confirm} data-testid="confirm-booking"
          className="rounded bg-charcoal px-4 py-2 text-sm text-ivory disabled:opacity-60">{busy ? t('saving') : t('confirm')}</button>
      </div>
    </section>
  );
}
