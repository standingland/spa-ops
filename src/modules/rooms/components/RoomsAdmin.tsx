'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { formatTime, bangkokDay } from '@/lib/time';
import { addPosition, addRoomBlock, removeRoomBlock, reorderRooms, saveRoom, setPositionActive, setRoomActive } from '../actions';
import { saveCategory } from '@/modules/catalog/actions';

export type RoomRow = {
  id: string; code: string; display_name: string; category_id: string; floor: string | null; zone: string | null;
  turnover_min: number; equipment: string[]; notes: string | null; sort_order: number; active: boolean;
  room_positions: { id: string; label: string; active: boolean }[];
};
export type CategoryRow = { id: string; name_th: string; name_en: string | null };
export type BlockRow = { id: string; room_id: string; start: string; end: string; kind: 'maintenance' | 'cleaning' | 'closed'; note: string | null };

const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export function RoomsAdmin({ rooms, categories, blocks }: { rooms: RoomRow[]; categories: CategoryRow[]; blocks: BlockRow[] }) {
  const t = useTranslations('rooms');
  const c = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<RoomRow | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const catName = (id: string) => {
    const x = categories.find((k) => k.id === id);
    return x ? (locale === 'en' && x.name_en ? x.name_en : x.name_th) : '';
  };

  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    setError(null);
    const r = await p;
    if (!r.ok) setError(te(uiErrorKey(r.code ?? 'UNKNOWN')));
    else start(() => router.refresh());
    return r.ok;
  }

  const visible = useMemo(() => rooms.filter((r) =>
    (!q || (r.code + ' ' + r.display_name).toLowerCase().includes(q.toLowerCase())) &&
    (!cat || r.category_id === cat) &&
    (activeFilter === 'all' || (activeFilter === 'active') === r.active)), [rooms, q, cat, activeFilter]);

  const zones = useMemo(() => {
    const m = new Map<string, RoomRow[]>();
    for (const r of visible) m.set(r.zone ?? '', [...(m.get(r.zone ?? '') ?? []), r]);
    return [...m.entries()];
  }, [visible]);

  function move(id: string, toIndex: number) {
    const ids = rooms.map((r) => r.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
    void run(reorderRooms(ids));
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl">{t('title')}</h1>
        <input aria-label={c('search')} placeholder={c('search')} value={q} onChange={(e) => setQ(e.target.value)} className={field} data-testid="room-search" />
        <select aria-label={t('filterCategory')} value={cat} onChange={(e) => setCat(e.target.value)} className={field} data-testid="room-filter-category">
          <option value="">{c('all')}</option>
          {categories.map((k) => <option key={k.id} value={k.id}>{catName(k.id)}</option>)}
        </select>
        <select aria-label={t('filterActive')} value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} className={field} data-testid="room-filter-active">
          <option value="all">{c('all')}</option>
          <option value="active">{c('active')}</option>
          <option value="inactive">{c('inactive')}</option>
        </select>
        <button onClick={() => setEditing('new')} data-testid="room-add" className="ml-auto rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{t('add')}</button>
      </div>

      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}

      {editing && (
        <RoomForm
          key={editing === 'new' ? 'new' : editing.id}
          room={editing === 'new' ? null : editing} categories={categories} catName={catName}
          onCancel={() => setEditing(null)}
          onSave={async (input) => { if (await run(saveRoom(input))) setEditing(null); }}
        />
      )}

      {visible.length === 0 && <p className="text-stone-dark">{c('empty')}</p>}

      {zones.map(([zone, list]) => (
        <section key={zone} aria-label={zone || t('noZone')}>
          <h2 className="mb-2 text-lg">{zone || t('noZone')}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={r.id} data-testid="room-row" data-code={r.code} data-active={String(r.active)}
                draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId && dragId !== r.id) move(dragId, rooms.findIndex((x) => x.id === r.id)); setDragId(null); }}
                className={`rounded border border-stone bg-white p-3 ${r.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tnum font-semibold" title={t('dragHint')}>{r.code}</span>
                  <span>{r.display_name}</span>
                  <span className="text-sm text-stone-dark">{catName(r.category_id)} · {r.turnover_min} {c('minutes')}</span>
                  <span className="rounded bg-ivory px-2 py-0.5 text-xs">{r.active ? c('active') : c('inactive')}</span>
                  <span className="ml-auto flex flex-wrap gap-2 text-sm">
                    <button aria-label={t('moveUp')} onClick={() => move(r.id, rooms.findIndex((x) => x.id === r.id) - 1)} className="underline">↑</button>
                    <button aria-label={t('moveDown')} onClick={() => move(r.id, rooms.findIndex((x) => x.id === r.id) + 1)} className="underline">↓</button>
                    <button onClick={() => setEditing(r)} className="underline" data-testid="room-edit">{c('edit')}</button>
                    {r.active ? (
                      confirming === r.id ? (
                        <>
                          <button data-testid="room-deactivate-confirm" className="rounded bg-clay px-2 text-white"
                            onClick={async () => { await run(setRoomActive(r.id, false)); setConfirming(null); }}>{c('deactivateConfirm')}</button>
                          <button onClick={() => setConfirming(null)} className="underline">{c('cancel')}</button>
                        </>
                      ) : <button data-testid="room-deactivate" onClick={() => setConfirming(r.id)} className="underline">{c('deactivate')}</button>
                    ) : <button data-testid="room-activate" onClick={() => run(setRoomActive(r.id, true))} className="underline">{c('activate')}</button>}
                  </span>
                </div>
                <PositionsAndBlocks room={r} blocks={blocks.filter((b) => b.room_id === r.id)} run={run} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <CategoryManager categories={categories} run={run} />
    </div>
  );
}

function PositionsAndBlocks({ room, blocks, run }: { room: RoomRow; blocks: BlockRow[]; run: (p: Promise<{ ok: boolean; code?: string }>) => Promise<boolean> }) {
  const t = useTranslations('rooms');
  const c = useTranslations('common');
  const [label, setLabel] = useState('');
  const [b, setB] = useState({ start: '', end: '', kind: 'maintenance' as BlockRow['kind'], note: '' });
  const positions = [...room.room_positions].sort((x, y) => x.label.localeCompare(y.label));
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer">{t('positions')} ({positions.filter((p) => p.active).length}) · {t('blocks')} ({blocks.length})</summary>
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {positions.map((p) => (
            <span key={p.id} data-testid="position" className={`rounded border border-stone px-2 py-0.5 ${p.active ? '' : 'line-through opacity-60'}`}>
              {p.label}{' '}
              <button className="underline" onClick={() => run(setPositionActive(p.id, !p.active))}>{p.active ? c('deactivate') : c('activate')}</button>
            </span>
          ))}
          <input aria-label={t('positionLabel')} placeholder={t('positionLabel')} value={label} onChange={(e) => setLabel(e.target.value)} className={field} data-testid="position-label" />
          <button className="underline" data-testid="position-add" onClick={async () => { if (await run(addPosition(room.id, label))) setLabel(''); }}>{t('addPosition')}</button>
        </div>
        <ul className="flex flex-col gap-1">
          {blocks.map((x) => (
            <li key={x.id} className="flex gap-2" data-testid="room-block">
              <span className="tnum">{bangkokDay(x.start)} {formatTime(x.start)}–{bangkokDay(x.end) === bangkokDay(x.start) ? '' : bangkokDay(x.end) + ' '}{formatTime(x.end)}</span>
              <span>{t(`kind.${x.kind}`)}</span>
              {x.note && <span className="text-stone-dark">{x.note}</span>}
              <button className="underline" onClick={() => run(removeRoomBlock(x.id))}>{t('removeBlock')}</button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col">{t('blockStart')}<input type="datetime-local" value={b.start} onChange={(e) => setB({ ...b, start: e.target.value })} className={field} data-testid="block-start" /></label>
          <label className="flex flex-col">{t('blockEnd')}<input type="datetime-local" value={b.end} onChange={(e) => setB({ ...b, end: e.target.value })} className={field} data-testid="block-end" /></label>
          <label className="flex flex-col">{t('blockKind')}
            <select value={b.kind} onChange={(e) => setB({ ...b, kind: e.target.value as BlockRow['kind'] })} className={field}>
              {(['maintenance', 'cleaning', 'closed'] as const).map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col">{t('blockNote')}<input value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} className={field} /></label>
          <button className="underline" data-testid="block-add"
            onClick={() => run(addRoomBlock({
              roomId: room.id, kind: b.kind, note: b.note,
              start: b.start ? new Date(`${b.start}:00+07:00`).toISOString() : '', end: b.end ? new Date(`${b.end}:00+07:00`).toISOString() : '',
            }))}>{t('addBlock')}</button>
        </div>
      </div>
    </details>
  );
}

function RoomForm({ room, categories, catName, onSave, onCancel }: {
  room: RoomRow | null; categories: CategoryRow[]; catName: (id: string) => string;
  onSave: (i: Parameters<typeof saveRoom>[0]) => void; onCancel: () => void;
}) {
  const t = useTranslations('rooms');
  const c = useTranslations('common');
  const [v, setV] = useState({
    code: room?.code ?? '', displayName: room?.display_name ?? '', categoryId: room?.category_id ?? categories[0]?.id ?? '',
    floor: room?.floor ?? '', zone: room?.zone ?? '', turnoverMin: room?.turnover_min ?? 15,
    equipment: (room?.equipment ?? []).join(', '), notes: room?.notes ?? '',
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-3 rounded border border-stone bg-white p-4 sm:grid-cols-2" aria-label={room ? t('edit') : t('add')}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: room?.id, code: v.code, displayName: v.displayName, categoryId: v.categoryId, floor: v.floor, zone: v.zone,
          turnoverMin: Number(v.turnoverMin), equipment: v.equipment.split(',').map((s) => s.trim()).filter(Boolean), notes: v.notes,
        });
      }}>
      <label className="flex flex-col text-sm">{t('code')}<input required value={v.code} onChange={set('code')} className={field} data-testid="room-code" /></label>
      <label className="flex flex-col text-sm">{t('name')}<input required value={v.displayName} onChange={set('displayName')} className={field} data-testid="room-name" /></label>
      <label className="flex flex-col text-sm">{t('category')}
        <select value={v.categoryId} onChange={set('categoryId')} className={field} data-testid="room-category">
          {categories.map((k) => <option key={k.id} value={k.id}>{catName(k.id)}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm">{t('turnover')}<input type="number" min={0} value={v.turnoverMin} onChange={set('turnoverMin')} className={field} data-testid="room-turnover" /></label>
      <label className="flex flex-col text-sm">{t('floor')}<input value={v.floor} onChange={set('floor')} className={field} /></label>
      <label className="flex flex-col text-sm">{t('zone')}<input value={v.zone} onChange={set('zone')} className={field} data-testid="room-zone" /></label>
      <label className="flex flex-col text-sm sm:col-span-2">{t('equipment')}<input value={v.equipment} onChange={set('equipment')} className={field} /></label>
      <label className="flex flex-col text-sm sm:col-span-2">{t('notes')}<input value={v.notes} onChange={set('notes')} className={field} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" data-testid="room-save" className="rounded bg-charcoal px-3 py-1.5 text-sm text-ivory">{c('save')}</button>
        <button type="button" onClick={onCancel} className="text-sm underline">{c('cancel')}</button>
      </div>
    </form>
  );
}

function CategoryManager({ categories, run }: { categories: CategoryRow[]; run: (p: Promise<{ ok: boolean; code?: string }>) => Promise<boolean> }) {
  const t = useTranslations('rooms');
  const [th, setTh] = useState('');
  const [en, setEn] = useState('');
  return (
    <section className="mt-6 border-t border-stone pt-4">
      <h2 className="mb-2 text-lg">{t('categories')}</h2>
      <ul className="mb-3 text-sm">{categories.map((k) => <li key={k.id} data-testid="category-row">{k.name_th}{k.name_en ? ` / ${k.name_en}` : ''}</li>)}</ul>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">{t('categoryNameTh')}<input value={th} onChange={(e) => setTh(e.target.value)} className={field} data-testid="category-name-th" /></label>
        <label className="flex flex-col">{t('categoryNameEn')}<input value={en} onChange={(e) => setEn(e.target.value)} className={field} /></label>
        <button className="underline" data-testid="category-add" onClick={async () => { if (await run(saveCategory({ nameTh: th, nameEn: en, sortOrder: categories.length + 1 }))) { setTh(''); setEn(''); } }}>{t('addCategory')}</button>
      </div>
    </section>
  );
}
