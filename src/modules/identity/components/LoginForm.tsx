'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/browser';
import { queueDailyNotesPopup } from '@/modules/daily-notes/loginPopup';

export function LoginForm({ clockCode }: { clockCode?: string }) {
  const t = useTranslations('login');
  const router = useRouter();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(false);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: String(f.get('email')), password: String(f.get('password')),
    });
    if (err) { setBusy(false); setError(true); return; }
    const { data: staff } = await supabase.from('staff').select('role').eq('user_id', data.user.id).maybeSingle();
    queueDailyNotesPopup(data.user.id);
    setBusy(false);
    router.replace(clockCode ? { pathname: '/staff/clock', query: { code: clockCode } }
      : staff?.role === 'receptionist' ? '/admin' : '/staff');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl text-ink">{t('title')}</h1>
      <Field label={t('email')}>
        <Input name="email" type="email" required autoComplete="username" data-testid="login-email" />
      </Field>
      <Field label={t('password')}>
        <Input name="password" type="password" required autoComplete="current-password" data-testid="login-password" />
      </Field>
      {error && <Alert tone="error" data-testid="login-error">{t('failed')}</Alert>}
      <Button type="submit" disabled={busy} data-testid="login-submit">{t('submit')}</Button>
    </form>
  );
}
