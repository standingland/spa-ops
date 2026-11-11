'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { errorText, uiErrorKey } from '@/lib/errors';
import { setStaffPassword } from '../actions';

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

/** Owner: set a new password for one staff member, after an explicit confirmation. */
export function StaffPasswordReset({ userId, onError, onDone }: { userId: string; onError: (m: string | null) => void; onDone: () => void }) {
  const t = useTranslations('staff');
  const te = useTranslations();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  if (!open) return <button className="text-sm underline" data-testid="staff-reset-password" onClick={() => setOpen(true)}>{t('resetPassword')}</button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input type="password" autoComplete="new-password" aria-label={t('newPassword')} data-testid="staff-new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className={field} />
      <button className="rounded bg-clay px-3 py-1 text-sm text-white" data-testid="staff-reset-confirm"
        onClick={async () => {
          onError(null);
          const r = await setStaffPassword({ userId, password });
          if (!r.ok) { onError(errorText(te(uiErrorKey(r.code)), r)); return; }
          setOpen(false); setPassword(''); onDone();
        }}>{t('confirmReset')}</button>
      <button className="text-sm underline" onClick={() => setOpen(false)}>{te('common.cancel')}</button>
    </span>
  );
}
