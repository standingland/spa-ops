import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/shell/Icon';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import type { IconName } from '@/modules/identity/nav';
import { requireRole } from '@/modules/identity/session';

const topics = {
  clock: { icon: 'today', href: '/staff/clock' },
  daily: { icon: 'schedule', href: '/today' },
  treatment: { icon: 'rooms', href: '/today' },
  desk: { icon: 'bookings', href: '/calendar' },
  sick: { icon: 'bookings', href: '/staff/requests?type=sick' },
  shifts: { icon: 'schedule', href: '/staff/requests?type=shift' },
  management: { icon: 'settings', href: '/admin/staff-requests' },
  account: { icon: 'therapists', href: '/account' },
} satisfies Record<string, { icon: IconName; href: string }>;

export default async function StaffGuidePage() {
  const { role } = await requireRole();
  const [t, roles] = await Promise.all([getTranslations('staffGuide'), getTranslations('staff.roles')]);
  const visible: (keyof typeof topics)[] = ['clock', 'daily', role === 'therapist' ? 'treatment' : 'desk', 'sick', 'shifts'];
  const management = role === 'owner' || role === 'manager';
  if (management) visible.push('management');
  visible.push('account');

  return (
    <article className="mx-auto grid max-w-5xl gap-6">
      <header className="rounded-2xl bg-tint-available p-6 sm:p-8">
        <Badge className="bg-surface">{roles(role)}</Badge>
        <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 max-w-[65ch] text-body text-ink-muted">{t('intro')}</p>
      </header>
      <div className="grid items-start gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t('contents')} className="rounded-xl border border-line bg-surface p-3 md:sticky md:top-20">
          <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
            {visible.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="block min-h-11 rounded-md px-3 py-2.5 text-body hover:bg-tint-available">
                  {t(`${id}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-3">
          {visible.map((id) => {
            const { icon, href } = topics[id];
            const steps = t.raw(`${id}.steps`) as string[];
            return (
              <section key={id} id={id} aria-labelledby={`staff-guide-${id}`} className="scroll-mt-24">
                <Card className="grid gap-3 sm:p-6">
                  <h2 id={`staff-guide-${id}`} className="flex items-center gap-2 text-lg font-semibold">
                    <Icon name={icon} className="shrink-0" />
                    {t(`${id}.title`)}
                  </h2>
                  <ol className="list-decimal space-y-2 ps-5 text-body leading-relaxed text-ink">
                    {steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    <Link href={href} className="inline-flex min-h-11 items-center rounded-md bg-tint-available px-3 text-sm font-semibold hover:underline">
                      {t(`${id}.open`)}
                    </Link>
                    {id === 'management' && (
                      <>
                        <Link href="/admin/staff-clock" className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-semibold hover:underline">
                          {t('management.openQr')}
                        </Link>
                        <Link href="/admin/guide" className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-semibold hover:underline">
                          {t('management.adminGuide')}
                        </Link>
                      </>
                    )}
                  </div>
                </Card>
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}
