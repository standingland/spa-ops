'use client';

import { useMemo, useState, useTransition } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime, bangkokDay } from '@/lib/time';
import { addPosition, addRoomBlock, removeRoomBlock, reorderRooms, saveRoom, setPositionActive, setRoomActive } from '../actions';
import { saveCategory } from '@/modules/catalog/actions';
import { forceRoomBlock } from '@/modules/operations/actions';

export type RoomRow = {
  id: string; code: string; display_name: string; category_id: string; floor: string | null; zone: string | null;
  turnover_min: number; equipment: string[]; notes: string | null; sort_order: number; active: boolean;
  room_positions: { id: string; label: string; active: boolean }[];
};
export type CategoryRow = { id: string; name_th: string; name_en: string | null };
export type BlockRow = { id: string; room_id: string; start: string; end: string; kind: 'maintenance' | 'cleaning' | 'closed'; note: string | null };

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

  async function runFull<R extends { ok: boolean; code?: string }>(p: Promise<R>): Promise<R> {
    setError(null);
    const r = await p;
    if (!r.ok) setError(errorText(te(uiErrorKey(r.code ?? 'UNKNOWN')), r));
    else start(() => router.refresh());
    return r;
  }
  async function run(p: Promise<{ ok: boolean; code?: string }>) {
    return (await runFull(p)).ok;
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
      <PageHeader title={t('title')}
        actions={<Button onClick={() => setEditing('new')} data-testid="room-add">{t('add')}</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={c('search')} placeholder={c('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="room-search" />
        <Select aria-label={t('filterCategory')} value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="room-filter-category">
          <option value="">{c('all')}</option>
          {categories.map((k) => <option key={k.id} value={k.id}>{catName(k.id)}</option>)}
        </Select>
        <Select aria-label={t('filterActive')} value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} className="w-auto min-w-0 max-w-full" data-testid="room-filter-active">
          <option value="all">{c('all')}</option>
          <option value="active">{c('active')}</option>
          <option value="inactive">{c('inactive')}</option>
        </Select>
      </div>

      {error && <Alert tone="error" className="break-words"><ErrorText text={error} /></Alert>}

      {editing && (
        <RoomForm
          key={editing === 'new' ? 'new' : editing.id}
          room={editing === 'new' ? null : editing} categories={categories} catName={catName}
          onCancel={() => setEditing(null)}
          onSave={async (input) => { if (await run(saveRoom(input))) setEditing(null); }}
        />
      )}

      {visible.length === 0 && <EmptyState>{c('empty')}</EmptyState>}

      {zones.map(([zone, list]) => (
        <section key={zone} aria-label={zone || t('noZone')} className="flex min-w-0 flex-col gap-2">
          <h2 className="font-serif text-heading text-ink">{zone || t('noZone')}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={r.id} data-testid="room-row" data-code={r.code} data-active={String(r.active)}
                draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId && dragId !== r.id) move(dragId, rooms.findIndex((x) => x.id === r.id)); setDragId(null); }}
                className="min-w-0">
                <Card className={`p-3 ${r.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tnum min-w-0 break-words font-semibold" title={t('dragHint')}>{r.code}</span>
                  <span className="min-w-0 break-words">{r.display_name}</span>
                  <span className="min-w-0 break-words text-caption text-ink-muted">{catName(r.category_id)} · {r.turnover_min} {c('minutes')}</span>
                  <Badge>{r.active ? c('active') : c('inactive')}</Badge>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Button aria-label={t('moveUp')} onClick={() => move(r.id, rooms.findIndex((x) => x.id === r.id) - 1)} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0">↑</Button>
                    <Button aria-label={t('moveDown')} onClick={() => move(r.id, rooms.findIndex((x) => x.id === r.id) + 1)} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0">↓</Button>
                    <Button onClick={() => setEditing(r)} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="room-edit">{c('edit')}</Button>
                    {r.active ? (
                      confirming === r.id ? (
                        <>
                          <Button variant="danger" size="sm" data-testid="room-deactivate-confirm"
                            onClick={async () => { await run(setRoomActive(r.id, false)); setConfirming(null); }}>{c('deactivateConfirm')}</Button>
                          <Button onClick={() => setConfirming(null)} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0">{c('cancel')}</Button>
                        </>
                      ) : <Button data-testid="room-deactivate" onClick={() => setConfirming(r.id)} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0">{c('deactivate')}</Button>
                    ) : <Button data-testid="room-activate" onClick={() => run(setRoomActive(r.id, true))} variant="link" className="min-h-11 px-2 pointer-fine:min-h-0">{c('activate')}</Button>}
                  </span>
                </div>
                <PositionsAndBlocks room={r} blocks={blocks.filter((b) => b.room_id === r.id)} run={run} runFull={runFull} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <CategoryManager categories={categories} run={run} />
    </div>
  );
}

type RunFull = <R extends { ok: boolean; code?: string }>(p: Promise<R>) => Promise<R>;

function PositionsAndBlocks({ room, blocks, run, runFull }: {
  room: RoomRow; blocks: BlockRow[]; run: (p: Promise<{ ok: boolean; code?: string }>) => Promise<boolean>; runFull: RunFull;
}) {
  const t = useTranslations('rooms');
  const c = useTranslations('common');
  const te = useTranslations();
  const [force, setForce] = useState<Parameters<typeof forceRoomBlock>[0] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [b, setB] = useState({ start: '', end: '', kind: 'maintenance' as BlockRow['kind'], note: '' });
  const positions = [...room.room_positions].sort((x, y) => x.label.localeCompare(y.label));
  return (
    <details className="mt-2 text-caption">
      <summary className="inline-flex min-h-11 cursor-pointer items-center pointer-fine:min-h-0">{t('positions')} ({positions.filter((p) => p.active).length}) · {t('blocks')} ({blocks.length})</summary>
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {positions.map((p) => (
            <span key={p.id} data-testid="position" className={`inline-flex min-w-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 ${p.active ? '' : 'line-through opacity-60'}`}>
              <span className="min-w-0 break-words">{p.label}</span>
              <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => run(setPositionActive(p.id, !p.active))}>{p.active ? c('deactivate') : c('activate')}</Button>
            </span>
          ))}
          <Input aria-label={t('positionLabel')} placeholder={t('positionLabel')} value={label} onChange={(e) => setLabel(e.target.value)} className="w-auto min-w-0 max-w-full" data-testid="position-label" />
          <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="position-add" onClick={async () => { if (await run(addPosition(room.id, label))) setLabel(''); }}>{t('addPosition')}</Button>
        </div>
        <ul className="flex flex-col gap-1">
          {blocks.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2" data-testid="room-block">
              <span className="tnum">{bangkokDay(x.start)} {formatTime(x.start)}–{bangkokDay(x.end) === bangkokDay(x.start) ? '' : bangkokDay(x.end) + ' '}{formatTime(x.end)}</span>
              <span>{t(`kind.${x.kind}`)}</span>
              {x.note && <span className="min-w-0 break-words text-ink-muted">{x.note}</span>}
              <Button variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" onClick={() => run(removeRoomBlock(x.id))}>{t('removeBlock')}</Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('blockStart')}><Input type="datetime-local" value={b.start} onChange={(e) => setB({ ...b, start: e.target.value })} data-testid="block-start" /></Field>
          <Field label={t('blockEnd')}><Input type="datetime-local" value={b.end} onChange={(e) => setB({ ...b, end: e.target.value })} data-testid="block-end" /></Field>
          <Field label={t('blockKind')}>
            <Select value={b.kind} onChange={(e) => setB({ ...b, kind: e.target.value as BlockRow['kind'] })}>
              {(['maintenance', 'cleaning', 'closed'] as const).map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('blockNote')}><Input value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} /></Field>
          <Button variant="secondary" size="sm" data-testid="block-add"
            onClick={async () => {
              setNotice(null);
              const input = {
                roomId: room.id, kind: b.kind, note: b.note,
                start: b.start ? new Date(`${b.start}:00+07:00`).toISOString() : '', end: b.end ? new Date(`${b.end}:00+07:00`).toISOString() : '',
              };
              const r = await runFull(addRoomBlock(input));
              if (!r.ok && r.code === 'CONFLICTS_WITH_BOOKINGS') setForce(input);
              else setForce(null);
            }}>{t('addBlock')}</Button>
        </div>
        {force && (
          <Card tone="danger" className="flex flex-wrap items-center gap-3 p-3">
            <span className="min-w-0 break-words">{te('exceptions.forceHint')}</span>
            <Button variant="danger" size="sm" data-testid="force-confirm"
              onClick={async () => {
                const r = await runFull(forceRoomBlock(force));
                if (r.ok) { setNotice(te('exceptions.forced', { count: r.affected.length })); setForce(null); }
              }}>{te('exceptions.forceConfirm')}</Button>
          </Card>
        )}
        {notice && <Alert className="break-words">{notice}</Alert>}
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
    <Card>
    <form className="grid gap-3 sm:grid-cols-2" aria-label={room ? t('edit') : t('add')}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: room?.id, code: v.code, displayName: v.displayName, categoryId: v.categoryId, floor: v.floor, zone: v.zone,
          turnoverMin: Number(v.turnoverMin), equipment: v.equipment.split(',').map((s) => s.trim()).filter(Boolean), notes: v.notes,
        });
      }}>
      <Field label={t('code')}><Input required value={v.code} onChange={set('code')} data-testid="room-code" /></Field>
      <Field label={t('name')}><Input required value={v.displayName} onChange={set('displayName')} data-testid="room-name" /></Field>
      <Field label={t('category')}>
        <Select value={v.categoryId} onChange={set('categoryId')} data-testid="room-category">
          {categories.map((k) => <option key={k.id} value={k.id}>{catName(k.id)}</option>)}
        </Select>
      </Field>
      <Field label={t('turnover')}><Input type="number" min={0} value={v.turnoverMin} onChange={set('turnoverMin')} data-testid="room-turnover" /></Field>
      <Field label={t('floor')}><Input value={v.floor} onChange={set('floor')} /></Field>
      <Field label={t('zone')}><Input value={v.zone} onChange={set('zone')} data-testid="room-zone" /></Field>
      <div className="sm:col-span-2"><Field label={t('equipment')}><Input value={v.equipment} onChange={set('equipment')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('notes')}><Input value={v.notes} onChange={set('notes')} /></Field></div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" data-testid="room-save">{c('save')}</Button>
        <Button type="button" onClick={onCancel} variant="secondary">{c('cancel')}</Button>
      </div>
    </form>
    </Card>
  );
}

function CategoryManager({ categories, run }: { categories: CategoryRow[]; run: (p: Promise<{ ok: boolean; code?: string }>) => Promise<boolean> }) {
  const t = useTranslations('rooms');
  const [th, setTh] = useState('');
  const [en, setEn] = useState('');
  return (
    <section className="mt-6 flex min-w-0 flex-col gap-3 border-t border-line pt-4">
      <h2 className="font-serif text-heading text-ink">{t('categories')}</h2>
      <ul className="flex flex-col gap-1 text-body">{categories.map((k) => <li key={k.id} data-testid="category-row" className="min-w-0 break-words">{k.name_th}{k.name_en ? ` / ${k.name_en}` : ''}</li>)}</ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('categoryNameTh')}><Input value={th} onChange={(e) => setTh(e.target.value)} data-testid="category-name-th" /></Field>
        <Field label={t('categoryNameEn')}><Input value={en} onChange={(e) => setEn(e.target.value)} /></Field>
        <Button variant="secondary" data-testid="category-add" onClick={async () => { if (await run(saveCategory({ nameTh: th, nameEn: en, sortOrder: categories.length + 1 }))) { setTh(''); setEn(''); } }}>{t('addCategory')}</Button>
      </div>
    </section>
  );
}
