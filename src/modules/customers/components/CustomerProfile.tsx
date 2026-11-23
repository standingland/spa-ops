'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge, StatusChip } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { bangkokDay, formatTime } from '@/lib/time';
import { addPrivateNote, saveCustomer } from '../actions';
import type { CustomerProfile as Profile } from '../schema';
import { PrivacyTools } from './PrivacyTools';
import { PreferencesForm } from '@/modules/care/components/PreferencesForm';
import type { Preferences } from '@/modules/care/schema';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
export type ProfileNames = { services: Record<string, string>; therapists: Record<string, string>; rooms: Record<string, string> };

export function CustomerProfile({ customer: c, role, names, preferences = {} }: { customer: Profile; role: Role; names: ProfileNames; preferences?: Preferences }) {
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
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setNotice(t('saved'));
    router.refresh();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await addPrivateNote({ customerId: c.id, body: note });
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setNote('');
    router.refresh();
  }

  const stat = (id: string, label: string, v: string | number) => (
    <Card className="p-3"><div className="text-caption text-ink-muted">{label}</div><div className="tnum text-title text-ink" data-testid={`stat-${id}`}>{v}</div></Card>
  );
  const h2 = 'font-serif text-heading text-ink';

  return (
    <div className="customer-profile flex min-w-0 flex-col gap-3">
      <header className="workspace-surface flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true"><Avatar name={c.displayName} /></span>
          <h2 className="min-w-0 break-words" data-testid="customer-name">{c.displayName}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {gone && <Badge data-testid="anonymised-badge">{t('removed')}</Badge>}
          <Link href="/customers" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">← {t('title')}</Link>
        </div>
      </header>
      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label={t('summary')}>
        {stat('visits', t('visits'), c.summary.visits)}
        {stat('cancelled', t('cancelled'), c.summary.cancelled)}
        {stat('no-shows', t('noShows'), c.summary.noShows)}
        {stat('upcoming', t('upcoming'), c.summary.upcoming)}
        <Card className="col-span-full p-3 text-body text-ink-muted">
          <span className="tnum">{t('firstVisit')}: {c.summary.firstVisit ? bangkokDay(c.summary.firstVisit) : '—'}</span>{' · '}
          <span className="tnum">{t('lastVisit')}: {c.summary.lastVisit ? bangkokDay(c.summary.lastVisit) : '—'}</span>{' · '}
          <span className="tnum">{t('avgDays')}: {c.summary.avgDaysBetween ?? '—'}</span>{' · '}
          <span>{t('topService')}: {c.summary.topServiceId ? names.services[c.summary.topServiceId] : '—'}</span>
        </Card>
      </section>

      <Card>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" aria-label={t('details')}>
          <h3 className={`${h2} sm:col-span-2`}>{t('details')}</h3>
          <Field label={t('displayName')}><Input data-testid="f-display-name" value={f.displayName} onChange={set('displayName')} disabled={gone} /></Field>
          <Field label={t('fullName')}><Input value={f.fullName} onChange={set('fullName')} disabled={gone} /></Field>
          <Field label={t('phone')}><Input data-testid="f-phone" value={f.phone} onChange={set('phone')} disabled={gone} inputMode="tel" /></Field>
          <Field label={t('email')}><Input value={f.email} onChange={set('email')} disabled={gone} type="email" /></Field>
          <Field label={t('preferredTherapist')}>
            <Select value={f.preferredTherapistId} onChange={set('preferredTherapistId')} disabled={gone}>
              <option value="">—</option>
              {Object.entries(names.therapists).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('serviceNotes')}>
              <Textarea data-testid="f-service-notes" value={f.serviceNotes} onChange={set('serviceNotes')} disabled={gone} rows={2} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-body text-ink sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-testid="consent" checked={f.commsConsent} onChange={set('commsConsent')} disabled={gone} className="h-5 w-5" />{t('consent')}</label>
            <span className="text-caption text-ink-muted">{t('consentRecorded')}: <span className="tnum" data-testid="consent-recorded">{c.consentRecordedAt ? `${bangkokDay(c.consentRecordedAt)} ${formatTime(c.consentRecordedAt)}` : ''}</span></span>
          </div>
          {!gone && <div><Button type="submit" disabled={busy} data-testid="save-customer">{te('common.save')}</Button></div>}
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <section className="flex flex-col gap-3" aria-label={t('history')}>
          <h2 className={h2}>{t('history')}</h2>
          {c.history.length === 0 && <EmptyState>{te('common.empty')}</EmptyState>}
          <ul className="flex flex-col divide-y divide-line">
            {c.history.map((h) => (
              <li key={h.bookingId} data-testid="history-row" data-status={h.status} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 py-3 text-body first:pt-0 last:pb-0">
                <span className="tnum font-semibold text-ink">{bangkokDay(h.startsAt)} {formatTime(h.startsAt)}</span>
                <span className="min-w-0 break-words">{names.services[h.serviceId]}</span>
                <span className="min-w-0 break-words text-ink-muted">{names.therapists[h.therapistId]} · {names.rooms[h.roomId]}</span>
                <StatusChip kind="booking" status={h.status} label={tb(`status.${h.status}`)} />
                {h.money && <Badge data-testid="payment-status" data-status={h.money.paymentStatus}>{tp(`status.${h.money.paymentStatus}`)}</Badge>}
                {h.note && <span className="min-w-0 break-words text-ink-muted">{h.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      </Card>

      <PreferencesForm key={c.id} customerId={c.id} initial={preferences} disabled={gone} />

      {isManager && (
        <Card>
          <section className="flex flex-col gap-3" aria-label={t('privateNotes')}>
            <h2 className={h2}>{t('privateNotes')}</h2>
            <ul className="flex flex-col gap-2">
              {c.privateNotes.map((n) => (
                <li key={n.id} data-testid="private-note" className="min-w-0 break-words rounded-[var(--radius)] border border-line bg-surface-muted p-3 text-body"><span className="tnum text-caption text-ink-muted">{bangkokDay(n.createdAt)}</span> {n.body}</li>
              ))}
            </ul>
            {!gone && (
              <form onSubmit={addNote} className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1"><Field label={t('newNote')}><Input data-testid="note-body" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
                <Button type="submit" variant="secondary" data-testid="note-add">{t('addNote')}</Button>
              </form>
            )}
          </section>
        </Card>
      )}

      {isManager && <PrivacyTools customerId={c.id} displayName={c.displayName} isOwner={role === 'owner'} anonymised={gone} />}
    </div>
  );
}
