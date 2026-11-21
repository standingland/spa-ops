'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { APPLICATION_STATUSES, updateApplication, type ApplicationRow, type ApplicationStatus } from '../adminActions';

function ApplicationCard({ a, onError }: { a: ApplicationRow; onError: (message: string | null) => void }) {
  const t = useTranslations('applications');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ApplicationStatus>(a.status);
  const [note, setNote] = useState(a.correspondence ?? '');
  const [saved, setSaved] = useState<{ status: ApplicationStatus; note: string }>({ status: a.status, note: a.correspondence ?? '' });
  const [justSaved, setJustSaved] = useState(false);
  const dirty = status !== saved.status || note.trim() !== saved.note.trim();

  async function save(next: { status: ApplicationStatus; note: string }) {
    onError(null);
    setJustSaved(false);
    const r = await updateApplication(a.id, { status: next.status, correspondence: next.note });
    if (!r.ok) {
      onError(errorText(te(uiErrorKey(r.code)), r));
      return;
    }
    setSaved({ status: next.status, note: next.note.trim() });
    setJustSaved(true);
    start(() => router.refresh());
  }

  const received = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(a.createdAt));
  const facts: [string, string][] = [
    [t('age'), String(a.age)],
    [t('experience'), t(`experienceOptions.${a.experience}`)],
    [t('certificate'), a.hasCertificate ? t('yes') : t('no')],
    [t('work'), t(`workOptions.${a.workType}`)],
  ];

  return (
    <li className="min-w-0" data-testid="application-row" data-status={status}>
      <Card className="flex flex-col gap-3 p-4" aria-busy={pending}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="min-w-0 break-words font-serif text-lg text-ink">{a.fullName}</h2>
          <span className="min-w-0 break-all text-body text-ink">{a.contact}</span>
          <time className="ml-auto text-caption text-ink-muted" dateTime={a.createdAt}>{received}</time>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-caption text-ink-muted">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {a.skills && (
          <p className="break-words text-body"><span className="text-caption text-ink-muted">{t('skills')}: </span>{a.skills}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Field label={t('statusLabel')}>
            <Select value={status} data-testid="application-status"
              onChange={(e) => { const next = e.target.value as ApplicationStatus; setStatus(next); void save({ status: next, note }); }}>
              {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('note')}>
            <Textarea rows={2} value={note} placeholder={t('notePlaceholder')} maxLength={4000} data-testid="application-note"
              onChange={(e) => { setNote(e.target.value); setJustSaved(false); }} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!dirty || pending} onClick={() => save({ status, note })} data-testid="application-save">{t('save')}</Button>
          <span role="status" className="text-caption text-ink-muted">{justSaved && !dirty ? t('saved') : ''}</span>
          <Badge className="ml-auto">{a.locale === 'th' ? 'ไทย' : 'EN'}</Badge>
        </div>
      </Card>
    </li>
  );
}

export function ApplicationsAdmin({ applications }: { applications: ApplicationRow[] }) {
  const t = useTranslations('applications');
  const [filter, setFilter] = useState<'all' | ApplicationStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const shown = filter === 'all' ? applications : applications.filter((a) => a.status === filter);
  const count = (s: ApplicationStatus) => applications.filter((a) => a.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')}
        actions={
          <Select aria-label={t('filter')} value={filter} className="w-auto min-w-0 max-w-full" data-testid="application-filter"
            onChange={(e) => setFilter(e.target.value as 'all' | ApplicationStatus)}>
            <option value="all">{t('all', { count: applications.length })}</option>
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)} ({count(s)})</option>)}
          </Select>
        } />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {shown.length === 0 ? (
        <EmptyState>{applications.length === 0 ? t('empty') : t('emptyFiltered')}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((a) => <ApplicationCard key={a.id} a={a} onError={setError} />)}
        </ul>
      )}
    </div>
  );
}
