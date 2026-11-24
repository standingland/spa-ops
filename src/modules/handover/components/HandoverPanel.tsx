'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { postHandover } from '../actions';
import { MAX_HANDOVER_LENGTH, type Handover } from '../schema';

/** End-of-shift summary: write one, and read the latest ones left by the previous shift. */
export function HandoverPanel({ items, className, headingClassName }: {
  items: Handover[] | null; className?: string; headingClassName?: string;
}) {
  const t = useTranslations('handover');
  const messages = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const result = await postHandover({ body });
      if (!result.ok) { setError(messages(uiErrorKey(result.code))); return; }
      setBody('');
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="staff-home-handover" className={className} data-testid="handover">
      <h2 id="staff-home-handover" className={headingClassName}>{t('title')}</h2>
      <form onSubmit={submit} className="grid gap-2">
        <Field label={t('label')}>
          <Textarea name="body" rows={3} value={body} maxLength={MAX_HANDOVER_LENGTH} required placeholder={t('placeholder')}
            onChange={(e) => setBody(e.target.value)} data-testid="handover-body" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={busy || !body.trim()} className="justify-self-start" data-testid="handover-submit">{t('submit')}</Button>
      </form>
      {!items ? <p role="status">{t('unavailable')}</p>
        : items.length === 0 ? <p>{t('empty')}</p>
          : (
            <ul className="mt-3 grid gap-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-line bg-surface p-3">
                  <p className="whitespace-pre-wrap break-words">{item.body}</p>
                  <small>{item.authorName} · <time dateTime={item.createdAt}>{when.format(new Date(item.createdAt))}</time></small>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}
