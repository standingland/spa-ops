'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useTranslations } from 'next-intl';
import { errorText, uiErrorKey } from '@/lib/errors';
import { setStaffPassword } from '../actions';

/** Owner: set a new password for one staff member, after an explicit confirmation. */
export function StaffPasswordReset({ userId, onError, onDone }: { userId: string; onError: (m: string | null) => void; onDone: () => void }) {
  const t = useTranslations('staff');
  const te = useTranslations();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  if (!open) return <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="staff-reset-password" onClick={() => setOpen(true)}>{t('resetPassword')}</Button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Input type="password" autoComplete="new-password" aria-label={t('newPassword')} data-testid="staff-new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="w-auto min-w-0 max-w-full" />
      <Button variant="danger" size="sm" data-testid="staff-reset-confirm"
        onClick={async () => {
          onError(null);
          const r = await setStaffPassword({ userId, password });
          if (!r.ok) { onError(errorText(te(uiErrorKey(r.code)), r)); return; }
          setOpen(false); setPassword(''); onDone();
        }}>{t('confirmReset')}</Button>
      <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setOpen(false)}>{te('common.cancel')}</Button>
    </span>
  );
}
