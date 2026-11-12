'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { errorText, uiErrorKey } from '@/lib/errors';
import { changeMyPassword } from '../actions';

export function PasswordForm() {
  const t = useTranslations('account');
  const te = useTranslations();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const r = await changeMyPassword({ current, next });
    setBusy(false);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setCurrent(''); setNext('');
    setNotice(t('changed'));
  }

  return (
    <Card className="max-w-md">
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('changePassword')}>
      <h2 className="font-serif text-heading text-ink">{t('changePassword')}</h2>
      <Field label={t('current')}>
        <Input type="password" autoComplete="current-password" data-testid="pw-current" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label={t('next')}>
        <Input type="password" autoComplete="new-password" data-testid="pw-next" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <p className="text-caption text-ink-muted">{t('hint')}</p>
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {notice && <Alert data-testid="pw-changed" className="break-words">{notice}</Alert>}
      <div><Button type="submit" disabled={busy} data-testid="pw-submit">{t('change')}</Button></div>
    </form>
    </Card>
  );
}
