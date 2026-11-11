'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { uiErrorKey } from '@/lib/errors';
import { saveSetting } from '../actions';
import { SETTING_GROUPS, SETTING_KEYS, SETTING_META, settingId, type SettingKey, type Settings } from '../schema';

const field = 'w-28 rounded border border-stone-dark px-2 py-1 text-sm';

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
      setError(te(uiErrorKey(r.code)));
      setDraft((d) => (typeof saved[key] === 'number' ? { ...d, [key]: String(saved[key]) } : d));
      return;
    }
    setSaved(r.settings);
    setNotice(t('saved', { name: t(`fields.${settingId(key)}`) }));
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl">{t('title')}</h1>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}
      {notice && <p role="status" data-testid="setting-saved" className="rounded border border-sage bg-white px-3 py-2 text-sm">{notice}</p>}
      {SETTING_GROUPS.map((g) => (
        <fieldset key={g} className="flex flex-col gap-3 rounded border border-stone bg-white p-4">
          <legend className="px-1 font-serif text-lg">{t(`groups.${g}`)}</legend>
          {SETTING_KEYS.filter((k) => SETTING_META[k].group === g).map((k) => {
            const m = SETTING_META[k];
            return (
              <div key={k} className="flex flex-wrap items-center gap-3 text-sm">
                <label htmlFor={`s-${k}`} className="min-w-64 flex-1">{t(`fields.${settingId(k)}`)}</label>
                {m.kind === 'bool' ? (
                  <input id={`s-${k}`} type="checkbox" data-testid={`setting-${k}`} checked={saved[k] as boolean}
                    onChange={(e) => commit(k, e.target.checked)} className="h-5 w-5" />
                ) : (
                  <>
                    <input id={`s-${k}`} type="number" inputMode="numeric" min={m.min} max={m.max} data-testid={`setting-${k}`}
                      value={draft[k]} className={`${field} tnum`}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => { if (draft[k] !== String(saved[k])) commit(k, Number(draft[k])); }} />
                    <span className="w-48 text-xs text-stone-dark">{t(`units.${m.unit}`)} · {m.min}–{m.max}</span>
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
