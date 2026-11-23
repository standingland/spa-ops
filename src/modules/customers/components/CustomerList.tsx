'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Icon } from '@/components/shell/Icon';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { errorText, uiErrorKey } from '@/lib/errors';
import { createCustomer } from '../actions';
import type { CustomerRow } from '../schema';

const PAGE = 50;

export function CustomerList({ rows, total, page, q, isOwner, selectedId, allowCreate = true }: {
  rows: CustomerRow[]; total: number; page: number; q: string; isOwner: boolean; selectedId?: string; allowCreate?: boolean;
}) {
  const t = useTranslations('customers');
  const b = useTranslations('booking');
  const care = useTranslations('care');
  const design = useTranslations('workspaceDesign');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [busy, transition] = useTransition();
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState('');
  const pages = Math.max(1, Math.ceil(total / PAGE));

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(value: string) {
    setTerm(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(value.trim() ? `/customers?q=${encodeURIComponent(value.trim())}` : '/customers'), 300);
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setExistingId('');
    transition(async () => {
      try {
        const result = await createCustomer({ displayName: String(form.get('name') ?? ''), phone: String(form.get('phone') ?? '') });
        if (!result.ok) {
          setError(errorText(te(uiErrorKey(result.code)), result));
          setExistingId(result.existingId ?? '');
          return;
        }
        router.push(`/customers/${result.id}`);
      } catch {
        setError(te('common.failed'));
      }
    });
  }

  const query = (p: number) => ({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

  return (
    <section className="workspace-surface customer-list" aria-labelledby="customer-list-title">
      <header>
        <h2 id="customer-list-title" className="workspace-section-title">{design('customerList')} <small>({design('guestCount', { count: total })})</small></h2>
        {allowCreate && <Button type="button" size="sm" aria-expanded={creating} onClick={() => setCreating(!creating)}>+ {b('newCustomer')}</Button>}
      </header>
      <div className="customer-toolbar">
        <label className="today-search"><Icon name="search" /><Input type="search" aria-label={t('search')} placeholder={t('search')} value={term} onChange={(event) => search(event.target.value)} data-testid="customer-search" /></label>
        <Link href="/waitlist" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{care('waitlist')}</Link>
        {isOwner && <Link href="/customers?tab=retention" className={buttonVariants({ variant: 'secondary', size: 'sm' })} data-testid="retention-tab">{t('retention')}</Link>}
      </div>
      {creating && <form onSubmit={add} className="customer-create" aria-label={b('newCustomer')}>
        <Field label={t('displayName')}><Input name="name" required maxLength={80} /></Field>
        <Field label={t('phone')}><Input name="phone" type="tel" maxLength={30} /></Field>
        <Button type="submit" size="sm" disabled={busy}>{te('common.save')}</Button>
        {error && <Alert tone="error">{error} {existingId && <Link href={`/customers/${existingId}`} className="underline">{t('openExisting')}</Link>}</Alert>}
      </form>}
      {!rows.length && <div className="p-3"><EmptyState>{te('common.empty')}</EmptyState></div>}
      {rows.length > 0 && (
        <div className="customer-rows">
          <div className="customer-columns" aria-hidden="true">
            <span>{b('customer')}</span><span>{t('phone')}</span><span>{t('lastVisit')}</span><span />
          </div>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={{ pathname: `/customers/${row.id}`, query: query(page) }} data-testid="customer-row"
                  data-selected={row.id === selectedId} onClick={() => clearTimeout(timer.current)} className="customer-row">
                  <span className="customer-name">
                    <span aria-hidden="true"><Avatar name={row.displayName} size="sm" /></span>
                    <strong>{row.displayName}</strong>
                    {row.anonymised && <Badge>{t('removed')}</Badge>}
                  </span>
                  <span className="tnum">{row.phone ?? '—'}</span>
                  <span>{row.lastVisit ? date.format(new Date(row.lastVisit)) : '—'}</span>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <nav className="customer-pagination" aria-label={t('title')}>
          {page > 1 && <Link href={{ pathname: '/customers', query: query(page - 1) }} className={buttonVariants({ variant: 'secondary', size: 'sm' })} aria-label={care('previous')}>‹</Link>}
          <span className="tnum">{page} / {pages}</span>
          {page < pages && <Link href={{ pathname: '/customers', query: query(page + 1) }} className={buttonVariants({ variant: 'secondary', size: 'sm' })} aria-label={care('next')}>›</Link>}
        </nav>
      )}
    </section>
  );
}
