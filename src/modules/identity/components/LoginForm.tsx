'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/browser';

export function LoginForm() {
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
    router.replace('/calendar');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-stone bg-white p-6">
      <h1 className="text-2xl">{t('title')}</h1>
      <label className="flex flex-col gap-1 text-sm">{t('email')}
        <input name="email" type="email" required autoComplete="username" data-testid="login-email"
          className="rounded border border-stone-dark px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">{t('password')}
        <input name="password" type="password" required autoComplete="current-password" data-testid="login-password"
          className="rounded border border-stone-dark px-3 py-2" />
      </label>
      {error && <p role="alert" data-testid="login-error" className="text-sm text-clay">{t('failed')}</p>}
      <button type="submit" disabled={busy} data-testid="login-submit"
        className="rounded bg-charcoal px-4 py-2 text-ivory disabled:opacity-60">{t('submit')}</button>
    </form>
  );
}
