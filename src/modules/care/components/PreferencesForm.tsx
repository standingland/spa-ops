'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { uiErrorKey } from '@/lib/errors';
import { savePreferences } from '../actions';
import type { Preferences } from '../schema';

export function PreferencesForm({ customerId, initial, disabled }: { customerId: string; initial: Preferences; disabled: boolean }) {
  const t = useTranslations('care'); const te = useTranslations(); const router = useRouter();
  const [busy, transition] = useTransition(); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  return <Card><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setNotice(''); setError('');
    transition(async () => { try {
      const r = await savePreferences({ customerId, pressure: String(f.get('pressure')) as '', oil: String(f.get('oil')), room: String(f.get('room')), notes: String(f.get('notes')) });
      if (!r.ok) { setError(te(uiErrorKey(r.code))); return; } setNotice(t('saved')); router.refresh();
    } catch { setError(te('common.failed')); } });
  }}>
    <h2 className="font-serif text-heading text-ink sm:col-span-2">{t('preferences')}</h2>
    <p className="text-caption text-ink-muted sm:col-span-2">{t('preferencesHelp')}</p>
    <Field label={t('pressure')}><Select name="pressure" defaultValue={initial.pressure ?? ''} disabled={disabled}><option value="">—</option>{(['light', 'medium', 'firm'] as const).map((p) => <option key={p} value={p}>{t(`pressures.${p}`)}</option>)}</Select></Field>
    <Field label={t('oil')}><Input name="oil" defaultValue={initial.oil ?? ''} maxLength={120} disabled={disabled} /></Field>
    <Field label={t('room')}><Input name="room" defaultValue={initial.room ?? ''} maxLength={200} disabled={disabled} /></Field>
    <Field label={t('preferenceNotes')}><Textarea name="notes" defaultValue={initial.notes ?? ''} maxLength={500} disabled={disabled} /></Field>
    {error && <Alert tone="error">{error}</Alert>}{notice && <p role="status">{notice}</p>}
    {!disabled && <div><Button type="submit" disabled={busy}>{te('common.save')}</Button></div>}
  </form></Card>;
}
