'use client';
import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { bangkokDay, formatTime } from '@/lib/time';
import { uiErrorKey } from '@/lib/errors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { acceptWaitlist, cancelWaitlist } from '../actions';
import type { MyAppointments as Data, Appointment } from '../schema';

export function MyAppointments({ data, page }: { data: Data; page: number }) {
  const t = useTranslations('care'); const tb = useTranslations('booking'); const te = useTranslations(); const locale = useLocale(); const router = useRouter();
  const [busy, transition] = useTransition(); const [error, setError] = useState('');
  const label = (s: { service_name_th: string; service_name_en: string | null }) => locale === 'en' && s.service_name_en ? s.service_name_en : s.service_name_th;
  function act(id: string, accept: boolean) {
    setError(''); transition(async () => { try {
      if (accept) { const r = await acceptWaitlist(id); if (!r.ok) { setError(te.has(`public.errors.${r.code}`) ? te(`public.errors.${r.code}`) : te(uiErrorKey(r.code))); router.refresh(); return; } router.push(`/book/done?token=${encodeURIComponent(r.cancelToken)}`); }
      else { const r = await cancelWaitlist(id); if (!r.ok) { setError(te(uiErrorKey(r.code))); return; } router.refresh(); }
    } catch { setError(te('common.failed')); } });
  }
  const appointment = (b: Appointment) => <Card key={b.id} className="flex flex-col gap-3" data-testid="my-appointment">
    <p className="tnum text-heading">{bangkokDay(b.starts_at)} · {formatTime(b.starts_at)}–{formatTime(b.ends_at)}</p>
    <p className="break-words">{label(b)} · {b.therapist_name}</p><p className="text-caption text-ink-muted">{tb(`status.${b.status}`)}</p>
    <div className="flex flex-wrap gap-4 text-body">
      {b.cancelToken && <Link className="inline-flex min-h-11 items-center underline" href={`/book/cancel?token=${encodeURIComponent(b.cancelToken)}`}>{t('manage')}</Link>}
      {b.repeatable && <Link className="inline-flex min-h-11 items-center underline" href={`/book/${b.therapist_id}?serviceId=${b.service_id}`}>{t('bookAgain')}</Link>}
    </div>
  </Card>;
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <h1 className="font-serif text-title">{t('myAppointments')}</h1><p className="text-caption text-ink-muted">{t('timezone')}</p>
    {error && <Alert tone="error">{error}</Alert>}
    <section className="flex flex-col gap-3"><h2 className="font-serif text-heading">{t('upcoming')}</h2>{data.upcoming.length ? data.upcoming.map(appointment) : <Card>{t('noUpcoming')}</Card>}</section>
    <section className="flex flex-col gap-3"><h2 className="font-serif text-heading">{t('waitlist')}</h2>{data.waitlist.length ? data.waitlist.map((w) => <Card key={w.id} className="flex flex-col gap-3" data-testid="my-waitlist">
      <strong>{label(w)} · {w.therapist_name}</strong><p className="tnum">{bangkokDay(w.window_from)} · {formatTime(w.window_from)}–{formatTime(w.window_to)}</p>
      <p>{t(`waitlistStatus.${w.status}`)}</p>
      {w.status === 'offered' && w.offered_start && w.offer_expires_at && <p className="tnum">{t('offerTime')}: {formatTime(w.offered_start)} · {t('expires')}: {bangkokDay(w.offer_expires_at)} {formatTime(w.offer_expires_at)}</p>}
      <div className="flex flex-wrap gap-3">{w.status === 'offered' && <Button disabled={busy} onClick={() => act(w.id, true)}>{t('accept')}</Button>}<Button variant="secondary" disabled={busy} onClick={() => act(w.id, false)}>{t('leaveWaitlist')}</Button></div>
    </Card>) : <Card>{t('noWaitlist')}</Card>}</section>
    <section className="flex flex-col gap-3"><h2 className="font-serif text-heading">{t('history')}</h2>{data.history.length ? data.history.map(appointment) : <Card>{t('noHistory')}</Card>}
      <nav className="flex items-center gap-4" aria-label={t('historyPages')}>{page > 0 && <Link className="min-h-11 py-3 underline" href={`/book/mine?page=${page - 1}`}>{t('previous')}</Link>}<span>{page + 1} / {Math.max(1, Math.ceil(data.history_count / 20))}</span>{(page + 1) * 20 < data.history_count && <Link className="min-h-11 py-3 underline" href={`/book/mine?page=${page + 1}`}>{t('next')}</Link>}</nav>
    </section>
  </div>;
}
