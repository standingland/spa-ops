'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { savePaymentMethod, setPaymentMethodActive, type MethodRow } from '../actions';


/** Owner: add, rename or deactivate payment methods. Nothing is deleted, so old payments keep their method. */
export function MethodsAdmin({ methods }: { methods: MethodRow[] }) {
  const t = useTranslations('reconciliation');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [needs, setNeeds] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await savePaymentMethod({ code, nameTh, needsVerification: needs });
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    setCode(''); setNameTh('');
    router.refresh();
  }
  async function toggle(m: MethodRow) {
    setError(null);
    const r = await setPaymentMethodActive(m.id, !m.active);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }
  async function rename(m: MethodRow, name: string) {
    if (!name.trim() || name === m.nameTh) return;
    setError(null);
    const r = await savePaymentMethod({ id: m.id, code: m.code, nameTh: name, nameEn: m.nameEn ?? undefined, needsVerification: m.needsVerification });
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t('methods')}>
      <h2 className="font-serif text-heading text-ink">{t('methods')}</h2>
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      <ul className="flex flex-col gap-2">
        {methods.map((m) => (
          <li key={m.id} data-testid="method-row" data-code={m.code} className="min-w-0">
            <Card className="flex flex-wrap items-center gap-3 p-3 text-body">
              <code className="break-all text-caption text-ink-muted">{m.code}</code>
              <Input aria-label={t('methodName')} defaultValue={locale === 'en' && m.nameEn ? m.nameEn : m.nameTh} disabled={locale === 'en' && !!m.nameEn}
                onBlur={(e) => rename(m, e.target.value)} className="w-auto min-w-0 max-w-full" />
              {m.needsVerification && <Badge>{t('needsVerification')}</Badge>}
              <Button variant="secondary" size="sm" className="ml-auto" onClick={() => toggle(m)} data-testid="method-toggle">{m.active ? t('deactivate') : t('activate')}</Button>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <Field label={t('methodCode')}>
            <Input data-testid="method-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="store_credit" />
          </Field>
          <Field label={t('methodName')}>
            <Input data-testid="method-name" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-body text-ink">
            <input type="checkbox" checked={needs} onChange={(e) => setNeeds(e.target.checked)} className="size-5 accent-primary" />{t('needsVerification')}</label>
          <Button type="submit" data-testid="method-add">{t('addMethod')}</Button>
        </form>
      </Card>
    </section>
  );
}
