import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { parseEnv } from '@/lib/env';
import { SESSION_COOKIE } from '@/modules/public/http';
import { verifySession } from '@/modules/public/session';
import { getMyAppointments } from '@/modules/care/actions';
import { MyAppointments } from '@/modules/care/components/MyAppointments';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

export default async function MinePage({ searchParams }: { searchParams: Promise<{ page?: string; error?: string }> }) {
  const t = await getTranslations('care'); const locale = await getLocale(); const sp = await searchParams;
  let hasLine = false;
  try { hasLine = Boolean(parseEnv(process.env).line); } catch { hasLine = false; }
  if (!hasLine) return <Alert>{t('lineUnavailable')}</Alert>;
  const guest = verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  if (!guest) return <div className="mx-auto flex max-w-xl flex-col gap-5"><h1 className="font-serif text-title">{t('profile')}</h1><p>{t('signInHelp')}</p>{sp.error && <Alert tone="error">{t('loginFailed')}</Alert>}<a className={buttonVariants({})} href={`/api/line/login?returnTo=/${locale}/book/mine`}>{t('signIn')}</a></div>;
  const page = /^\d+$/.test(sp.page ?? '') ? Math.min(Number(sp.page), 100000) : 0;
  const r = await getMyAppointments(page);
  return r.ok ? <MyAppointments data={r.appointments} page={page} name={guest.name} /> : <Alert tone="error">{t('loadFailed')}</Alert>;
}
