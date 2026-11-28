'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Icon } from '@/components/shell/Icon';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusChip } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTHB } from '@/lib/money';
import { bangkokDay, formatTime } from '@/lib/time';
import { addPrivateNote, saveCustomer } from '../actions';
import type { CustomerProfile as Profile } from '../schema';
import { PrivacyTools } from './PrivacyTools';
import { PreferencesForm } from '@/modules/care/components/PreferencesForm';
import type { Preferences } from '@/modules/care/schema';

type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
type HistoryFilter = 'all' | 'upcoming' | 'completed' | 'cancelled';
export type ProfileNames = { services: Record<string, string>; therapists: Record<string, string>; rooms: Record<string, string> };

const UPCOMING_STATUSES = new Set(['requested', 'confirmed', 'checked_in', 'in_treatment']);
const CANCELLED_STATUSES = new Set(['cancelled', 'no_show']);

export function CustomerProfile({
  customer: c,
  role,
  names,
  preferences = {},
  backQuery = {},
}: {
  customer: Profile;
  role: Role;
  names: ProfileNames;
  preferences?: Preferences;
  backQuery?: Record<string, string>;
}) {
  const t = useTranslations('customers');
  const tp = useTranslations('payments');
  const tb = useTranslations('booking');
  const design = useTranslations('workspaceDesign');
  const te = useTranslations();
  const router = useRouter();
  const gone = c.anonymisedAt !== null;
  const isManager = role === 'owner' || role === 'manager';

  const initialForm = {
    displayName: c.displayName,
    fullName: c.fullName ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    preferredTherapistId: c.preferredTherapistId ?? '',
    serviceNotes: c.serviceNotes ?? '',
    commsConsent: c.commsConsent,
  };
  const [f, setF] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteNotice, setNoteNotice] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  const dirty =
    f.displayName !== initialForm.displayName ||
    f.fullName !== initialForm.fullName ||
    f.phone !== initialForm.phone ||
    f.email !== initialForm.email ||
    f.preferredTherapistId !== initialForm.preferredTherapistId ||
    f.serviceNotes !== initialForm.serviceNotes ||
    f.commsConsent !== initialForm.commsConsent;

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
    setNoteBusy(true); setError(null); setNoteNotice(null);
    const r = await addPrivateNote({ customerId: c.id, body: note });
    setNoteBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setNote('');
    setNoteNotice(t('noteSaved'));
    router.refresh();
  }

  const backHref = Object.keys(backQuery).length ? { pathname: '/customers', query: backQuery } : '/customers';
  const preferredTherapistName = c.preferredTherapistId ? names.therapists[c.preferredTherapistId] : null;
  const topServiceName = c.summary.topServiceId ? names.services[c.summary.topServiceId] : null;

  const filterCounts = {
    all: c.history.length,
    upcoming: c.history.filter((h) => UPCOMING_STATUSES.has(h.status)).length,
    completed: c.history.filter((h) => h.status === 'completed').length,
    cancelled: c.history.filter((h) => CANCELLED_STATUSES.has(h.status)).length,
  };
  const filteredHistory = c.history.filter((h) => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'upcoming') return UPCOMING_STATUSES.has(h.status);
    if (historyFilter === 'completed') return h.status === 'completed';
    return CANCELLED_STATUSES.has(h.status);
  });

  const metrics = [
    { id: 'visits', label: t('visits'), value: c.summary.visits, icon: 'today' as const, highlight: false },
    { id: 'upcoming', label: t('upcoming'), value: c.summary.upcoming, icon: 'schedule' as const, highlight: c.summary.upcoming > 0 },
    { id: 'cancelled', label: t('cancelled'), value: c.summary.cancelled, icon: 'close' as const, highlight: false },
    { id: 'no-shows', label: t('noShows'), value: c.summary.noShows, icon: 'bell' as const, highlight: false },
  ];

  const historyTabs: { id: HistoryFilter; label: string; count: number }[] = [
    { id: 'all', label: design('allBookings'), count: filterCounts.all },
    { id: 'upcoming', label: t('upcoming'), count: filterCounts.upcoming },
    { id: 'completed', label: design('completed'), count: filterCounts.completed },
    { id: 'cancelled', label: t('cancelled'), count: filterCounts.cancelled },
  ];

  return (
    <div className="customer-profile">
      <nav className="customer-profile-nav" aria-label={t('title')}>
        <Link href={backHref} className="customer-back-link">
          <span aria-hidden="true">←</span>
          <span>{t('backToDirectory')}</span>
        </Link>
        {!gone && (
          <Link href="/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Icon name="schedule" />
            <span>{design('openSchedule')}</span>
          </Link>
        )}
      </nav>

      <header className="customer-profile-hero">
        <div className="customer-hero-main">
          <span className="customer-hero-avatar" aria-hidden="true">
            <Avatar name={c.displayName} className="customer-hero-avatar-inner" />
          </span>
          <div className="customer-hero-identity">
            <div className="customer-hero-title-row">
              <h1 data-testid="customer-name">{c.displayName}</h1>
              {gone && <Badge data-testid="anonymised-badge" className="customer-hero-removed">{t('removed')}</Badge>}
            </div>
            {!gone && c.fullName && c.fullName !== c.displayName && (
              <p className="customer-hero-fullname">{c.fullName}</p>
            )}
            {!gone && (
              <div className="customer-hero-meta">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="customer-hero-chip tnum">
                    {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="customer-hero-chip">
                    {c.email}
                  </a>
                )}
                {preferredTherapistName && (
                  <span className="customer-hero-chip">
                    <Icon name="therapists" />
                    <span>{preferredTherapistName}</span>
                  </span>
                )}
                <span className="customer-hero-chip" data-consent={c.commsConsent}>
                  {c.commsConsent ? t('consentOptedIn') : t('consentOptedOut')}
                </span>
              </div>
            )}
          </div>
        </div>

        {!gone && (topServiceName || c.summary.lastVisit) && (
          <dl className="customer-hero-highlights">
            {topServiceName && (
              <div>
                <dt>{t('topService')}</dt>
                <dd>{topServiceName}</dd>
              </div>
            )}
            {c.summary.lastVisit && (
              <div>
                <dt>{t('lastVisit')}</dt>
                <dd className="tnum">{bangkokDay(c.summary.lastVisit)}</dd>
              </div>
            )}
          </dl>
        )}
      </header>

      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      <section className="customer-summary-band" aria-label={t('summary')}>
        <div className="customer-metrics">
          {metrics.map((m) => (
            <article className="workspace-surface customer-metric" data-highlight={m.highlight} key={m.id}>
              <div className="customer-metric-head">
                <span className="customer-metric-label">{m.label}</span>
                <span className="customer-metric-icon" aria-hidden="true"><Icon name={m.icon} /></span>
              </div>
              <strong className="tnum customer-metric-value" data-testid={`stat-${m.id}`}>{m.value}</strong>
            </article>
          ))}
        </div>

        <dl className="workspace-surface customer-cadence">
          <div>
            <dt>{t('firstVisit')}</dt>
            <dd className="tnum">{c.summary.firstVisit ? bangkokDay(c.summary.firstVisit) : '—'}</dd>
          </div>
          <div>
            <dt>{t('lastVisit')}</dt>
            <dd className="tnum">{c.summary.lastVisit ? bangkokDay(c.summary.lastVisit) : '—'}</dd>
          </div>
          <div>
            <dt>{t('avgDays')}</dt>
            <dd className="tnum">{c.summary.avgDaysBetween !== null ? t('avgDaysValue', { days: c.summary.avgDaysBetween }) : '—'}</dd>
          </div>
          <div>
            <dt>{t('topService')}</dt>
            <dd>{topServiceName ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <div className="customer-profile-layout">
        <div className="customer-profile-main">
          <section className="workspace-surface customer-panel" aria-label={t('history')}>
            <header className="customer-panel-head">
              <div className="customer-panel-title-group">
                <h2 className="workspace-section-title">{t('history')}</h2>
                <span className="customer-count-pill tnum">{c.history.length}</span>
              </div>
              {c.history.length > 0 && (
                <div className="workspace-segmented customer-history-filters" role="group" aria-label={t('history')}>
                  {historyTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={historyFilter === tab.id}
                      onClick={() => setHistoryFilter(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <span className="customer-filter-count tnum">{tab.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </header>

            {c.history.length === 0 ? (
              <EmptyState>{te('common.empty')}</EmptyState>
            ) : filteredHistory.length === 0 ? (
              <EmptyState>{design('noMatches')}</EmptyState>
            ) : (
              <ul className="customer-history-list">
                {filteredHistory.map((h) => (
                  <li key={h.bookingId} data-testid="history-row" data-status={h.status} className="customer-history-row">
                    <div className="customer-history-when">
                      <strong className="tnum">{bangkokDay(h.startsAt)}</strong>
                      <span className="tnum">{formatTime(h.startsAt)}–{formatTime(h.endsAt)}</span>
                    </div>
                    <div className="customer-history-detail">
                      <strong className="customer-history-service">{names.services[h.serviceId] ?? '—'}</strong>
                      <span className="customer-history-sub">
                        {names.therapists[h.therapistId] ?? '—'} · {names.rooms[h.roomId] ?? '—'}
                      </span>
                      {h.note && <p className="customer-history-note">{h.note}</p>}
                    </div>
                    <div className="customer-history-status">
                      <StatusChip kind="booking" status={h.status} label={tb(`status.${h.status}`)} />
                      {h.money && (
                        <div className="customer-history-payment">
                          <Badge data-testid="payment-status" data-status={h.money.paymentStatus} className="customer-payment-badge">
                            {tp(`status.${h.money.paymentStatus}`)}
                          </Badge>
                          {h.money.chargeSatang > 0 && (
                            <span className="tnum customer-history-amount">{formatTHB(h.money.chargeSatang)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-surface customer-panel">
            <header className="customer-panel-head">
              <h2 className="workspace-section-title">{t('details')}</h2>
              {dirty && !gone && <Badge className="customer-dirty-badge">{t('unsavedChanges')}</Badge>}
            </header>
            <form onSubmit={save} className="customer-details-form" aria-label={t('details')}>
              <Field label={t('displayName')}>
                <Input data-testid="f-display-name" value={f.displayName} onChange={set('displayName')} disabled={gone} />
              </Field>
              <Field label={t('fullName')}>
                <Input value={f.fullName} onChange={set('fullName')} disabled={gone} />
              </Field>
              <Field label={t('phone')}>
                <Input data-testid="f-phone" value={f.phone} onChange={set('phone')} disabled={gone} inputMode="tel" />
              </Field>
              <Field label={t('email')}>
                <Input value={f.email} onChange={set('email')} disabled={gone} type="email" />
              </Field>
              <div className="customer-form-span">
                <Field label={t('preferredTherapist')}>
                  <Select value={f.preferredTherapistId} onChange={set('preferredTherapistId')} disabled={gone}>
                    <option value="">—</option>
                    {Object.entries(names.therapists).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="customer-form-span">
                <Field label={t('serviceNotes')}>
                  <Textarea data-testid="f-service-notes" value={f.serviceNotes} onChange={set('serviceNotes')} disabled={gone} rows={3} />
                </Field>
              </div>
              <div className="customer-consent-box customer-form-span">
                <label className="customer-consent-label">
                  <input type="checkbox" data-testid="consent" checked={f.commsConsent} onChange={set('commsConsent')} disabled={gone} className="customer-consent-checkbox" />
                  <span>{t('consent')}</span>
                </label>
                <span className="text-caption text-ink-muted">
                  {t('consentRecorded')}:{' '}
                  <span className="tnum" data-testid="consent-recorded">
                    {c.consentRecordedAt ? `${bangkokDay(c.consentRecordedAt)} ${formatTime(c.consentRecordedAt)}` : ''}
                  </span>
                </span>
              </div>
              {!gone && (
                <div className="customer-form-actions customer-form-span">
                  <Button type="submit" disabled={busy} data-testid="save-customer">{te('common.save')}</Button>
                  {dirty && (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => { setF(initialForm); setError(null); setNotice(null); }}>
                      {t('reset')}
                    </Button>
                  )}
                </div>
              )}
            </form>
          </section>

          {isManager && <PrivacyTools customerId={c.id} displayName={c.displayName} isOwner={role === 'owner'} anonymised={gone} />}
        </div>

        <aside className="customer-profile-side">
          <PreferencesForm key={c.id} customerId={c.id} initial={preferences} disabled={gone} />

          {isManager && (
            <section className="workspace-surface customer-panel" aria-label={t('privateNotes')}>
              <header className="customer-panel-head">
                <div className="customer-panel-title-group">
                  <h2 className="workspace-section-title">{t('privateNotes')}</h2>
                  <span className="customer-count-pill tnum">{c.privateNotes.length}</span>
                </div>
              </header>
              {!gone && (
                <form onSubmit={addNote} className="customer-note-composer">
                  <Field label={t('newNote')}>
                    <Input data-testid="note-body" value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <Button type="submit" variant="secondary" size="sm" disabled={noteBusy} data-testid="note-add">{t('addNote')}</Button>
                </form>
              )}
              {noteNotice && <Alert tone="info">{noteNotice}</Alert>}
              {c.privateNotes.length === 0 ? (
                <p className="text-caption text-ink-muted">{t('noPrivateNotes')}</p>
              ) : (
                <ul className="customer-notes-list">
                  {c.privateNotes.map((n) => (
                    <li key={n.id} data-testid="private-note" className="customer-note-item">
                      <time className="tnum customer-note-date">{bangkokDay(n.createdAt)}</time>
                      <p className="customer-note-body">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
