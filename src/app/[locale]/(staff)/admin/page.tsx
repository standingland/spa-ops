import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/modules/identity/session';
import { visibleAdminTools } from '@/modules/identity/nav';
import { Icon } from '@/components/shell/Icon';
import type { AdminTool, IconName } from '@/modules/identity/nav';

const toolIcons: Record<AdminTool['id'], IconName> = {
  adminRooms: 'rooms', services: 'bookings', notifications: 'bookings',
  staff: 'guests', settings: 'settings', guide: 'guide',
};

export default async function AdminHubPage() {
  const session = await requireRole('owner', 'manager');
  const t = await getTranslations('nav');
  const h = await getTranslations('adminHub');
  const tools = visibleAdminTools(session.role);
  return (
    <div className="admin-hub">
      <header className="admin-intro">
        <span className="admin-eyebrow">MANAGEMENT / WORKSPACE</span>
        <h1>{t('settings')}</h1>
        <p>{h('subtitle')}</p>
      </header>
      <section className="admin-hero" aria-labelledby="admin-hero-title">
        <div>
          <span className="admin-eyebrow">SPA MANAGEMENT</span>
          <h2 id="admin-hero-title">{t('settings')}</h2>
          <p>{h('subtitle')}</p>
        </div>
        <div className="admin-hero-mark" aria-hidden="true"><Icon name="settings" /></div>
      </section>
      <ul className="admin-tools">
        {tools.map((tool) => (
          <li key={tool.id}>
            <Link href={tool.href} data-testid={`admin-tool-${tool.id}`} className="admin-tool">
              <span className="admin-tool-icon"><Icon name={toolIcons[tool.id]} /></span>
              <span className="admin-tool-copy">
                <span className="admin-tool-title">{t(tool.id === 'settings' ? 'policies' : tool.id)}</span>
                <span className="admin-tool-description">{h(`desc.${tool.id}`)}</span>
              </span>
              <span className="admin-tool-arrow" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
