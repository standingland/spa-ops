'use client';

import { useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTHB } from '@/lib/money';
import { saveService, setServiceActive } from '../actions';

export type ServiceRow = {
  id: string; name_th: string; name_en: string | null; duration_min: number; price_satang: number;
  required_equipment: string[]; active: boolean; service_room_categories: { room_category_id: string }[];
};
export type CategoryRow = { id: string; name_th: string; name_en: string | null };

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
    if (!r.ok) setError(errorText(te(uiErrorKey(r.code ?? 'UNKNOWN')), r));
    else start(() => router.refresh());
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <PageHeader title={t('title')}
        actions={<Button onClick={() => setEditing('new')} data-testid="service-add">{t('add')}</Button>} />
      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}
      {editing && (
        <ServiceForm key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} categories={categories} catName={catName}
          onCancel={() => setEditing(null)} onSave={async (i) => { if (await run(saveService(i))) setEditing(null); }} />
      )}
      {services.length === 0 && <EmptyState>{c('empty')}</EmptyState>}
      <ul className="flex flex-col gap-2">
        {services.map((s) => {
          const allowed = categories.filter((k) => s.service_room_categories.some((x) => x.room_category_id === k.id));
          return (
            <li key={s.id} data-testid="service-row" data-active={String(s.active)} className="min-w-0">
              <Card className={`flex flex-wrap items-center gap-3 p-3 ${s.active ? '' : 'opacity-60'}`}>
                <span className="min-w-0 break-words font-semibold">{svcName(s)}</span>
                <span className="tnum text-caption">{s.duration_min} {c('minutes')} · {formatTHB(s.price_satang)}</span>
                <span className="min-w-0 break-words text-caption text-ink-muted">{allowed.length ? allowed.map(catName).join(', ') : t('anyCategory')}</span>
                <Badge>{s.active ? c('active') : c('inactive')}</Badge>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setEditing(s)} data-testid="service-edit">{c('edit')}</Button>
                  {s.active ? (
                    confirming === s.id ? (
                      <>
                        <Button variant="danger" size="sm" data-testid="service-deactivate-confirm" onClick={async () => { await run(setServiceActive(s.id, false)); setConfirming(null); }}>{c('deactivateConfirm')}</Button>
                        <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => setConfirming(null)}>{c('cancel')}</Button>
                      </>
                    ) : <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="service-deactivate" onClick={() => setConfirming(s.id)}>{c('deactivate')}</Button>
                  ) : <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => run(setServiceActive(s.id, true))}>{c('activate')}</Button>}
                </span>
              </Card>
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
    <Card>
    <form className="grid gap-3 sm:grid-cols-2" aria-label={service ? t('edit') : t('add')}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: service?.id, nameTh: v.nameTh, nameEn: v.nameEn, durationMin: Number(v.durationMin),
          priceSatang: Math.round(Number(v.price) * 100), requiredEquipment: v.equipment.split(',').map((s) => s.trim()).filter(Boolean), categoryIds: cats,
        });
      }}>
      <Field label={t('nameTh')}><Input required value={v.nameTh} onChange={set('nameTh')} data-testid="service-name-th" /></Field>
      <Field label={t('nameEn')}><Input value={v.nameEn} onChange={set('nameEn')} /></Field>
      <Field label={t('duration')}><Input required type="number" min={1} value={v.durationMin} onChange={set('durationMin')} data-testid="service-duration" /></Field>
      <Field label={t('price')}><Input required type="number" min={0} step="0.01" value={v.price} onChange={set('price')} data-testid="service-price" /></Field>
      <div className="sm:col-span-2"><Field label={t('equipment')}><Input value={v.equipment} onChange={set('equipment')} /></Field></div>
      <fieldset className="sm:col-span-2">
        <legend className="text-caption text-ink-muted">{t('categories')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {categories.map((k) => (
            <label key={k.id} data-testid="service-category-option" className="flex min-h-11 items-center gap-2 text-body text-ink">
              <input type="checkbox" className="size-5 accent-primary" checked={cats.includes(k.id)} onChange={(e) => setCats(e.target.checked ? [...cats, k.id] : cats.filter((x) => x !== k.id))} />
              <span className="min-w-0 break-words">{catName(k)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" data-testid="service-save">{c('save')}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{c('cancel')}</Button>
      </div>
    </form>
    </Card>
  );
}
