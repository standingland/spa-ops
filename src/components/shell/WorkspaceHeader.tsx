'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { activeHref } from '@/modules/identity/nav';
import { Icon } from './Icon';

export function WorkspaceHeader({ workspace, account, labels }: {
  workspace: string;
  account: string;
  labels: Record<string, string>;
}) {
  const pathname = usePathname();
  const active = activeHref(pathname, Object.keys(labels));

  return (
    <header className="workspace-header">
      <div className="workspace-location">
        <span>{workspace}</span>
        {active && <><span aria-hidden="true">/</span><strong>{labels[active]}</strong></>}
      </div>
      <Link href="/account" data-testid="nav-account" className="workspace-account">
        <Icon name="therapists" />
        <span>{account}</span>
      </Link>
    </header>
  );
}
