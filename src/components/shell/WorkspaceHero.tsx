import type { ReactNode } from 'react';
import type { IconName } from '@/modules/identity/nav';
import { Icon } from './Icon';

export function WorkspaceHero({ title, description, icon, detail, actions }: {
  title: string;
  description: string;
  icon?: IconName;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-hero">
      {icon && <span className="workspace-hero-icon"><Icon name={icon} /></span>}
      <div className="workspace-hero-text">
        {detail && <div className="workspace-hero-detail">{detail}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="workspace-hero-actions">{actions}</div>}
    </header>
  );
}
