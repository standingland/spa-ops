'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/browser';

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
    const { error: err } = await createClient().auth.signInWithPassword({
      email: String(f.get('email')), password: String(f.get('password')),
    });
    setBusy(false);
    if (err) { setError(true); return; }
    router.replace(clockCode ? { pathname: '/staff/clock', query: { code: clockCode } } : '/staff');
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
