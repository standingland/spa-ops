'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { markRoomReady } from '../actions';
import { filterRooms, summarizeRooms, type RoomFilter, type RoomTile } from '../rooms';
import type { RoomStatus } from '../today';
import { ReportForm } from './ReportForm';

const LIVE_TABLES = ['bookings', 'room_turnovers', 'room_blocks', 'room_reports', 'therapist_time_off'] as const;
const STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
const STATUS_KEY: Record<RoomStatus, string> = { available: 'available', reserved: 'reserved', occupied: 'occupied', cleaning: 'cleaning', out_of_service: 'outOfService' };
const STATUS_BG: Record<RoomStatus, string> = { available: 'bg-sage', reserved: 'bg-brass', occupied: 'bg-charcoal', cleaning: 'bg-clay', out_of_service: 'bg-stone-dark' };
const field = 'rounded border border-stone-dark px-2 py-1 text-sm';

export type CategoryOpt = { id: string; name: string };
export type TherapistNames = Record<string, string>;

/** Plain tiles, no per-tile fetching: the server hands over every room once. */
export function RoomBoard({ tiles, categories, therapists, initial, showNotes }: {
  tiles: RoomTile[]; categories: CategoryOpt[]; therapists: TherapistNames;
  initial: { q: string; status: string; category: string; zone: string; compact: boolean }; showNotes: boolean;
}) {
  const t = useTranslations('roomBoard');
  const s = useTranslations('status');
  const td = useTranslations('today');
  const te = useTranslations();
  const router = useRouter();
  const [f, setF] = useState(initial);
  useLiveRefresh(LIVE_TABLES);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  function update(next: typeof f) {
    setF(next);
    // filters live in the URL so a filtered view can be bookmarked on a wall tablet (no refetch)
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.status) p.set('status', next.status);
    if (next.category) p.set('category', next.category);
    if (next.zone) p.set('zone', next.zone);
    if (next.compact) p.set('compact', '1');
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  const filter: RoomFilter = { q: f.q, status: (f.status || undefined) as RoomStatus | undefined, categoryId: f.category || undefined, zone: f.zone || undefined };
  const visible = useMemo(() => filterRooms(tiles, filter), [tiles, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarizeRooms(tiles), [tiles]);
  const zones = [...new Set(tiles.map((x) => x.zone).filter((z): z is string => !!z))].sort();
  const groups = useMemo(() => {
    const m = new Map<string | null, RoomTile[]>();
    for (const r of visible) m.set(r.zone, [...(m.get(r.zone) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)));
  }, [visible]);

  async function ready(roomId: string) {
    setError(null);
    const r = await markRoomReady(roomId);
    if (!r.ok) { setError(te(uiErrorKey(r.code))); return; }
    router.refresh();
  }

  const oneTime = (r: RoomTile) => {
    const iso = r.status === 'occupied' ? r.expectedEnd : r.status === 'cleaning' ? r.turnoverDueAt : r.nextStartsAt;
    return iso ? formatTime(iso) : t('none');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl">{t('title')}</h1>
        <input aria-label={t('search')} placeholder={t('search')} value={f.q} onChange={(e) => update({ ...f, q: e.target.value })} className={field} data-testid="room-search" />
        <select aria-label="status" value={f.status} onChange={(e) => update({ ...f, status: e.target.value })} className={field} data-testid="room-status-filter">
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((k) => <option key={k} value={k}>{s(STATUS_KEY[k])}</option>)}
        </select>
        <select aria-label="category" value={f.category} onChange={(e) => update({ ...f, category: e.target.value })} className={field} data-testid="room-category-filter">
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="zone" value={f.zone} onChange={(e) => update({ ...f, zone: e.target.value })} className={field} data-testid="room-zone-filter">
          <option value="">{t('allZones')}</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <button data-testid="compact-toggle" aria-pressed={f.compact} onClick={() => update({ ...f, compact: !f.compact })}
          className="ml-auto rounded border border-charcoal px-3 py-1.5 text-sm">{f.compact ? t('full') : t('compact')}</button>
      </div>

      <section aria-label={t('summary')} className="flex flex-wrap gap-3 text-sm" data-testid="room-summary">
        {STATUSES.map((k) => (
          <span key={k} className="flex items-center gap-2 rounded border border-stone bg-white px-3 py-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_BG[k]}`} aria-hidden />{s(STATUS_KEY[k])} <strong className="tnum">{summary.byStatus[k]}</strong>
          </span>
        ))}
        {summary.byZone.map((z) => (
          <span key={z.zone ?? '—'} className="rounded border border-stone bg-white px-3 py-1.5 text-stone-dark">
            {z.zone ?? t('noZone')}: <strong className="tnum">{z.occupied}/{z.total}</strong> {t('occupiedOf')}
          </span>
        ))}
      </section>

      {error && <p role="alert" className="rounded border border-clay bg-white px-3 py-2 text-sm text-clay">{error}</p>}

      {groups.map(([zone, list]) => (
        <section key={zone ?? '—'} aria-label={zone ?? t('noZone')}>
          <h2 className="mb-2 text-lg" data-testid="zone-heading">{zone ?? t('noZone')}</h2>
          <ul className={`grid gap-3 ${f.compact ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
            {list.map((r) => (
              <li key={r.roomId} data-testid="room-tile" data-code={r.code} data-status={r.status}
                className="flex flex-col gap-1 rounded border border-stone bg-white p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${STATUS_BG[r.status]}`} aria-hidden />
                  <span className="font-semibold">{r.code}</span>
                  <span className="text-stone-dark" data-testid="tile-status-label">{s(STATUS_KEY[r.status])}</span>
                  {f.compact && <span className="tnum ml-auto">{oneTime(r)}</span>}
                </div>
                {!f.compact && (
                  <>
                    <div className="text-stone-dark">{r.displayName}</div>
                    {r.status === 'occupied' && (
                      <div>{r.currentCustomerDisplayName ? `${r.currentCustomerDisplayName} · ` : ''}{r.currentTherapistId ? therapists[r.currentTherapistId] : ''}
                        {' · '}{t('expectedEnd')} <span className="tnum">{r.expectedEnd ? formatTime(r.expectedEnd) : t('none')}</span></div>
                    )}
                    {r.nextStartsAt && <div>{t('next')} <span className="tnum">{formatTime(r.nextStartsAt)}</span></div>}
                    {r.status === 'cleaning' && r.turnoverDueAt && (
                      <div>{r.turnoverStartedAt ? <>{t('turnover')} <span className="tnum">{formatTime(r.turnoverStartedAt)}</span> · </> : null}{t('due')} <span className="tnum">{formatTime(r.turnoverDueAt)}</span></div>
                    )}
                    {r.blockKind && r.status !== 'available' && <div>{t('blocked')}: {r.blockNote ?? r.blockKind}</div>}
                    {r.openReports > 0 && <div data-testid="open-reports">{t('reports')}: <strong className="tnum">{r.openReports}</strong></div>}
                    {showNotes && r.notes && <div className="text-stone-dark">{t('notes')}: {r.notes}</div>}
                    <div className="mt-1 flex flex-wrap gap-3">
                      {r.status === 'cleaning' && <button data-testid="act-ready" onClick={() => ready(r.roomId)} className="rounded border border-charcoal px-3 py-1.5">{td('ready')}</button>}
                      <button data-testid="report-open" onClick={() => setReporting(r.roomId)} className="underline">{td('report')}</button>
                      <Link href="/calendar?view=rooms" className="underline">{t('timeline')}</Link>
                    </div>
                    {reporting === r.roomId && <ReportForm roomId={r.roomId} room={r.code} onDone={() => setReporting(null)} onError={setError} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
