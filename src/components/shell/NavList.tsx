'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { activeHref, type IconName } from '@/modules/identity/nav';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

type Item = { id: string; href: string; label: string; icon: IconName };
type Group = { id: string; label: string; items: Item[] };

export function NavList({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, groups.flatMap((g) => g.items.map((i) => i.href)));
  return (
    <nav className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-1">
          <h2 className="px-3 text-caption font-medium uppercase tracking-wide text-ink-muted">{g.label}</h2>
          <ul className="flex flex-col gap-1">
            {g.items.map((i) => {
              const current = i.href === active;
              return (
                <li key={i.id}>
                  <Link
                    href={i.href}
                    data-testid={`nav-${i.id}`}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-[var(--radius)] border-l-4 px-3 text-body text-ink',
                      current ? 'border-primary bg-tint-available font-medium' : 'border-transparent hover:bg-surface-muted',
                    )}
                  >
                    <Icon name={i.icon} className="shrink-0" />
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
