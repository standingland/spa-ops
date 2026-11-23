'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { activeHref } from '@/modules/identity/nav';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from './Icon';

export function WorkspaceHeader({ workspace, account, name, notifications, labels }: {
  workspace: string;
  account: string;
  name: string;
  notifications?: string;
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
      <div className="workspace-controls">
        {notifications && (
          <Link href="/admin/notifications" className="workspace-notifications" aria-label={notifications} title={notifications}>
            <Icon name="bell" />
          </Link>
        )}
        <Link href="/account" data-testid="nav-account" className="workspace-account">
          <span aria-hidden="true"><Avatar name={name} size="sm" className="workspace-avatar" /></span>
          <span>{account}</span>
          <Icon name="chevron" className="workspace-account-chevron" />
        </Link>
      </div>
    </header>
  );
}
