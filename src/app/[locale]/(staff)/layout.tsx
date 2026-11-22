import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBrand } from '@/lib/brand';
import { requireRole } from '@/modules/identity/session';
import { visibleAdminTools } from '@/modules/identity/nav';
import { getStaffNavigation } from '@/modules/identity/staffNavigation';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';
import { LiveStatus } from '@/modules/identity/components/LiveStatus';
import { ShellFrame } from '@/components/shell/ShellFrame';
import { NavList } from '@/components/shell/NavList';
import { WorkspaceHeader } from '@/components/shell/WorkspaceHeader';
import { Wordmark } from '@/components/shell/Wordmark';
import { Button } from '@/components/ui/button';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole();
  const [t, locale, groups] = await Promise.all([
    getTranslations('nav'),
    getLocale(),
    getStaffNavigation(session.role),
  ]);
  const brand = getBrand(process.env);

  async function signOut() {
    'use server';
    await (await createClient()).auth.signOut();
    redirect({ href: '/login', locale });
  }

  const labels = Object.fromEntries([
    ...groups.flatMap((group) => group.items.map((item) => [item.href, item.label])),
    ...visibleAdminTools(session.role).map((tool) => [tool.href, t(tool.id === 'settings' ? 'policies' : tool.id)]),
    ['/staff/requests', t('myStaffRequests')],
    ['/staff/clock', t('staffClock')],
    ['/staff/guide', t('staffGuide')],
    ['/account', t('account')],
  ]);

  return (
    <div className="staff-shell min-h-screen lg:flex">
      <ShellFrame brand={<Wordmark name={brand.name} tagline={brand.tagline} />} status={<LiveStatus />}>
        <NavList groups={groups} />
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          <LocaleSwitch />
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full" data-testid="sign-out">{t('signOut')}</Button>
          </form>
        </div>
      </ShellFrame>
      <div className="min-w-0 flex-1">
        <WorkspaceHeader workspace={t('workspace')} account={t('account')} labels={labels} />
        <main className="staff-main p-4 sm:p-6 xl:px-10 xl:py-8">{children}</main>
      </div>
    </div>
  );
}
