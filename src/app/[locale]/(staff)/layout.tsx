import { getTranslations, getLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireRole, type Role } from '@/modules/identity/session';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';

const NAV: { href: '/calendar' | '/admin/rooms' | '/admin/services' | '/admin/therapists' | '/admin/staff'; key: string; roles: Role[] }[] = [
  { href: '/calendar', key: 'calendar', roles: ['owner', 'manager', 'receptionist', 'therapist'] },
  { href: '/admin/rooms', key: 'rooms', roles: ['owner', 'manager'] },
  { href: '/admin/services', key: 'services', roles: ['owner', 'manager'] },
  { href: '/admin/therapists', key: 'therapists', roles: ['owner', 'manager'] },
  { href: '/admin/staff', key: 'staff', roles: ['owner'] },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole();
  const t = await getTranslations('nav');
  const locale = await getLocale();

  async function signOut() {
    'use server';
    await (await createClient()).auth.signOut();
    redirect({ href: '/login', locale });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-stone bg-white px-4 py-3">
        <span className="font-serif text-lg">Spa Ops</span>
        <nav className="flex flex-wrap gap-4 text-sm">
          {NAV.filter((n) => n.roles.includes(session.role)).map((n) => (
            <Link key={n.href} href={n.href} className="hover:underline">{t(n.key)}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <LocaleSwitch />
          <form action={signOut}><button className="text-sm underline" data-testid="sign-out">{t('signOut')}</button></form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
