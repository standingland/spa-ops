import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/modules/identity/session';
import { clockCodeSchema } from '@/modules/staff-clock/model';

// A phone camera opens this route before the staff layout has a chance to
// redirect. Preserve only the clock code across the login screen.
export default async function ClockScanPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const [locale, params, session] = await Promise.all([getLocale(), searchParams, getSession()]);
  const code = clockCodeSchema.safeParse(params.code);
  const href = session
    ? { pathname: '/staff/clock', query: code.success ? { code: code.data } : {} }
    : { pathname: '/login', query: code.success ? { clock: code.data } : {} };
  redirect({ href, locale });
}
