'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { ErrorText } from '@/components/ErrorText';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTHB, parseTHB } from '@/lib/money';
import { bangkokDay, formatTime } from '@/lib/time';
import type { ActionResult } from '@/lib/action';
import type { Inventory, Item, Option } from '../schema';
import { recordMovement, saveItem, saveRecipe } from '../actions';
import { Metric, PeriodFilter, downloadCsv } from './BusinessShared';

export function InventoryDashboard({ from, to, inventory, services }: { from: string; to: string; inventory: Inventory; services: Option[] }) {
  const t = useTranslations('business'); const te = useTranslations(); const router = useRouter();
  const [busy, startTransition] = useTransition(); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null); const [kind, setKind] = useState<'receipt' | 'adjustment'>('receipt');
  const [search, setSearch] = useState(''); const [onlyLow, setOnlyLow] = useState(false);
  const [serviceId, setServiceId] = useState(''); const [materials, setMaterials] = useState<{ itemId: string; quantity: string }[]>([]);
  const movementKey = useRef<string | null>(null);
  const items = inventory.items;
  const low = items.filter((i) => i.active && i.on_hand <= i.reorder_level);
  const value = items.reduce((n, i) => n + Math.round(i.on_hand * i.unit_cost_satang), 0);
  const shown = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) && (!onlyLow || (i.active && i.on_hand <= i.reorder_level)));
  const itemOf = (id: string) => items.find((i) => i.id === id);
  const recipeCost = materials.reduce((n, m) => n + Math.round((Number(m.quantity) || 0) * (itemOf(m.itemId)?.unit_cost_satang ?? 0)), 0);
  function act(task: () => Promise<ActionResult>, after?: () => void) {
    setError(null); setSaved(false);
    startTransition(async () => {
      try {
        const r = await task();
        if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
        after?.(); setSaved(true); router.refresh();
      } catch { setError(te('common.failed')); }
    });
  }
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('inventoryTitle')} subtitle={t('inventorySubtitle')} actions={<Button variant="secondary" onClick={() => downloadCsv(`inventory-${bangkokDay(new Date())}.csv`, [
      { header: t('itemName'), value: (r: Item) => r.name }, { header: t('unit'), value: (r) => r.unit },
      { header: t('onHand'), value: (r) => r.on_hand }, { header: t('reorderLevel'), value: (r) => r.reorder_level },
      { header: t('unitCostBaht'), value: (r) => r.unit_cost_satang / 100 },
    ], items)}>{t('export')}</Button>} />
    <PeriodFilter from={from} to={to} />
    <div className="grid gap-3 sm:grid-cols-3"><Metric label={t('stockValue')} value={formatTHB(value)} /><Metric label={t('lowStock')} value={String(low.length)} /><Metric label={t('materialCostPeriod')} value={formatTHB(inventory.materialCostSatang)} /></div>
    <Alert>{t('inventoryHelp')}</Alert>
    {error && <Alert tone="error"><ErrorText text={error} /></Alert>}{saved && <p role="status" className="text-body text-ink">{t('saved')}</p>}
    <section className="flex flex-col gap-3" aria-label={t('stockItems')}>
      <h2 className="font-serif text-heading text-ink">{t('stockItems')}</h2>
      <div className="flex flex-wrap items-end gap-3"><Field label={te('common.search')}><Input value={search} onChange={(e) => setSearch(e.target.value)} /></Field><label className="flex min-h-11 items-center gap-2 text-body"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-5 accent-primary" />{t('onlyLow')}</label></div>
      {shown.length === 0 && <Card>{te('common.empty')}</Card>}
      <div className="grid gap-3 md:grid-cols-2">{shown.map((i) => <Card key={i.id} className="flex flex-col gap-3" data-testid="inventory-item">
        <div className="flex flex-wrap items-center gap-2"><strong className="min-w-0 flex-1 break-words">{i.name}</strong>{!i.active && <Badge>{te('common.inactive')}</Badge>}{i.active && i.on_hand <= i.reorder_level && <Badge tone="warning">{i.on_hand < 0 ? t('negativeStock') : t('lowStock')}</Badge>}</div>
        <dl className="grid grid-cols-2 gap-2 text-body"><dt>{t('onHand')}</dt><dd className="tnum text-right">{i.on_hand} {i.unit}</dd><dt>{t('unitCost')}</dt><dd className="tnum text-right">{formatTHB(Math.round(i.unit_cost_satang))} / {i.unit}</dd><dt>{t('reorderLevel')}</dt><dd className="tnum text-right">{i.reorder_level} {i.unit}</dd></dl>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => setEditing(i)}>{te('common.edit')}</Button><Button disabled={busy} variant="secondary" size="sm" onClick={() => act(() => saveItem({ id: i.id, name: i.name, unit: i.unit, reorderLevel: i.reorder_level, active: !i.active }))}>{i.active ? te('common.deactivate') : te('common.activate')}</Button></div>
      </Card>)}</div>
      <Card><form key={editing?.id ?? 'new'} className="grid gap-3 sm:grid-cols-2" data-testid="item-form" onSubmit={(e) => {
        e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
        act(() => saveItem({ id: editing?.id ?? null, name: String(f.get('name')), unit: editing?.unit ?? String(f.get('unit')), reorderLevel: Number(f.get('reorder')), active: editing?.active ?? true }), () => { setEditing(null); form.reset(); });
      }}>
        <h3 className="font-semibold sm:col-span-2">{editing ? t('editItem') : t('addItem')}</h3>
        <Field label={t('itemName')}><Input name="name" required maxLength={100} defaultValue={editing?.name ?? ''} /></Field><Field label={t('unit')}><Input name="unit" required maxLength={20} defaultValue={editing?.unit ?? ''} readOnly={!!editing} placeholder={t('unitPlaceholder')} /></Field>
        <Field label={t('reorderLevel')}><Input name="reorder" type="number" min="0" max="1000000000" step="0.001" required defaultValue={editing?.reorder_level ?? 0} /></Field>
        <div className="flex flex-wrap items-end gap-2"><Button type="submit" disabled={busy}>{te('common.save')}</Button>{editing && <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{te('common.cancel')}</Button>}</div>
      </form></Card>
    </section>
    <section className="flex flex-col gap-3" aria-label={t('receiveAdjust')}>
      <h2 className="font-serif text-heading text-ink">{t('receiveAdjust')}</h2><p className="text-body text-ink-muted">{t('movementHelp')}</p>
      <Card><form className="grid gap-3 sm:grid-cols-2" data-testid="stock-form" onSubmit={(e) => {
        e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const cost = kind === 'receipt' ? parseTHB(String(f.get('cost'))) : 0;
        if (cost === null) { setError(te('errors.INVALID_AMOUNT')); return; }
        movementKey.current ??= crypto.randomUUID();
        act(() => recordMovement({ itemId: String(f.get('item')), kind, quantity: Number(f.get('quantity')), unitCostSatang: cost, reason: String(f.get('reason')), key: movementKey.current! }), () => { movementKey.current = null; form.reset(); setKind('receipt'); });
      }}>
        <Field label={t('itemName')}><Select name="item" required defaultValue=""><option value="" disabled>{t('choose')}</option>{items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</Select></Field>
        <Field label={t('movementKind')}><Select value={kind} onChange={(e) => setKind(e.target.value as 'receipt' | 'adjustment')}><option value="receipt">{t('receipt')}</option><option value="adjustment">{t('adjustment')}</option></Select></Field>
        <Field label={t('quantity')}><Input name="quantity" type="number" step="0.001" min={kind === 'receipt' ? '0.001' : '-1000000000'} max="1000000000" required /></Field>
        {kind === 'receipt' && <Field label={t('unitCostBaht')}><Input name="cost" type="number" min="0" step="0.01" max="1000000" required /></Field>}
        <Field label={t('reason')}><Input name="reason" required maxLength={300} /></Field><Button type="submit" disabled={busy || items.every((i) => !i.active)}>{te('common.save')}</Button>
      </form></Card>
    </section>
    <section className="flex flex-col gap-3" aria-label={t('recipe')}>
      <h2 className="font-serif text-heading text-ink">{t('recipe')}</h2><p className="text-body text-ink-muted">{t('recipeHelp')}</p>
      <Card><form className="flex flex-col gap-3" data-testid="recipe-form" onSubmit={(e) => { e.preventDefault(); act(() => saveRecipe({ serviceId, materials: materials.map((m) => ({ itemId: m.itemId, quantity: Number(m.quantity) })) })); }}>
        <Field label={t('service')}><Select value={serviceId} required onChange={(e) => { const id = e.target.value; setServiceId(id); setMaterials(inventory.materials.filter((m) => m.service_id === id).map((m) => ({ itemId: m.item_id, quantity: String(m.quantity) }))); }}><option value="" disabled>{t('choose')}</option>{services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        {materials.map((m, index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label={t('itemName')}><Select required value={m.itemId} onChange={(e) => setMaterials((rows) => rows.map((v, n) => n === index ? { ...v, itemId: e.target.value } : v))}><option value="" disabled>{t('choose')}</option>{items.filter((i) => i.active || i.id === m.itemId).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit}){!i.active ? ` · ${te('common.inactive')}` : ''}</option>)}</Select></Field>
          <Field label={t('quantityPerService')}><Input type="number" min="0.001" step="0.001" max="1000000000" required value={m.quantity} onChange={(e) => setMaterials((rows) => rows.map((v, n) => n === index ? { ...v, quantity: e.target.value } : v))} /></Field>
          <Button variant="secondary" type="button" onClick={() => setMaterials((rows) => rows.filter((_, n) => n !== index))}>{t('removeMaterial')}</Button>
        </div>)}
        {serviceId && <><div className="flex flex-wrap items-center gap-3"><Button variant="secondary" type="button" disabled={materials.length >= 100} onClick={() => setMaterials((rows) => [...rows, { itemId: '', quantity: '' }])}>{t('addMaterial')}</Button><span className="tnum text-body">{t('estimatedCost')}: {formatTHB(recipeCost)}</span></div><Button type="submit" disabled={busy}>{t('saveRecipe')}</Button></>}
      </form></Card>
    </section>
    <section className="flex flex-col gap-3" aria-label={t('costByService')}>
      <h2 className="font-serif text-heading text-ink">{t('costByService')}</h2><p className="text-body text-ink-muted">{t('costByServiceHelp')}</p>
      {inventory.costByService.length === 0 && <Card>{te('common.empty')}</Card>}
      <div className="grid gap-3 md:grid-cols-2">{inventory.costByService.map((s) => <Card key={s.service_id} className="flex flex-col gap-2"><strong>{services.find((service) => service.id === s.service_id)?.name ?? s.service_name}</strong><p className="text-caption text-ink-muted">{t('treatmentCount', { count: s.treatments })}</p><dl className="grid grid-cols-2 gap-2 text-body"><dt>{t('materialCostTotal')}</dt><dd className="tnum text-right">{formatTHB(s.cost_satang)}</dd><dt>{t('averageMaterialCost')}</dt><dd className="tnum text-right">{formatTHB(s.average_satang)}</dd></dl></Card>)}</div>
    </section>
    <section className="flex flex-col gap-3" aria-label={t('movements')}>
      <h2 className="font-serif text-heading text-ink">{t('movements')}</h2><p className="text-caption text-ink-muted">{t('latestRows', { shown: inventory.movements.length, total: inventory.movementCount })}</p>
      {inventory.movements.map((m) => <Card key={m.id} className="flex flex-wrap items-center gap-3" data-testid="stock-movement"><div className="min-w-0 flex-1"><strong className="break-words">{itemOf(m.item_id)?.name}</strong><p className="text-caption text-ink-muted">{bangkokDay(m.occurred_at)} {formatTime(m.occurred_at)} · {t(m.kind)}</p><p className="break-words text-caption text-ink-muted">{m.kind === 'usage' ? `${t('usage')} · ${m.booking_id?.slice(0, 8)}` : m.reason}</p></div><span className="tnum">{m.quantity > 0 ? '+' : ''}{m.quantity} {itemOf(m.item_id)?.unit}</span><span className="tnum">{formatTHB(Math.round(Math.abs(m.quantity) * m.unit_cost_satang))}</span></Card>)}
    </section>
  </div>;
}
