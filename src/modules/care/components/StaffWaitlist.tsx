'use client';
import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { bangkokDay, formatTime } from '@/lib/time';
import { uiErrorKey } from '@/lib/errors';
import { staffCancelWaitlist } from '../actions';
import type { WaitlistEntry } from '../schema';

export function StaffWaitlist({ rows }: { rows: WaitlistEntry[] }) {
  const t = useTranslations('care'); const te = useTranslations(); const locale = useLocale(); const router = useRouter();
  const [busy, transition] = useTransition(); const [error, setError] = useState('');
  return <div className="flex min-w-0 flex-col gap-4"><PageHeader title={t('waitlist')} actions={<Link className="underline" href="/customers">{t('backCustomers')}</Link>} />
    <p className="text-caption text-ink-muted">{t('staffWaitlistHelp')}</p>{error && <Alert tone="error">{error}</Alert>}
    {!rows.length && <Card>{t('noWaitlist')}</Card>}{rows.map((w) => <Card key={w.id} className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1"><strong>{w.customer_name} · {w.therapist_name}</strong><p>{locale === 'en' && w.service_name_en ? w.service_name_en : w.service_name_th}</p><p className="tnum text-caption">{bangkokDay(w.window_from)} {formatTime(w.window_from)}–{formatTime(w.window_to)} · {t(`waitlistStatus.${w.status}`)}</p>{w.offered_start && w.offer_expires_at && <p className="tnum text-caption">{t('offerTime')}: {formatTime(w.offered_start)} · {t('expires')}: {bangkokDay(w.offer_expires_at)} {formatTime(w.offer_expires_at)}</p>}</div>
      <Button variant="secondary" disabled={busy} onClick={() => { setError(''); transition(async () => { try { const r = await staffCancelWaitlist(w.id); if (!r.ok) { setError(te(uiErrorKey(r.code))); return; } router.refresh(); } catch { setError(te('common.failed')); } }); }}>{t('leaveWaitlist')}</Button>
    </Card>)}</div>;
}
