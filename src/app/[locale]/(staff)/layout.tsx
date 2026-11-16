import { getTranslations, getLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBrand } from '@/lib/brand';
import { requireRole } from '@/modules/identity/session';
import { visibleNav } from '@/modules/identity/nav';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';
import { LiveStatus } from '@/modules/identity/components/LiveStatus';
import { ShellFrame } from '@/components/shell/ShellFrame';
import { NavList } from '@/components/shell/NavList';
import { Wordmark } from '@/components/shell/Wordmark';
import { Button } from '@/components/ui/button';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole();
  const t = await getTranslations('nav');
  const locale = await getLocale();
  const brand = getBrand(process.env);
  // The owner can switch reports off for managers; hide the link then (the database refuses either way).
  let managerReports = true;
  if (session.role === 'manager') {
    const { data } = await (await createClient()).rpc('get_settings');
    managerReports = (data as Record<string, unknown> | null)?.['reports.manager_can_view'] !== false;
  }

  async function signOut() {
    'use server';
    await (await createClient()).auth.signOut();
    redirect({ href: '/login', locale });
  }

  const groups = visibleNav(session.role, { managerReports }).map((g) => ({
    id: g.id,
    label: t(`group.${g.id}`),
    items: g.items.map((i) => ({ id: i.id, href: i.href, label: t(i.id), icon: i.icon })),
  }));

  return (
    <div className="staff-shell min-h-screen lg:flex">
      <ShellFrame brand={<Wordmark name={brand.name} tagline={brand.tagline} />} status={<LiveStatus />}>
        <NavList groups={groups} />
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          <LocaleSwitch />
          <Link
            href="/account"
            data-testid="nav-account"
            className="flex min-h-11 items-center rounded-[var(--radius)] px-3 text-body text-ink hover:bg-surface-muted"
          >
            <span className="truncate">{t('account')}</span>
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full" data-testid="sign-out">{t('signOut')}</Button>
          </form>
        </div>
      </ShellFrame>
      <main className="staff-main min-w-0 flex-1 p-4 sm:p-6 xl:px-10 xl:py-8">{children}</main>
    </div>
  );
}
