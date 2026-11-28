import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { parseEnv } from '@/lib/env';
import { SESSION_COOKIE } from '@/modules/public/http';
import { verifySession } from '@/modules/public/session';
import { getMyAppointments } from '@/modules/care/actions';
import { MyAppointments } from '@/modules/care/components/MyAppointments';
import { Alert } from '@/components/ui/alert';
import styles from '@/modules/care/components/mine.module.css';

export default async function MinePage({ searchParams }: { searchParams: Promise<{ page?: string; error?: string }> }) {
  const t = await getTranslations('care'); const locale = await getLocale(); const sp = await searchParams;
  let hasLine = false;
  try { hasLine = Boolean(parseEnv(process.env).line); } catch { hasLine = false; }
  if (!hasLine) return <Alert>{t('lineUnavailable')}</Alert>;
  const guest = verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  if (!guest) return <div className={styles.page}>
    <div className={styles.hero}><div><h1>{t('profile')}</h1><p>{t('signInHelp')}</p></div><div className={styles.heroAside}>{t('timezone')}</div></div>
    <div className={styles.signin}><div className={styles.signinCopy}>{sp.error && <Alert tone="error">{t('loginFailed')}</Alert>}<a className={styles.cta} href={`/api/line/login?returnTo=/${locale}/book/mine`}>{t('signIn')}</a></div><div className={styles.signinPanel}>{t('timezone')}</div></div>
  </div>;
  const page = /^\d+$/.test(sp.page ?? '') ? Math.min(Number(sp.page), 100000) : 0;
  const r = await getMyAppointments(page);
  return r.ok ? <MyAppointments data={r.appointments} page={page} name={guest.name} /> : <Alert tone="error">{t('loadFailed')}</Alert>;
}


