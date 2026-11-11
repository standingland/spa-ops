'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { savePaymentMethod, setPaymentMethodActive, type MethodRow } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

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
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    setCode(''); setNameTh('');
    router.refresh();
  }
  async function toggle(m: MethodRow) {
    setError(null);
    const r = await setPaymentMethodActive(m.id, !m.active);
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    router.refresh();
  }
  async function rename(m: MethodRow, name: string) {
    if (!name.trim() || name === m.nameTh) return;
    setError(null);
    const r = await savePaymentMethod({ id: m.id, code: m.code, nameTh: name, nameEn: m.nameEn ?? undefined, needsVerification: m.needsVerification });
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('methods')}>
      <h2 className="text-lg">{t('methods')}</h2>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}
      <ul className="flex flex-col gap-2">
        {methods.map((m) => (
          <li key={m.id} data-testid="method-row" data-code={m.code} className="flex flex-wrap items-center gap-3 rounded border border-stone bg-white p-3 text-sm">
            <code className="text-xs text-stone-dark">{m.code}</code>
            <input aria-label={t('methodName')} defaultValue={locale === 'en' && m.nameEn ? m.nameEn : m.nameTh} disabled={locale === 'en' && !!m.nameEn}
              onBlur={(e) => rename(m, e.target.value)} className={field} />
            {m.needsVerification && <span className="rounded bg-ivory px-2 py-0.5 text-xs">{t('needsVerification')}</span>}
            <button onClick={() => toggle(m)} data-testid="method-toggle" className="ml-auto rounded border border-charcoal px-3 py-1">{m.active ? t('deactivate') : t('activate')}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded border border-stone p-3">
        <label className="flex flex-col text-sm">{t('methodCode')}
          <input data-testid="method-code" value={code} onChange={(e) => setCode(e.target.value)} className={field} placeholder="store_credit" /></label>
        <label className="flex flex-col text-sm">{t('methodName')}
          <input data-testid="method-name" value={nameTh} onChange={(e) => setNameTh(e.target.value)} className={field} /></label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={needs} onChange={(e) => setNeeds(e.target.checked)} className="h-4 w-4" />{t('needsVerification')}</label>
        <button type="submit" data-testid="method-add" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('addMethod')}</button>
      </form>
    </section>
  );
}
