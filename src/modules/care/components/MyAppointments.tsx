'use client';
import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { bangkokDay, formatTime } from '@/lib/time';
import { uiErrorKey } from '@/lib/errors';
import styles from './mine.module.css';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { acceptWaitlist, cancelWaitlist } from '../actions';
import type { MyAppointments as Data, Appointment } from '../schema';

export function MyAppointments({ data, page, name }: { data: Data; page: number; name: string }) {
  const t = useTranslations('care'); const tb = useTranslations('booking'); const te = useTranslations(); const locale = useLocale(); const router = useRouter();
  const [busy, transition] = useTransition(); const [error, setError] = useState('');
  const label = (s: { service_name_th: string; service_name_en: string | null }) => locale === 'en' && s.service_name_en ? s.service_name_en : s.service_name_th;
  function act(id: string, accept: boolean) {
    setError(''); transition(async () => { try {
      if (accept) { const r = await acceptWaitlist(id); if (!r.ok) { setError(te.has(`public.errors.${r.code}`) ? te(`public.errors.${r.code}`) : te(uiErrorKey(r.code))); router.refresh(); return; } router.push(`/book/done?token=${encodeURIComponent(r.cancelToken)}`); }
      else { const r = await cancelWaitlist(id); if (!r.ok) { setError(te(uiErrorKey(r.code))); return; } router.refresh(); }
    } catch { setError(te('common.failed')); } });
  }
  const appointment = (b: Appointment) => <article key={b.id} className={styles.item} data-testid="my-appointment">
    <p className={styles.date}>{bangkokDay(b.starts_at)} · {formatTime(b.starts_at)}–{formatTime(b.ends_at)}</p>
    <p className={styles.detail}>{label(b)} · {b.therapist_name}</p><p className={styles.status}>{tb(`status.${b.status}`)}</p>
    <div className={styles.actions}>
      {b.cancelToken && <Link href={`/book/cancel?token=${encodeURIComponent(b.cancelToken)}`}>{t('manage')}</Link>}
      {b.repeatable && <Link href={`/book/${b.therapist_id}?serviceId=${b.service_id}`}>{t('bookAgain')}</Link>}
    </div>
  </article>;
  return <div className={styles.page}>
    <div className={styles.hero}><div><h1>{t('profile')}</h1><p>{t('lineAccount')}: {name || t('guest')}</p></div><div className={styles.heroAside}>{t('timezone')}</div></div>
    <div className={styles.content}>
      <div className={styles.sections}>
        {error && <Alert tone="error">{error}</Alert>}
        <section className={styles.section}><h2>{t('upcoming')}</h2><div className={styles.items}>{data.upcoming.length ? data.upcoming.map(appointment) : <p className={styles.empty}>{t('noUpcoming')}</p>}</div></section>
        <section className={styles.section}><h2>{t('waitlist')}</h2><div className={styles.items}>{data.waitlist.length ? data.waitlist.map((w) => <article key={w.id} className={styles.item} data-testid="my-waitlist">
          <p className={styles.date}>{bangkokDay(w.window_from)} · {formatTime(w.window_from)}–{formatTime(w.window_to)}</p>
          <p className={styles.detail}>{label(w)} · {w.therapist_name}</p><p className={styles.status}>{t(`waitlistStatus.${w.status}`)}</p>
          {w.status === 'offered' && w.offered_start && w.offer_expires_at && <p className={styles.detail}>{t('offerTime')}: {formatTime(w.offered_start)} · {t('expires')}: {bangkokDay(w.offer_expires_at)} {formatTime(w.offer_expires_at)}</p>}
          <div className={styles.actions}>{w.status === 'offered' && <Button disabled={busy} onClick={() => act(w.id, true)}>{t('accept')}</Button>}<Button variant="secondary" disabled={busy} onClick={() => act(w.id, false)}>{t('leaveWaitlist')}</Button></div>
        </article>) : <p className={styles.empty}>{t('noWaitlist')}</p>}</div></section>
        <section className={styles.section}><h2>{t('history')}</h2><div className={styles.items}>{data.history.length ? data.history.map(appointment) : <p className={styles.empty}>{t('noHistory')}</p>}</div>
          <nav className={styles.pagination} aria-label={t('historyPages')}>{page > 0 && <Link href={`/book/mine?page=${page - 1}`}>{t('previous')}</Link>}<span>{page + 1} / {Math.max(1, Math.ceil(data.history_count / 20))}</span>{(page + 1) * 20 < data.history_count && <Link href={`/book/mine?page=${page + 1}`}>{t('next')}</Link>}</nav>
        </section>
      </div>
      <aside className={styles.aside}><h2>{t('myAppointments')}</h2><p>{t('timezone')}</p><Link className={styles.cta} href="/book">{t('newBooking')}</Link></aside>
    </div>
  </div>;
}

