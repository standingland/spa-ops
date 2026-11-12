'use client';

import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { Attention } from '../today';

export type Names = { services: Record<string, string>; therapists: Record<string, string>; rooms: Record<string, string> };
export type OpenReport = { id: string; roomId: string; note: string };

/** Everything that needs a person: ordered by the model (priority, then age). */
export function AttentionList({ items, rows, names, reports, shared, onOpen, onResolve }: {
  items: Attention[]; rows: BoardRow[]; names: Names; reports: OpenReport[]; shared: boolean;
  onOpen?: (item: Attention) => void; onResolve?: (reportId: string) => void;
}) {
  const t = useTranslations('today');
  const te = useTranslations();
  if (items.length === 0) return <EmptyState>{t('nothing')}</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a, i) => {
        const r = a.bookingId ? rows.find((x) => x.bookingId === a.bookingId) : undefined;
        const who = r ? (shared ? names.services[r.serviceId] : r.customerDisplayName) : '';
        const room = a.roomId ? names.rooms[a.roomId] : r ? names.rooms[r.roomId] : '';
        const clickable = a.kind === 'needs_reassignment' && onOpen;
        const roomReports = a.kind === 'room_report' ? reports.filter((x) => x.roomId === a.roomId) : [];
        return (
          <li key={`${a.kind}-${a.bookingId ?? a.roomId}-${i}`} data-testid="attention-item" data-kind={a.kind}
            onClick={clickable ? () => onOpen(a) : undefined}
            className={`min-w-0 rounded-[var(--radius)] border border-danger bg-surface p-3 text-caption text-ink ${clickable ? 'cursor-pointer' : ''}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 break-words">
              <strong>{t(`kind.${a.kind}`)}</strong>
              {who && <span className="min-w-0 break-words">{who}</span>}
              {room && <span className="tnum">{room}</span>}
              <span className="tnum text-ink-muted">{formatTime(a.since)}</span>
            </div>
            {roomReports.map((rep) => (
              <div key={rep.id} className="mt-1 flex flex-wrap items-center gap-3 text-ink-muted">
                <span className="min-w-0 break-words">{rep.note}</span>
                {onResolve && <Button variant="link" size="sm" className="min-h-11 px-2 pointer-fine:min-h-0" data-testid="report-resolve" onClick={(e) => { e.stopPropagation(); onResolve(rep.id); }}>{te('exceptions.resolve')}</Button>}
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
