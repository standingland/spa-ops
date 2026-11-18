import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/shell/Icon';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/modules/identity/session';

const topics = [
  {
    id: 'setup',
    links: [
      { label: 'adminRooms', href: '/admin/rooms' },
      { label: 'services', href: '/admin/services' },
      { label: 'therapists', href: '/admin/therapists' },
    ],
  },
  { id: 'booking', links: [{ label: 'schedule', href: '/calendar' }] },
  {
    id: 'visit',
    links: [{ label: 'today', href: '/today' }, { label: 'rooms', href: '/rooms' }],
  },
  { id: 'guests', links: [{ label: 'guests', href: '/customers' }] },
  { id: 'payments', links: [{ label: 'payments', href: '/payments' }] },
  {
    id: 'stock',
    links: [{ label: 'inventory', href: '/inventory' }, { label: 'earnings', href: '/earnings' }],
  },
] as const;

const ownerTopic = {
  id: 'owner',
  links: [{ label: 'staff', href: '/admin/staff' }, { label: 'policies', href: '/admin/settings' }],
} as const;

export default async function AdminGuidePage() {
  const { role } = await requireRole('owner', 'manager');
  const t = await getTranslations('adminGuide');
  const nav = await getTranslations('nav');
  const visibleTopics = role === 'owner' ? [...topics, ownerTopic] : topics;

  return (
    <div className="admin-hub">
      <header className="admin-intro">
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
          <span aria-hidden="true">←</span> {t('back')}
        </Link>
        <h1>{nav('guide')}</h1>
        <p>{t('intro')}</p>
      </header>
      <div className="max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface px-4 sm:px-7">
        {visibleTopics.map(({ id, links }) => (
          <section key={id} aria-labelledby={`guide-${id}`} className="py-5">
            <h2 id={`guide-${id}`} className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="guide" className="shrink-0 text-primary" />
              {t(`${id}.title`)}
            </h2>
            <p className="mt-2 max-w-[65ch] leading-relaxed text-ink-muted">{t(`${id}.body`)}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {links.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="inline-flex min-h-11 items-center rounded-lg bg-tint-available px-3 text-sm font-medium text-primary hover:underline">
                    {nav(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
