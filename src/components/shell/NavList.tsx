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
  const links = (items: Item[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((i) => {
        const current = i.href === active;
        return (
          <li key={i.id}>
            <Link
              href={i.href}
              data-testid={`nav-${i.id}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl border-l-4 px-3 text-body text-ink transition-colors',
                current ? 'border-primary bg-tint-available font-semibold' : 'border-transparent hover:bg-surface-muted',
              )}
            >
              <Icon name={i.icon} className="shrink-0" />
              <span className="truncate">{i.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="flex flex-col gap-4">
      {groups.map((g) => g.id === 'management' ? (
        <details
          key={`${g.id}:${pathname}`}
          open={g.items.some((i) => i.href === active)}
          className="group border-t border-line pt-3"
          data-testid="management-menu"
        >
          <summary
            data-testid="management-toggle"
            className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[var(--radius)] border-l-4 border-transparent px-3 text-body text-ink hover:bg-surface-muted [&::-webkit-details-marker]:hidden"
          >
            <Icon name="settings" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{g.label}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="shrink-0 group-open:rotate-180">
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </summary>
          <div className="mt-1 pl-3">{links(g.items)}</div>
        </details>
      ) : (
        <div key={g.id} className="flex flex-col gap-1">
          <h2 className="px-4 pb-2 text-caption font-medium text-ink-muted">{g.label}</h2>
          {links(g.items)}
        </div>
      ))}
    </nav>
  );
}
