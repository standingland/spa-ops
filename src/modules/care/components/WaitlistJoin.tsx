'use client';
import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Field, Select } from '@/components/ui/field';
import { Button, buttonVariants } from '@/components/ui/button';
import { uiErrorKey } from '@/lib/errors';
import { joinWaitlist } from '../actions';

export function WaitlistJoin({ therapistId, serviceId, day, signedIn, singlePage = false }: { therapistId: string; serviceId: string; day: string; signedIn: boolean; singlePage?: boolean }) {
  const t = useTranslations('care'); const te = useTranslations(); const locale = useLocale();
  const [busy, transition] = useTransition(); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const [from, setFrom] = useState('10:00'); const [to, setTo] = useState('20:00');
  const [consent, setConsent] = useState(false);
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const login = `/api/line/login?${new URLSearchParams({ returnTo: singlePage ? `/${locale}/book` : `/${locale}/book/${therapistId}`, ...(singlePage ? { therapistId } : {}), serviceId, day })}`;
  return <section className="flex flex-col gap-3 rounded-2xl border border-line p-4" aria-label={t('waitlist')}>
    <h3 className="font-serif text-heading">{t('waitlist')}</h3><p className="text-caption text-ink-muted">{t('joinHelp')}</p>
    {saved ? <p role="status">{t('joined')} <Link href="/book/mine" className="underline">{t('myAppointments')}</Link></p> : <>
      <div className="grid grid-cols-2 gap-3"><Field label={t('windowFrom')}><Select value={from} onChange={(e) => setFrom(e.target.value)}>{times.map((v) => <option key={v}>{v}</option>)}</Select></Field><Field label={t('windowTo')}><Select value={to} onChange={(e) => setTo(e.target.value)}>{times.map((v) => <option key={v}>{v}</option>)}</Select></Field></div>
      {error && <Alert tone="error">{error}</Alert>}
      {signedIn && <label className="flex items-start gap-3 text-caption"><input className="mt-1 size-5 shrink-0" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t('waitlistConsent')}</label>}
      {signedIn ? <Button variant="secondary" disabled={busy || to < from || !consent} onClick={() => {
        setError(''); transition(async () => { try {
          const r = await joinWaitlist({ therapistId, serviceId, from: `${day}T${from}:00+07:00`, to: `${day}T${to}:00+07:00`, notifyConsent: true });
          if (!r.ok) { setError(te.has(`public.errors.${r.code}`) ? te(`public.errors.${r.code}`) : te(uiErrorKey(r.code))); return; } setSaved(true);
        } catch { setError(te('common.failed')); } });
      }}>{t('join')}</Button> : <a className={buttonVariants({ variant: 'secondary' })} href={login}>{t('signIn')}</a>}
    </>}
  </section>;
}
