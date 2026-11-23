'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { usePanelBehavior } from '@/lib/usePanelBehavior';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

/**
 * One <aside>: a top block (brand, status, menu button below lg) and a panel that CSS always shows at lg+
 * and that below lg is shown only while open. A single DOM, so test ids stay unique.
 */
export function ShellFrame({ brand, status, children }: { brand: ReactNode; status: ReactNode; children: ReactNode }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  // Close after navigating. Setting state while the pathname changes is the render-time reset pattern.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) { setSeen(pathname); setOpen(false); }

  usePanelBehavior(open, () => setOpen(false), button);

  return (
    <aside className="staff-sidebar z-40 sticky top-0 border-b border-line lg:flex lg:h-dvh lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:px-5 lg:pb-7 lg:pt-6">
          <div className="staff-brand min-w-0 flex-1 lg:w-full">{brand}</div>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            <button
              ref={button}
              data-testid="menu-button"
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={open ? t('closeMenu') : t('menu')}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius)] border border-line-strong bg-surface text-ink lg:hidden"
            >
              <Icon name={open ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        <div
          id={panelId}
          className={cn('staff-sidebar-panel flex-col gap-4 overflow-y-auto px-3 pb-4 max-lg:max-h-[calc(100dvh-4.5rem)] lg:flex lg:flex-1 lg:pb-5', open ? 'flex' : 'max-lg:hidden')}
        >
          {children}
        </div>
    </aside>
  );
}
