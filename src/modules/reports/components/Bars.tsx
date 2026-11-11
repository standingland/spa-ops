import { formatTHB } from '@/lib/money';

type Row = { label: string; a: number; b: number };

/** Paired horizontal bars (A beside B), made of CSS only. Every bar prints its figure as text as well. */
export function Bars({ rows, aLabel, bLabel }: { rows: Row[]; aLabel: string; bLabel: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="flex flex-col gap-3" data-testid="revenue-bars">
      <div className="flex gap-4 text-xs text-stone-dark">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-charcoal" aria-hidden />{aLabel}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-sage" aria-hidden />{bLabel}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} data-testid="bars-row" className="grid grid-cols-[6rem_1fr] items-center gap-x-3 text-xs">
          <span className="tnum font-medium">{r.label}</span>
          <div className="flex flex-col gap-1">
            {[{ v: r.a, c: 'bg-charcoal' }, { v: r.b, c: 'bg-sage' }].map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`h-3 rounded-sm ${x.c}`} style={{ width: `${(x.v / max) * 100}%`, minWidth: x.v > 0 ? 2 : 0 }} />
                <span className="tnum whitespace-nowrap">{formatTHB(x.v)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
