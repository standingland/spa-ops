'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { uiErrorKey } from '@/lib/errors';
import { savePreferences } from '../actions';
import type { Preferences } from '../schema';

export function PreferencesForm({ customerId, initial, disabled }: { customerId: string; initial: Preferences; disabled: boolean }) {
  const t = useTranslations('care');
  const te = useTranslations();
  const router = useRouter();
  const [busy, transition] = useTransition();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const summaryTags = [
    initial.pressure ? `${t('pressure')}: ${t(`pressures.${initial.pressure}`)}` : '',
    initial.oil ? `${t('oil')}: ${initial.oil}` : '',
    initial.room ? `${t('room')}: ${initial.room}` : '',
  ].filter(Boolean);

  return (
    <section className="workspace-surface customer-panel" aria-label={t('preferences')}>
      <header className="customer-panel-head-stack">
        <h2 className="workspace-section-title">{t('preferences')}</h2>
        <p className="text-caption text-ink-muted">{t('preferencesHelp')}</p>
        {summaryTags.length > 0 && (
          <div className="customer-pref-tags">
            {summaryTags.map((tag) => (
              <Badge key={tag} className="customer-pref-tag">{tag}</Badge>
            ))}
          </div>
        )}
      </header>
      <form
        className="customer-prefs-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setNotice('');
          setError('');
          transition(async () => {
            try {
              const r = await savePreferences({
                customerId,
                pressure: String(f.get('pressure')) as '',
                oil: String(f.get('oil')),
                room: String(f.get('room')),
                notes: String(f.get('notes')),
              });
              if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
              setNotice(t('saved'));
              router.refresh();
            } catch {
              setError(te('common.failed'));
            }
          });
        }}
      >
        <Field label={t('pressure')}>
          <Select name="pressure" defaultValue={initial.pressure ?? ''} disabled={disabled}>
            <option value="">—</option>
            {(['light', 'medium', 'firm'] as const).map((p) => (
              <option key={p} value={p}>{t(`pressures.${p}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('oil')}>
          <Input name="oil" defaultValue={initial.oil ?? ''} maxLength={120} disabled={disabled} />
        </Field>
        <Field label={t('room')}>
          <Input name="room" defaultValue={initial.room ?? ''} maxLength={200} disabled={disabled} />
        </Field>
        <Field label={t('preferenceNotes')}>
          <Textarea name="notes" defaultValue={initial.notes ?? ''} maxLength={500} rows={3} disabled={disabled} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        {!disabled && (
          <div className="customer-form-actions">
            <Button type="submit" variant="secondary" disabled={busy}>{te('common.save')}</Button>
          </div>
        )}
      </form>
    </section>
  );
}
