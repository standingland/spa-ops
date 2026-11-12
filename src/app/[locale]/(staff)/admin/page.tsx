import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/modules/identity/session';
import { visibleAdminTools } from '@/modules/identity/nav';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

export default async function AdminHubPage() {
  const session = await requireRole('owner', 'manager');
  const t = await getTranslations('nav');
  const h = await getTranslations('adminHub');
  const tools = visibleAdminTools(session.role);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings')} subtitle={h('subtitle')} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <li key={tool.id}>
            <Link href={tool.href} data-testid={`admin-tool-${tool.id}`} className="block h-full">
              <Card className="h-full hover:bg-surface-muted">
                <span className="block font-serif text-lg text-ink">{t(tool.id === 'settings' ? 'policies' : tool.id)}</span>
                <span className="mt-1 block text-body text-ink-muted">{h(`desc.${tool.id}`)}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
