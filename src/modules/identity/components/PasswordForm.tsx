'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { changeMyPassword } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1.5 text-sm';

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
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3 rounded border border-stone bg-white p-4" aria-label={t('changePassword')}>
      <h2 className="text-lg">{t('changePassword')}</h2>
      <label className="flex flex-col text-sm">{t('current')}
        <input type="password" autoComplete="current-password" data-testid="pw-current" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} /></label>
      <label className="flex flex-col text-sm">{t('next')}
        <input type="password" autoComplete="new-password" data-testid="pw-next" value={next} onChange={(e) => setNext(e.target.value)} className={field} /></label>
      <p className="text-xs text-stone-dark">{t('hint')}</p>
      {error && <p role="alert" className="rounded border border-clay px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
      {notice && <p role="status" data-testid="pw-changed" className="rounded border border-sage px-3 py-2 text-sm">{notice}</p>}
      <div><button type="submit" disabled={busy} data-testid="pw-submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('change')}</button></div>
    </form>
  );
}
