'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action';
import { uiErrorKey } from '@/lib/errors';
import { createClient } from '@/lib/supabase/browser';
import { recordClock } from '../actions';
import type { ClockSnapshot, ClockStatus } from '../model';

export function ClockPanel({ snapshot, code, initialAttempt }: { snapshot: ClockSnapshot; code: string | null; initialAttempt: string }) {
  const t = useTranslations('staffClock');
  const messages = useTranslations();
  const roles = useTranslations('staff.roles');
  const locale = useLocale();
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>();
  const [attempt] = useState(initialAttempt);
  const [liveCoworkers, setLiveCoworkers] = useState<ClockSnapshot['coworkers']>();
  const [busy, startTransition] = useTransition();
  const { attendance } = snapshot;
  const coworkers = liveCoworkers ?? snapshot.coworkers;
  const action = attendance && !attendance.ended_at ? 'out' : 'in';
  const status: ClockStatus = attendance ? (attendance.ended_at ? 'finished' : 'working') : 'waiting';
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let refreshing = false;
    async function refreshVisible() {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      try {
        const { data, error } = await supabase.rpc('read_staff_clock');
        if (active && !error && data) setLiveCoworkers((data as ClockSnapshot).coworkers);
      } finally {
        refreshing = false;
      }
    }
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, []);

  function confirm() {
    if (!code) return;
    startTransition(async () => {
      const saved = await recordClock(code, action, attempt);
      setResult(saved);
      if (saved.ok) router.replace('/staff/clock');
    });
  }

  return (
    <>
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t('you')}</h2>
          <Badge className={status === 'working' ? 'bg-tint-available' : undefined}>{t(`status.${status}`)}</Badge>
        </div>
        {attendance && (
          <dl className="grid gap-3 text-body sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{t('started')}</dt>
              <dd><time dateTime={attendance.started_at}>{dateTime.format(new Date(attendance.started_at))}</time></dd>
            </div>
            {attendance.ended_at && (
              <div>
                <dt className="text-ink-muted">{t('ended')}</dt>
                <dd><time dateTime={attendance.ended_at}>{dateTime.format(new Date(attendance.ended_at))}</time></dd>
              </div>
            )}
          </dl>
        )}
        {code ? (
          <Button type="button" className="w-fit" disabled={busy || result?.ok === true} onClick={confirm}>
            {t(`action.${action}`)}
          </Button>
        ) : <p className="text-body text-ink-muted">{t('scan')}</p>}
        {result && (result.ok ? <Alert>{t('saved')}</Alert> : (
          <Alert tone="error">{result.code === 'CLOCK_CODE_EXPIRED' ? t('expired') : messages(uiErrorKey(result.code))}</Alert>
        ))}
      </Card>
      <section className="grid gap-2" aria-labelledby="clock-coworkers">
        <h2 id="clock-coworkers" className="font-semibold">{t('coworkers')}</h2>
        {coworkers.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {coworkers.map((person) => (
              <li key={person.user_id}>
                <Card className="flex h-full flex-wrap items-center gap-3">
                  <span aria-hidden="true"><Avatar name={person.display_name} size="sm" /></span>
                  <div className="min-w-0 flex-1">
                    <strong className="break-words">{person.display_name}</strong>
                    <p className="text-caption text-ink-muted">{roles(person.role)}</p>
                  </div>
                  <Badge className={person.state === 'working' ? 'bg-tint-available' : undefined}>{t(`status.${person.state}`)}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        ) : <p className="text-body text-ink-muted">{t('empty')}</p>}
      </section>
    </>
  );
}
