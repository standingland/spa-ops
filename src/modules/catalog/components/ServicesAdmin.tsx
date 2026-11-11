'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { formatTHB } from '@/lib/money';
import { saveService, setServiceActive } from '../actions';

export type ServiceRow = {
  id: string; name_th: string; name_en: string | null; duration_min: number; price_satang: number;
  required_equipment: string[]; active: boolean; service_room_categories: { room_category_id: string }[];
};
export type CategoryRow = { id: string; name_th: string; name_en: string | null };

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export function ServicesAdmin({ services, categories }: { services: ServiceRow[]; categories: CategoryRow[] }) {
  const t = useTranslations('services');
  const c = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const catName = (k: CategoryRow) => (locale === 'en' && k.name_en ? k.name_en : k.name_th);
  const svcName = (s: ServiceRow) => (locale === 'en' && s.name_en ? s.name_en : s.name_th);

  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    setError(null);
    const r = await p;
    if (!r.ok) setError(te(uiErrorKey(r.code ?? 'UNKNOWN')));
    else start(() => router.refresh());
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl">{t('title')}</h1>
        <button onClick={() => setEditing('new')} data-testid="service-add" className="ml-auto rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('add')}</button>
      </div>
      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}
      {editing && (
        <ServiceForm key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} categories={categories} catName={catName}
          onCancel={() => setEditing(null)} onSave={async (i) => { if (await run(saveService(i))) setEditing(null); }} />
      )}
      {services.length === 0 && <p className="text-stone-dark">{c('empty')}</p>}
      <ul className="flex flex-col gap-2">
        {services.map((s) => {
          const allowed = categories.filter((k) => s.service_room_categories.some((x) => x.room_category_id === k.id));
          return (
            <li key={s.id} data-testid="service-row" data-active={String(s.active)} className={`flex flex-wrap items-center gap-3 rounded border border-stone bg-white p-3 ${s.active ? '' : 'opacity-60'}`}>
              <span className="font-semibold">{svcName(s)}</span>
              <span className="tnum text-sm">{s.duration_min} {c('minutes')} · {formatTHB(s.price_satang)}</span>
              <span className="text-sm text-stone-dark">{allowed.length ? allowed.map(catName).join(', ') : t('anyCategory')}</span>
              <span className="rounded bg-ivory px-2 py-0.5 text-xs">{s.active ? c('active') : c('inactive')}</span>
              <span className="ml-auto flex gap-2 text-sm">
                <button className="underline" onClick={() => setEditing(s)} data-testid="service-edit">{c('edit')}</button>
                {s.active ? (
                  confirming === s.id ? (
                    <>
                      <button className="rounded bg-clay px-2 text-white" data-testid="service-deactivate-confirm" onClick={async () => { await run(setServiceActive(s.id, false)); setConfirming(null); }}>{c('deactivateConfirm')}</button>
                      <button className="underline" onClick={() => setConfirming(null)}>{c('cancel')}</button>
                    </>
                  ) : <button className="underline" data-testid="service-deactivate" onClick={() => setConfirming(s.id)}>{c('deactivate')}</button>
                ) : <button className="underline" onClick={() => run(setServiceActive(s.id, true))}>{c('activate')}</button>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ServiceForm({ service, categories, catName, onSave, onCancel }: {
  service: ServiceRow | null; categories: CategoryRow[]; catName: (k: CategoryRow) => string;
  onSave: (i: Parameters<typeof saveService>[0]) => void; onCancel: () => void;
}) {
  const t = useTranslations('services');
  const c = useTranslations('common');
  const [v, setV] = useState({
    nameTh: service?.name_th ?? '', nameEn: service?.name_en ?? '', durationMin: String(service?.duration_min ?? 60),
    price: service ? String(service.price_satang / 100) : '', equipment: (service?.required_equipment ?? []).join(', '),
  });
  const [cats, setCats] = useState<string[]>(service?.service_room_categories.map((x) => x.room_category_id) ?? []);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-2" aria-label={service ? t('edit') : t('add')}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: service?.id, nameTh: v.nameTh, nameEn: v.nameEn, durationMin: Number(v.durationMin),
          priceSatang: Math.round(Number(v.price) * 100), requiredEquipment: v.equipment.split(',').map((s) => s.trim()).filter(Boolean), categoryIds: cats,
        });
      }}>
      <label className="flex flex-col text-sm">{t('nameTh')}<input required value={v.nameTh} onChange={set('nameTh')} className={field} data-testid="service-name-th" /></label>
      <label className="flex flex-col text-sm">{t('nameEn')}<input value={v.nameEn} onChange={set('nameEn')} className={field} /></label>
      <label className="flex flex-col text-sm">{t('duration')}<input required type="number" min={1} value={v.durationMin} onChange={set('durationMin')} className={field} data-testid="service-duration" /></label>
      <label className="flex flex-col text-sm">{t('price')}<input required type="number" min={0} step="0.01" value={v.price} onChange={set('price')} className={field} data-testid="service-price" /></label>
      <label className="flex flex-col text-sm sm:col-span-2">{t('equipment')}<input value={v.equipment} onChange={set('equipment')} className={field} /></label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm">{t('categories')}</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {categories.map((k) => (
            <label key={k.id} data-testid="service-category-option" className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cats.includes(k.id)} onChange={(e) => setCats(e.target.checked ? [...cats, k.id] : cats.filter((x) => x !== k.id))} />
              {catName(k)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" data-testid="service-save" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{c('save')}</button>
        <button type="button" onClick={onCancel} className="text-sm underline">{c('cancel')}</button>
      </div>
    </form>
  );
}
