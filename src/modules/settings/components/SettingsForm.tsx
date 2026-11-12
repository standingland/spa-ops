'use client';

import { useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations } from 'next-intl';
import { errorText, uiErrorKey } from '@/lib/errors';
import { saveSetting } from '../actions';
import { SETTING_GROUPS, SETTING_KEYS, SETTING_META, settingId, type SettingKey, type Settings } from '../schema';

export function SettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslations('settings');
  const te = useTranslations();
  const [saved, setSaved] = useState<Settings>(initial);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(SETTING_KEYS.filter((k) => SETTING_META[k].kind === 'int').map((k) => [k, String(initial[k])])));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function commit(key: SettingKey, value: number | boolean) {
    setNotice(null); setError(null);
    const r = await saveSetting(key, value);
    if (!r.ok) {
      setError(errorText(te(uiErrorKey(r.code)), r));
      setDraft((d) => (typeof saved[key] === 'number' ? { ...d, [key]: String(saved[key]) } : d));
      return;
    }
    setSaved(r.settings);
    setNotice(t('saved', { name: t(`fields.${settingId(key)}`) }));
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('title')} />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {notice && <Alert data-testid="setting-saved" className="break-words">{notice}</Alert>}
      {SETTING_GROUPS.map((g) => (
        <Card key={g}>
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="px-1 font-serif text-heading text-ink">{t(`groups.${g}`)}</legend>
          {g === 'retention' && <p className="text-caption text-danger" data-testid="prune-help">{t('pruneHelp')}</p>}
          {SETTING_KEYS.filter((k) => SETTING_META[k].group === g).map((k) => {
            const m = SETTING_META[k];
            return (
              <div key={k} className="flex flex-wrap items-center gap-3 text-body">
                <label htmlFor={`s-${k}`} className="min-w-0 flex-1 basis-64 break-words">{t(`fields.${settingId(k)}`)}</label>
                {m.kind === 'bool' ? (
                  <input id={`s-${k}`} type="checkbox" data-testid={`setting-${k}`} checked={saved[k] as boolean}
                    onChange={(e) => commit(k, e.target.checked)} className="size-5 accent-primary" />
                ) : (
                  <>
                    <Input id={`s-${k}`} type="number" inputMode="numeric" min={m.min} max={m.max} data-testid={`setting-${k}`}
                      value={draft[k]} className="tnum w-28"
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => { if (draft[k] !== String(saved[k])) commit(k, Number(draft[k])); }} />
                    <span className="w-48 min-w-0 text-caption text-ink-muted">{t(`units.${m.unit}`)} · {m.min}–{m.max}</span>
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
        </Card>
      ))}
    </div>
  );
}
