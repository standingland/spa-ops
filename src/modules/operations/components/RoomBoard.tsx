'use client';

import { useMemo, useState } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { Alert } from '@/components/ui/alert';
import { StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
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
    if (!r.ok) { setError(errorText(te(uiErrorKey(r.code)), r)); return; }
    router.refresh();
  }

  const oneTime = (r: RoomTile) => {
    const iso = r.status === 'occupied' ? r.expectedEnd : r.status === 'cleaning' ? r.turnoverDueAt : r.nextStartsAt;
    return iso ? formatTime(iso) : t('none');
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={t('title')}
        actions={<Button variant="secondary" size="sm" data-testid="compact-toggle" aria-pressed={f.compact} onClick={() => update({ ...f, compact: !f.compact })}>{f.compact ? t('full') : t('compact')}</Button>} />

      <div className="grid gap-2 rounded-[var(--radius)] border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      <section aria-label={t('summary')} className="flex flex-wrap gap-2 text-caption" data-testid="room-summary">
        {STATUSES.map((k) => (
          <span key={k} className="flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-1.5 text-ink">
            <StatusDot status={k} />{s(ROOM_STATUS_KEY[k])} <strong className="tnum">{summary.byStatus[k]}</strong>
          </span>
        ))}
        {summary.byZone.map((z) => (
          <span key={z.zone ?? '—'} className="rounded-[var(--radius)] border border-line bg-surface px-3 py-1.5 text-ink-muted">
            {z.zone ?? t('noZone')}: <strong className="tnum">{z.occupied}/{z.total}</strong> {t('occupiedOf')}
          </span>
        ))}
      </section>

      {error && <Alert tone="error"><ErrorText text={error} /></Alert>}

      {groups.map(([zone, list]) => (
        <section key={zone ?? '—'} aria-label={zone ?? t('noZone')}>
          <h2 className="mb-2 font-serif text-heading text-ink" data-testid="zone-heading">{zone ?? t('noZone')}</h2>
          <ul className={`grid gap-3 ${f.compact ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
            {list.map((r) => (
              <li key={r.roomId} data-testid="room-tile" data-code={r.code} data-status={r.status} className="min-w-0">
                <Card className="flex h-full min-w-0 flex-col gap-1 p-3 text-body">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusDot status={r.status} />
                    <span className="min-w-0 break-words font-semibold text-ink">{r.code}</span>
                    {f.compact
                      ? <span className="text-caption text-ink-muted" data-testid="tile-status-label">{s(ROOM_STATUS_KEY[r.status])}</span>
                      : <span className={roomStatusStyle(r.status).chip} data-testid="tile-status-label">{s(ROOM_STATUS_KEY[r.status])}</span>}
                    {f.compact && <span className="tnum ml-auto text-caption text-ink">{oneTime(r)}</span>}
                  </div>
                  {!f.compact && (
                    <>
                      <div className="min-w-0 break-words text-ink-muted">{r.displayName}</div>
                      {r.status === 'occupied' && (
                        <div className="min-w-0 break-words">{r.currentCustomerDisplayName ? `${r.currentCustomerDisplayName} · ` : ''}{r.currentTherapistId ? therapists[r.currentTherapistId] : ''}
                          {' · '}{t('expectedEnd')} <span className="tnum">{r.expectedEnd ? formatTime(r.expectedEnd) : t('none')}</span></div>
                      )}
                      {r.nextStartsAt && <div>{t('next')} <span className="tnum">{formatTime(r.nextStartsAt)}</span></div>}
                      {r.status === 'cleaning' && r.turnoverDueAt && (
                        <div>{r.turnoverStartedAt ? <>{t('turnover')} <span className="tnum">{formatTime(r.turnoverStartedAt)}</span> · </> : null}{t('due')} <span className="tnum">{formatTime(r.turnoverDueAt)}</span></div>
                      )}
                      {r.blockKind && r.status !== 'available' && <div className="min-w-0 break-words">{t('blocked')}: {r.blockNote ?? r.blockKind}</div>}
                      {r.openReports > 0 && <div data-testid="open-reports">{t('reports')}: <strong className="tnum">{r.openReports}</strong></div>}
                      {showNotes && r.notes && <div className="min-w-0 break-words text-ink-muted">{t('notes')}: {r.notes}</div>}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {r.status === 'cleaning' && <Button size="sm" variant="secondary" data-testid="act-ready" onClick={() => ready(r.roomId)}>{td('ready')}</Button>}
                        <Button size="sm" variant="link" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="report-open" onClick={() => setReporting(r.roomId)}>{td('report')}</Button>
                        <Link href="/calendar?view=rooms" className="inline-flex min-h-11 items-center px-2 text-primary underline pointer-fine:min-h-0">{t('timeline')}</Link>
                      </div>
                      {reporting === r.roomId && <ReportForm roomId={r.roomId} room={r.code} onDone={() => setReporting(null)} onError={setError} />}
                    </>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
