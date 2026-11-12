import type { PeakCell } from '../schema';

/** Weekday (rows) by hour (columns). Each cell prints its number; shade only repeats it. */
export function PeakGrid({ cells, weekday }: { cells: PeakCell[]; weekday: (dow: number) => string }) {
  const hours = cells.length ? Array.from({ length: Math.max(...cells.map((c) => c.hour)) - Math.min(...cells.map((c) => c.hour)) + 1 }, (_, i) => Math.min(...cells.map((c) => c.hour)) + i) : [];
  const max = Math.max(1, ...cells.map((c) => c.bookings));
  const at = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)?.bookings ?? 0;
  if (hours.length === 0) return null;
  return (
    <div tabIndex={0} className="overflow-x-auto rounded-[var(--radius)] border border-line bg-surface p-2">
      <table className="tnum border-collapse text-caption text-ink" data-testid="peak-grid">
        <thead><tr><th className="p-1" />{hours.map((h) => <th key={h} className="p-1 font-normal text-ink-muted">{String(h).padStart(2, '0')}</th>)}</tr></thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <tr key={d}>
              <th className="whitespace-nowrap p-1 text-left font-normal">{weekday(d)}</th>
              {hours.map((h) => {
                const v = at(d, h);
                return (
                  <td key={h} data-testid="peak-cell" data-dow={d} data-hour={h} data-count={v}
                    className="h-8 w-8 border border-line text-center text-ink" style={{ backgroundColor: v ? `rgba(79, 93, 47, ${0.12 + (v / max) * 0.5})` : undefined }}>
                    {v || '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
