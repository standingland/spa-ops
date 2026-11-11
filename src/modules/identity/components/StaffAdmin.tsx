'use client';

import { useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { createStaff, setStaffActive, setStaffRole, type StaffListRow } from '../actions';
import { ROLES } from '../schema';
import { StaffPasswordReset } from './StaffPasswordReset';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export function StaffAdmin({ staff, me }: { staff: StaffListRow[]; me: string }) {
  const t = useTranslations('staff');
  const c = useTranslations('common');
  const te = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ email: '', password: '', role: 'receptionist', displayName: '' });

  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    setError(null);
    const r = await p;
    if (!r.ok) setError(errorText(te(uiErrorKey(r.code ?? 'UNKNOWN')), r));
    else start(() => router.refresh());
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl">{t('title')}</h1>
        <button onClick={() => setAdding(true)} data-testid="staff-add" className="ml-auto rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('add')}</button>
      </div>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay"><ErrorText text={error} /></p>}
      {adding && (
        <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-2" aria-label={t('add')}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(createStaff({ email: v.email, password: v.password, role: v.role as (typeof ROLES)[number], displayName: v.displayName }))) {
              setAdding(false); setV({ email: '', password: '', role: 'receptionist', displayName: '' });
            }
          }}>
          <label className="flex flex-col text-sm">{t('email')}<input type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className={field} data-testid="staff-email" /></label>
          <label className="flex flex-col text-sm">{t('password')}<input type="password" required minLength={10} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className={field} data-testid="staff-password" /></label>
          <label className="flex flex-col text-sm">{t('role')}
            <select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} className={field} data-testid="staff-role">
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-sm">{t('displayName')}<input required value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} className={field} data-testid="staff-name" /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory" data-testid="staff-save">{c('save')}</button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm underline">{c('cancel')}</button>
          </div>
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {staff.map((s) => (
          <li key={s.userId} data-testid="staff-row" data-email={s.email} data-active={String(s.active)}
            className={`flex flex-wrap items-center gap-3 rounded border border-stone bg-white p-3 ${s.active ? '' : 'opacity-60'}`}>
            <span className="font-semibold">{s.displayName}</span>
            <span className="text-sm text-stone-dark">{s.email}</span>
            <select aria-label={t('role')} value={s.role} disabled={s.userId === me} className={field} data-testid="staff-role-select"
              onChange={(e) => run(setStaffRole(s.userId, e.target.value as (typeof ROLES)[number]))}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
            <span className="rounded bg-ivory px-2 py-0.5 text-xs">{s.active ? c('active') : c('inactive')}</span>
            <StaffPasswordReset userId={s.userId} onError={setError} onDone={() => start(() => router.refresh())} />
            {s.userId !== me && (
              <button className="ml-auto text-sm underline" data-testid="staff-toggle" onClick={() => run(setStaffActive(s.userId, !s.active))}>
                {s.active ? c('deactivate') : c('activate')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
