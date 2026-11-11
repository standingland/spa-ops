'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomer, searchCustomers, type CustomerHit } from '../actions';
import { uiErrorKey } from '@/lib/errors';
import { Link } from '@/i18n/navigation';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export function CustomerPicker({ selected, onSelect }: { selected: CustomerHit | null; onSelect: (c: CustomerHit | null) => void }) {
  const t = useTranslations('booking');
  const te = useTranslations();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) return;
    let live = true;
    const id = setTimeout(async () => {
      const r = await searchCustomers(q);
      if (live && r.ok) setHits(r.customers);
    }, 200);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('customer')}</legend>
      {selected ? (
        <p data-testid="customer-selected" className="flex items-center gap-3 text-sm">
          <span>{t('selected')}: <strong>{selected.displayName}</strong>{selected.phone ? ` · ${selected.phone}` : ''}</span>
          <button type="button" className="underline" onClick={() => onSelect(null)}>×</button>
        </p>
      ) : (
        <>
          <input aria-label={t('searchCustomer')} placeholder={t('searchCustomer')} value={q} onChange={(e) => setQ(e.target.value)} className={field} data-testid="customer-search" />
          {q.trim() && (
            <ul className="flex flex-col gap-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" data-testid="customer-option" className="underline" onClick={() => onSelect(h)}>{h.displayName}{h.phone ? ` · ${h.phone}` : ''}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2 rounded border border-stone p-2">
            <span className="w-full text-xs text-stone-dark">{t('newCustomer')}</span>
            <label className="flex flex-col text-sm">{t('customerName')}<input value={name} onChange={(e) => setName(e.target.value)} className={field} data-testid="customer-new-name" /></label>
            <label className="flex flex-col text-sm">{t('customerPhone')}<input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} data-testid="customer-new-phone" /></label>
            <button type="button" className="rounded border border-charcoal px-3 py-1 text-sm" data-testid="customer-new-save"
              onClick={async () => {
                setError(null); setExistingId(null);
                const r = await createCustomer({ displayName: name, phone });
                if (r.ok) { onSelect(r.customer); setName(''); setPhone(''); } else { setError(te(uiErrorKey(r.code))); setExistingId(r.existingId ?? null); }
              }}>{t('saveCustomer')}</button>
            {error && (
              <p role="alert" className="w-full text-sm text-clay">
                {error}
                {existingId && <> <Link href={`/customers/${existingId}`} data-testid="duplicate-link" className="underline">{te('customers.openExisting')}</Link></>}
              </p>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
