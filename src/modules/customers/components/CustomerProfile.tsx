'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { addPrivateNote, saveCustomer } from '../actions';
import type { CustomerProfile as Profile } from '../schema';
import { PrivacyTools } from './PrivacyTools';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
export type ProfileNames = { services: Record<string, string>; therapists: Record<string, string>; rooms: Record<string, string> };
const field = 'rounded border border-stone-dark px-2 py-1 text-sm disabled:bg-stone/30';

export function CustomerProfile({ customer: c, role, names }: { customer: Profile; role: Role; names: ProfileNames }) {
  const t = useTranslations('customers');
  const tp = useTranslations('payments');
  const tb = useTranslations('booking');
  const te = useTranslations();
  const router = useRouter();
  const gone = c.anonymisedAt !== null;
  const isManager = role === 'owner' || role === 'manager';
  const [f, setF] = useState({
    displayName: c.displayName, fullName: c.fullName ?? '', phone: c.phone ?? '', email: c.email ?? '',
    preferredTherapistId: c.preferredTherapistId ?? '', serviceNotes: c.serviceNotes ?? '', commsConsent: c.commsConsent,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const r = await saveCustomer({ id: c.id, ...f, preferredTherapistId: f.preferredTherapistId || null });
    setBusy(false);
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    setNotice(t('saved'));
    router.refresh();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await addPrivateNote({ customerId: c.id, body: note });
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    setNote('');
    router.refresh();
  }

  const stat = (id: string, label: string, v: string | number) => (
    <div className="rounded border border-stone bg-white p-3"><div className="text-xs text-stone-dark">{label}</div><div className="tnum text-2xl" data-testid={`stat-${id}`}>{v}</div></div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl" data-testid="customer-name">{c.displayName}</h1>
        {gone && <span className="rounded bg-ivory px-2 py-0.5 text-xs" data-testid="anonymised-badge">{t('removed')}</span>}
        <Link href="/customers" className="ml-auto text-sm underline">← {t('title')}</Link>
      </div>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}
      {notice && <p role="status" className="rounded border border-sage bg-white px-3 py-2 text-sm">{notice}</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t('summary')}>
        {stat('visits', t('visits'), c.summary.visits)}
        {stat('cancelled', t('cancelled'), c.summary.cancelled)}
        {stat('no-shows', t('noShows'), c.summary.noShows)}
        {stat('upcoming', t('upcoming'), c.summary.upcoming)}
        <div className="rounded border border-stone bg-white p-3 text-sm sm:col-span-4">
          <span className="tnum">{t('firstVisit')}: {c.summary.firstVisit ? bangkokDay(c.summary.firstVisit) : '—'}</span>{' · '}
          <span className="tnum">{t('lastVisit')}: {c.summary.lastVisit ? bangkokDay(c.summary.lastVisit) : '—'}</span>{' · '}
          <span className="tnum">{t('avgDays')}: {c.summary.avgDaysBetween ?? '—'}</span>{' · '}
          <span>{t('topService')}: {c.summary.topServiceId ? names.services[c.summary.topServiceId] : '—'}</span>
        </div>
      </section>

      <form onSubmit={save} className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-2" aria-label={t('details')}>
        <label className="flex flex-col text-sm">{t('displayName')}<input data-testid="f-display-name" value={f.displayName} onChange={set('displayName')} disabled={gone} className={field} /></label>
        <label className="flex flex-col text-sm">{t('fullName')}<input value={f.fullName} onChange={set('fullName')} disabled={gone} className={field} /></label>
        <label className="flex flex-col text-sm">{t('phone')}<input data-testid="f-phone" value={f.phone} onChange={set('phone')} disabled={gone} className={field} inputMode="tel" /></label>
        <label className="flex flex-col text-sm">{t('email')}<input value={f.email} onChange={set('email')} disabled={gone} className={field} type="email" /></label>
        <label className="flex flex-col text-sm">{t('preferredTherapist')}
          <select value={f.preferredTherapistId} onChange={set('preferredTherapistId')} disabled={gone} className={field}>
            <option value="">—</option>
            {Object.entries(names.therapists).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select></label>
        <label className="flex flex-col text-sm sm:col-span-2">{t('serviceNotes')}
          <textarea data-testid="f-service-notes" value={f.serviceNotes} onChange={set('serviceNotes')} disabled={gone} rows={2} className={field} /></label>
        <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" data-testid="consent" checked={f.commsConsent} onChange={set('commsConsent')} disabled={gone} className="h-5 w-5" />{t('consent')}</label>
          <span className="text-xs text-stone-dark">{t('consentRecorded')}: <span className="tnum" data-testid="consent-recorded">{c.consentRecordedAt ? `${bangkokDay(c.consentRecordedAt)} ${formatTime(c.consentRecordedAt)}` : ''}</span></span>
        </div>
        {!gone && <div><button type="submit" disabled={busy} data-testid="save-customer" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{te('common.save')}</button></div>}
      </form>

      <section className="flex flex-col gap-2" aria-label={t('history')}>
        <h2 className="text-lg">{t('history')}</h2>
        {c.history.length === 0 && <p className="text-sm text-stone-dark">{te('common.empty')}</p>}
        <ul className="flex flex-col gap-2">
          {c.history.map((h) => (
            <li key={h.bookingId} data-testid="history-row" data-status={h.status} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-stone bg-white p-3 text-sm">
              <span className="tnum font-semibold">{bangkokDay(h.startsAt)} {formatTime(h.startsAt)}</span>
              <span>{names.services[h.serviceId]}</span>
              <span className="text-stone-dark">{names.therapists[h.therapistId]} · {names.rooms[h.roomId]}</span>
              <span className="rounded bg-ivory px-2 py-0.5 text-xs">{tb(`status.${h.status}`)}</span>
              {h.money && <span data-testid="payment-status" data-status={h.money.paymentStatus} className="rounded bg-ivory px-2 py-0.5 text-xs">{tp(`status.${h.money.paymentStatus}`)}</span>}
              {h.note && <span className="text-stone-dark">{h.note}</span>}
            </li>
          ))}
        </ul>
      </section>

      {isManager && (
        <section className="flex flex-col gap-2" aria-label={t('privateNotes')}>
          <h2 className="text-lg">{t('privateNotes')}</h2>
          <ul className="flex flex-col gap-2">
            {c.privateNotes.map((n) => (
              <li key={n.id} data-testid="private-note" className="rounded border border-stone bg-white p-3 text-sm"><span className="tnum text-xs text-stone-dark">{bangkokDay(n.createdAt)}</span> {n.body}</li>
            ))}
          </ul>
          {!gone && (
            <form onSubmit={addNote} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-1 flex-col text-sm">{t('newNote')}<input data-testid="note-body" value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
              <button type="submit" data-testid="note-add" className="rounded border border-charcoal px-3 py-1.5 text-sm">{t('addNote')}</button>
            </form>
          )}
        </section>
      )}

      {isManager && <PrivacyTools customerId={c.id} displayName={c.displayName} isOwner={role === 'owner'} anonymised={gone} />}
    </div>
  );
}
