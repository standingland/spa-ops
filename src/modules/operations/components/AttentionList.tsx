'use client';

import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import type { Attention } from '../today';

export type Names = { services: Record<string, string>; therapists: Record<string, string>; rooms: Record<string, string> };
export type OpenReport = { id: string; roomId: string; note: string };

/** Everything that needs a person: ordered by the model (priority, then age). */
export function AttentionList({ items, rows, names, reports, shared, onOpen, renderExtra }: {
  items: Attention[]; rows: BoardRow[]; names: Names; reports: OpenReport[]; shared: boolean;
  onOpen?: (item: Attention) => void; renderExtra?: (item: Attention) => React.ReactNode;
}) {
  const t = useTranslations('today');
  if (items.length === 0) return <p className="text-sm text-stone-dark">{t('nothing')}</p>;
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
            className={`rounded border border-clay bg-white p-3 text-sm ${clickable ? 'cursor-pointer' : ''}`}>
            <div className="flex flex-wrap items-center gap-3">
              <strong>{t(`kind.${a.kind}`)}</strong>
              {who && <span>{who}</span>}
              {room && <span className="tnum">{room}</span>}
              <span className="tnum text-stone-dark">{formatTime(a.since)}</span>
            </div>
            {roomReports.map((rep) => <div key={rep.id} className="mt-1 text-stone-dark">{rep.note}</div>)}
            {renderExtra?.(a)}
          </li>
        );
      })}
    </ul>
  );
}
