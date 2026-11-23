'use client';

import { useMemo, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { Icon } from '@/components/shell/Icon';
import { ROOM_STATUS_KEY, roomStatusStyle } from '@/components/ui/status';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { errorText, uiErrorKey } from '@/lib/errors';
import { formatTime } from '@/lib/time';
import { useLiveRefresh } from '@/lib/realtime';
import { markRoomReady } from '../actions';
import { filterRooms, summarizeRooms, type RoomFilter, type RoomTile } from '../rooms';
import type { RoomStatus } from '../today';
import { ReportForm } from './ReportForm';

const LIVE_TABLES = ['bookings', 'room_turnovers', 'room_blocks', 'room_reports', 'therapist_time_off'] as const;
const STATUSES: RoomStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];

export type CategoryOpt = { id: string; name: string };
export type TherapistNames = Record<string, string>;

/** Plain tiles, no per-tile fetching: the server hands over every room once. */
export function RoomBoard({ tiles, categories, therapists, nextServices, initial, showNotes }: {
  tiles: RoomTile[]; categories: CategoryOpt[]; therapists: TherapistNames; nextServices: Record<string, string>;
  initial: { q: string; status: string; category: string; zone: string; compact: boolean }; showNotes: boolean;
}) {
  const t = useTranslations('roomBoard');
  const nav = useTranslations('nav');
  const s = useTranslations('status');
  const td = useTranslations('today');
  const design = useTranslations('workspaceDesign');
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
  const unified = !f.compact && !f.zone;
  const zones = [...new Set(tiles.map((x) => x.zone).filter((z): z is string => !!z))].sort();
  const groups = useMemo(() => {
    const m = new Map<string | null, RoomTile[]>();
    for (const r of visible) m.set(r.zone, [...(m.get(r.zone) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)));
  }, [visible]);

  async function ready(roomId: string) {
    setError(null);
    const r = await markRoomReady(roomId);
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  const oneTime = (r: RoomTile) => {
    const iso = r.status === 'occupied' ? r.expectedEnd : r.status === 'cleaning' ? r.turnoverDueAt : r.nextStartsAt;
    return iso ? formatTime(iso) : t('none');
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <WorkspaceHero title={nav('rooms')} description={design('roomDesc')} icon="rooms" />

      <section aria-label={t('summary')} className="room-summary" data-testid="room-summary">
        {(['available', 'occupied', 'cleaning'] as const).map((k) => (
          <article key={k} className="workspace-surface room-summary-card" data-room-state={k}>
            <span className="room-summary-icon"><Icon name={k === 'cleaning' ? 'checklist' : 'rooms'} /></span>
            <div><h2>{s(ROOM_STATUS_KEY[k])}</h2><strong className="tnum">{summary.byStatus[k]}</strong></div>
          </article>
        ))}
      </section>

      <div className="workspace-surface workspace-toolbar room-toolbar">
        <Input aria-label={t('search')} placeholder={t('search')} value={f.q} onChange={(e) => update({ ...f, q: e.target.value })} data-testid="room-search" />
        <Select aria-label="status" value={f.status} onChange={(e) => update({ ...f, status: e.target.value })} data-testid="room-status-filter">
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((k) => <option key={k} value={k}>{s(ROOM_STATUS_KEY[k])}</option>)}
        </Select>
        <Select aria-label="category" value={f.category} onChange={(e) => update({ ...f, category: e.target.value })} data-testid="room-category-filter">
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="zone" value={f.zone} onChange={(e) => update({ ...f, zone: e.target.value })} data-testid="room-zone-filter">
          <option value="">{t('allZones')}</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
        <div className="workspace-segmented">
          <button type="button" aria-pressed={!f.compact} onClick={() => update({ ...f, compact: false })}><Icon name="grid" />{design('cardView')}</button>
          <button type="button" data-testid="compact-toggle" aria-pressed={f.compact} onClick={() => update({ ...f, compact: !f.compact })}><Icon name="list" />{design('listView')}</button>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}><Icon name="refresh" />{design('refresh')}</Button>
      </div>

      <div className="room-other-states">
        <span>{design('roomsTotal')} <strong>{summary.total}</strong></span>
        {(['reserved', 'out_of_service'] as const).map((k) => (
          <span key={k}><StatusDot status={k} />{s(ROOM_STATUS_KEY[k])} <strong>{summary.byStatus[k]}</strong></span>
        ))}
        {summary.byZone.length > 1 && summary.byZone.map((state) => (
          <span key={state.zone ?? ''}>{state.zone ?? t('noZone')} <strong>{state.occupied}/{state.total}</strong> {t('occupiedOf')}</span>
        ))}
      </div>

      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}
      {!groups.length && <Card>{design('noMatches')}</Card>}

      <div className={unified ? 'room-grid room-unified' : 'grid gap-4'}>
        {groups.map(([zone, list]) => (
        <section key={zone ?? '—'} aria-label={zone ?? t('noZone')}>
          <h2 className={unified ? 'sr-only' : 'workspace-section-title mb-2'} data-testid="zone-heading">{zone ?? t('noZone')}</h2>
          <ul className={f.compact ? 'room-list' : 'room-grid'}>
            {list.map((r) => (
              <li key={r.roomId} data-testid="room-tile" data-code={r.code} data-status={r.status} className="min-w-0">
                <article className="workspace-surface room-tile">
                  <div className={f.compact ? 'room-list-head' : 'room-photo'}>
                    <div><h3>{r.displayName}</h3><span>{r.code}{unified && r.zone ? ` · ${r.zone}` : ''}</span></div>
                    <span className={roomStatusStyle(r.status).chip} data-testid="tile-status-label">{s(ROOM_STATUS_KEY[r.status])}</span>
                    {f.compact && <span className="tnum ml-auto text-caption">{oneTime(r)}</span>}
                  </div>
                  {!f.compact && (
                    <div className="room-tile-body">
                      <div className="room-next">
                        <Icon name="today" />
                        <div><span>{t('next')}</span><strong className="tnum">{r.nextStartsAt ? formatTime(r.nextStartsAt) : t('none')}</strong></div>
                        {r.nextBookingId && nextServices[r.nextBookingId] && <p>{nextServices[r.nextBookingId]}</p>}
                      </div>
                      {r.status === 'occupied' && (
                        <div className="min-w-0 break-words">{r.currentCustomerDisplayName ? `${r.currentCustomerDisplayName} · ` : ''}{r.currentTherapistId ? therapists[r.currentTherapistId] : ''}
                          {' · '}{t('expectedEnd')} <span className="tnum">{r.expectedEnd ? formatTime(r.expectedEnd) : t('none')}</span></div>
                      )}
                      {r.status === 'cleaning' && r.turnoverDueAt && (
                        <div>{r.turnoverStartedAt ? <>{t('turnover')} <span className="tnum">{formatTime(r.turnoverStartedAt)}</span> · </> : null}{t('due')} <span className="tnum">{formatTime(r.turnoverDueAt)}</span></div>
                      )}
                      {r.blockKind && r.status !== 'available' && <div className="min-w-0 break-words">{t('blocked')}: {r.blockNote ?? r.blockKind}</div>}
                      {r.openReports > 0 && <div data-testid="open-reports">{t('reports')}: <strong className="tnum">{r.openReports}</strong></div>}
                      {showNotes && r.notes && <div className="min-w-0 break-words text-ink-muted">{t('notes')}: {r.notes}</div>}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {r.status === 'cleaning' && <Button size="sm" variant="secondary" data-testid="act-ready" onClick={() => ready(r.roomId)}>{td('ready')}</Button>}
                        <Button size="sm" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="report-open" onClick={() => setReporting(r.roomId)}>{td('report')}</Button>
                        <Link href="/calendar?view=timeline" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">{t('timeline')}</Link>
                      </div>
                      {reporting === r.roomId && <ReportForm roomId={r.roomId} room={r.code} onDone={() => setReporting(null)} onError={setError} />}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
        ))}
      </div>
    </div>
  );
}
