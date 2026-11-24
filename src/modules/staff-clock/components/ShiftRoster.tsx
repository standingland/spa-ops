import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ClockSnapshot } from '../model';

/** Who is scheduled for the current shift and whether they have clocked in yet. Read-only, for the front desk. */
export async function ShiftRoster({ people, className, headingClassName }: {
  people: ClockSnapshot['coworkers'] | null; className?: string; headingClassName?: string;
}) {
  const t = await getTranslations('staffClock');
  const roles = await getTranslations('staff.roles');
  const order = { waiting: 0, working: 1, finished: 2 } as const;
  const sorted = people ? [...people].sort((a, b) => order[a.state] - order[b.state]) : [];
  return (
    <section aria-labelledby="staff-home-roster" className={className}>
      <h2 id="staff-home-roster" className={headingClassName}>{t('coworkers')}</h2>
      {!people ? <p role="status">{t('loadFailed')}</p>
        : sorted.length === 0 ? <p>{t('empty')}</p>
          : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="shift-roster">
              {sorted.map((person) => (
                <li key={person.user_id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
                  <Avatar name={person.display_name} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">{person.display_name}</strong>
                    <small>{roles(person.role)}</small>
                  </span>
                  <Badge className={person.state === 'working' ? 'bg-tint-available' : undefined}>{t(`status.${person.state}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}
