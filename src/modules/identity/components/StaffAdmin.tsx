'use client';

import { useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { createStaff, setStaffActive, setStaffRole, type StaffListRow } from '../actions';
import { ROLES } from '../schema';
import { StaffPasswordReset } from './StaffPasswordReset';

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
      <PageHeader title={t('title')}
        actions={<Button onClick={() => setAdding(true)} data-testid="staff-add">{t('add')}</Button>} />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {adding && (
        <Card>
        <form className="grid gap-3 sm:grid-cols-2" aria-label={t('add')}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(createStaff({ email: v.email, password: v.password, role: v.role as (typeof ROLES)[number], displayName: v.displayName }))) {
              setAdding(false); setV({ email: '', password: '', role: 'receptionist', displayName: '' });
            }
          }}>
          <Field label={t('email')}><Input type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} data-testid="staff-email" /></Field>
          <Field label={t('password')}><Input type="password" required minLength={10} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} data-testid="staff-password" /></Field>
          <Field label={t('role')}>
            <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} data-testid="staff-role">
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('displayName')}><Input required value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} data-testid="staff-name" /></Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" data-testid="staff-save">{c('save')}</Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>{c('cancel')}</Button>
          </div>
        </form>
        </Card>
      )}
      <ul className="flex flex-col gap-2">
        {staff.map((s) => (
          <li key={s.userId} data-testid="staff-row" data-email={s.email} data-active={String(s.active)} className="min-w-0">
            <Card className={`flex flex-wrap items-center gap-3 p-3 ${s.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 break-words font-semibold">{s.displayName}</span>
              <span className="min-w-0 break-all text-caption text-ink-muted">{s.email}</span>
              <Select aria-label={t('role')} value={s.role} disabled={s.userId === me} className="w-auto min-w-0 max-w-full" data-testid="staff-role-select"
                onChange={(e) => run(setStaffRole(s.userId, e.target.value as (typeof ROLES)[number]))}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </Select>
              <Badge>{s.active ? c('active') : c('inactive')}</Badge>
              <StaffPasswordReset userId={s.userId} onError={setError} onDone={() => start(() => router.refresh())} />
              {s.userId !== me && (
                <Button variant="link" className="ml-auto min-h-11 px-2 pointer-fine:min-h-0" data-testid="staff-toggle" onClick={() => run(setStaffActive(s.userId, !s.active))}>
                  {s.active ? c('deactivate') : c('activate')}
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
