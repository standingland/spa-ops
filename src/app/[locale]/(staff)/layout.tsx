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
import { BanyanMark } from '@/components/shell/BanyanMark';
import { Button } from '@/components/ui/button';
import './workspace.css';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole();
  const [t, roles, locale, groups] = await Promise.all([
    getTranslations('nav'),
    getTranslations('staff.roles'),
    getLocale(),
    getStaffNavigation(session.role),
  ]);
  const brand = getBrand(process.env);
  const tools = visibleAdminTools(session.role);

  async function signOut() {
    'use server';
    await (await createClient()).auth.signOut();
    redirect({ href: '/login', locale });
  }

  const labels = Object.fromEntries([
    ...groups.flatMap((group) => group.items.map((item) => [item.href, item.label])),
    ...(tools.length ? [['/admin', t('group.management')]] : []),
    ...tools.map((tool) => [tool.href, t(tool.id === 'settings' ? 'policies' : tool.id)]),
    ['/staff/requests', t('myStaffRequests')],
    ['/staff/clock', t('staffClock')],
    ['/staff/guide', t('staffGuide')],
    ['/account', t('account')],
  ]);

  return (
    <div className="staff-shell min-h-screen lg:flex">
      <ShellFrame brand={<><BanyanMark className="staff-mark" /><Wordmark name={brand.name} tagline={brand.tagline} /></>} status={<LiveStatus />}>
        <NavList groups={groups} />
        <div className="staff-sidebar-controls mt-auto flex flex-col gap-2 pt-4">
          <LocaleSwitch />
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="w-full" data-testid="sign-out">{t('signOut')}</Button>
          </form>
        </div>
      </ShellFrame>
      <div className="min-w-0 flex-1">
        <WorkspaceHeader
          workspace={t('workspace')}
          account={t('account')}
          name={session.displayName || roles(session.role)}
          notifications={tools.some((tool) => tool.id === 'notifications') ? t('notifications') : undefined}
          labels={labels}
        />
        <main className="staff-main">{children}</main>
      </div>
    </div>
  );
}
