'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Icon } from '@/components/shell/Icon';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Input, Select } from '@/components/ui/field';
import { bangkokDay, formatTime } from '@/lib/time';
import { uiErrorKey } from '@/lib/errors';
import { staffCancelWaitlist } from '../actions';
import type { WaitlistEntry } from '../schema';

type View = 'waiting' | 'offered' | 'closed';
const statusGroup = (row: WaitlistEntry): View =>
  row.status === 'waiting' || row.status === 'offered' ? row.status : 'closed';

export function StaffWaitlist({ rows, counts }: { rows: WaitlistEntry[]; counts: Record<View, number> }) {
  const t = useTranslations('care');
  const b = useTranslations('booking');
  const design = useTranslations('workspaceDesign');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [busy, transition] = useTransition();
  const [error, setError] = useState('');
  const [view, setView] = useState<View>(!counts.waiting && counts.offered ? 'offered' : 'waiting');
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [therapistFilter, setTherapistFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');

  const service = (row: WaitlistEntry) => (locale === 'en' && row.service_name_en) || row.service_name_th;
  const offered = rows.filter((row) => row.status === 'offered');
  const current = rows.filter((row) => statusGroup(row) === view);
  const serviceOptions = [...new Set(current.map(service).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale));
  const therapistOptions = [...new Set(current.map((row) => row.therapist_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale));
  const term = search.trim().toLocaleLowerCase(locale);
  const shown = current.filter((row) =>
    (!term || [row.customer_name ?? '', row.therapist_name, service(row)].some((value) => value.toLocaleLowerCase(locale).includes(term)))
    && (!serviceFilter || service(row) === serviceFilter)
    && (!therapistFilter || row.therapist_name === therapistFilter)
    && (!dayFilter || (dayFilter >= bangkokDay(row.window_from) && dayFilter <= bangkokDay(row.window_to))));
  const states = [
    ['waiting', t('waitlistStatus.waiting'), counts.waiting],
    ['offered', t('waitlistStatus.offered'), counts.offered],
    ['closed', design('closedWaitlist'), counts.closed],
  ] as const;
  const active = counts.waiting + counts.offered;
  const count = active + counts.closed;
  const waitingStop = count ? counts.waiting / count * 100 : 0;
  const offeredStop = count ? active / count * 100 : 0;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

  function cancel(id: string) {
    setError('');
    transition(async () => {
      try {
        const result = await staffCancelWaitlist(id);
        if (!result.ok) { setError(te(uiErrorKey(result.code))); return; }
        router.refresh();
      } catch {
        setError(te('common.failed'));
      }
    });
  }

  return (
    <div className="waitlist-board">
      <WorkspaceHero title={t('waitlist')} description={design('waitlistDesc')} icon="waitlist"
        actions={<Link href="/customers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('backCustomers')}</Link>} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="waitlist-grid">
        <section className="waitlist-list" aria-label={t('waitlist')}>
          <div className="workspace-segmented waitlist-views">
            {states.map(([id, label, total]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => {
                setView(id); setServiceFilter(''); setTherapistFilter(''); setDayFilter('');
              }}>
                <Icon name={id === 'waiting' ? 'schedule' : id === 'offered' ? 'waitlist' : 'checklist'} />
                {label} <strong>{total}</strong>
              </button>
            ))}
          </div>
          <div className="workspace-surface workspace-toolbar waitlist-filters">
            <Input type="date" aria-label={design('requestedWindow')} value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} />
            <Select aria-label={b('service')} value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
              <option value="">{te('common.all')} · {b('service')}</option>
              {serviceOptions.map((label) => <option key={label}>{label}</option>)}
            </Select>
            <Select aria-label={b('therapist')} value={therapistFilter} onChange={(event) => setTherapistFilter(event.target.value)}>
              <option value="">{design('therapistFilter')}</option>
              {therapistOptions.map((label) => <option key={label}>{label}</option>)}
            </Select>
            <Input type="search" aria-label={te('common.search')} placeholder={te('common.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="workspace-surface">
            {counts[view] > current.length && <p className="overview-empty">{view === 'closed' ? design('closedLimit') : design('activeLimit')}</p>}
            <div className="workspace-scroll waitlist-table-wrap" role="region" tabIndex={0} aria-label={t('waitlist')}>
              <table className="workspace-table waitlist-table">
                <thead><tr>
                  <th scope="col">{b('customer')}</th><th scope="col">{b('service')}</th><th scope="col">{design('requestedWindow')}</th>
                  <th scope="col">{b('therapist')}</th><th scope="col">{design('status')}</th>
                  {view !== 'closed' && <th scope="col"><span className="sr-only">{t('leaveWaitlist')}</span></th>}
                </tr></thead>
                <tbody>{shown.map((row) => (
                  <tr key={row.id}>
                    <td data-label={b('customer')}><span className="waitlist-guest"><Avatar name={row.customer_name || '—'} size="sm" /><strong>{row.customer_name || '—'}</strong></span></td>
                    <td data-label={b('service')}>{service(row) || '—'}</td>
                    <td className="tnum" data-label={design('requestedWindow')}><small>{date.formatRange(new Date(row.window_from), new Date(row.window_to))}</small>{formatTime(row.window_from)}–{formatTime(row.window_to)}</td>
                    <td data-label={b('therapist')}>{row.therapist_name || '—'}</td>
                    <td data-label={design('status')}><span className="waitlist-chip" data-state={statusGroup(row)}>{t(`waitlistStatus.${row.status}`)}</span></td>
                    {view !== 'closed' && <td className="workspace-entry-actions"><Button size="sm" variant="link" aria-label={t('leaveWaitlist')} disabled={busy} onClick={() => cancel(row.id)}>{te('common.cancel')}</Button></td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!shown.length && <p className="overview-empty">{!active && view !== 'closed' ? t('noWaitlist') : design('noMatches')}</p>}
          </div>
        </section>
        <aside className="waitlist-side">
          <section className="workspace-surface overview-chart">
            <h2 className="workspace-section-title">{design('waitlistSummary')}</h2>
            <div className="waitlist-mix">
              <div className="overview-ring" style={count ? { background: `conic-gradient(#36543c 0 ${waitingStop}%, #87976a ${waitingStop}% ${offeredStop}%, #d0d7bc ${offeredStop}% 100%)` } : undefined}>
                <span>{count}<small>{design('allRequests')}</small></span>
              </div>
              <ul>{states.map(([id, label, total]) => <li key={id}><i data-state={id} /><span>{label}</span><strong>{total}</strong></li>)}</ul>
            </div>
          </section>
          <section className="workspace-surface overview-chart">
            <h2 className="workspace-section-title">{design('offeredAt')}</h2>
            {!offered.length && <p className="text-caption text-ink-muted">{t('staffWaitlistHelp')}</p>}
            <ul className="waitlist-offers">{offered.filter((row) => row.offered_start).slice(0, 6).map((row) => (
              <li key={row.id}><Icon name="today" /><div><strong>{date.format(new Date(row.offered_start!))} {formatTime(row.offered_start!)}</strong><small>{service(row)} · {row.therapist_name}</small>
                {row.offer_expires_at && <small>{t('expires')} {date.format(new Date(row.offer_expires_at))} {formatTime(row.offer_expires_at)}</small>}</div></li>
            ))}</ul>
            <Link href="/calendar?view=timeline" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{design('openSchedule')} <Icon name="chevron" /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
