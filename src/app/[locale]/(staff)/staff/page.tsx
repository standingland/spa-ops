import { getLocale, getTranslations } from 'next-intl/server';
import { Icon } from '@/components/shell/Icon';
import { Avatar } from '@/components/ui/avatar';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay } from '@/lib/time';
import { listDailyNoteBoard } from '@/modules/daily-notes/actions';
import { DailyNotesManager } from '@/modules/daily-notes/components/DailyNotesManager';
import { requireRole } from '@/modules/identity/session';
import type { IconName } from '@/modules/identity/nav';
import { getStaffNavigation } from '@/modules/identity/staffNavigation';
import { getToday } from '@/modules/operations/actions';
import { PHOTO_BUCKET } from '@/modules/therapists/photo';
import styles from './staff-home.module.css';

/** Tile colour by kind of work: time & schedule, guests, rooms, money, stock, people. */
const TONES: Record<string, string> = {
  schedule: 'time', today: 'time',
  guests: 'guest', waitlist: 'guest', bookings: 'guest',
  rooms: 'room',
  payments: 'money', earnings: 'money',
  inventory: 'stock',
  therapists: 'people', overview: 'review', reports: 'people', settings: 'review',
};

export default async function StaffHomePage() {
  const session = await requireRole();
  const supabase = await createClient();
  const canReview = session.role === 'manager' || session.role === 'owner';
  const [t, roles, locale, groups, therapist, pending, nav, today, hubDesc, operations, board] = await Promise.all([
    getTranslations('staffHome'),
    getTranslations('staff.roles'),
    getLocale(),
    getStaffNavigation(session.role),
    supabase.from('therapists').select('photo_path').eq('staff_user_id', session.userId).maybeSingle(),
    canReview ? supabase.from('staff_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending') : null,
    getTranslations('nav'),
    getTranslations('today'),
    getTranslations('adminHub.desc'),
    getToday(),
    listDailyNoteBoard(),
  ]);

  const role = roles(session.role);
  const name = session.displayName || role;
  const photoPath = therapist.data?.photo_path;
  // The staff session selects only its linked portrait. The private bucket's
  // general read policy stays limited to management.
  const photo = photoPath
    ? await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrl(photoPath, 3600)
    : null;
  const now = operations.ok ? new Date(operations.now) : new Date();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(now);
  const model = operations.ok ? operations.model : null;
  const metrics: { id: 'bookings' | 'rooms' | 'therapists' | 'attention'; label: string; value: number; total?: number; href: string; icon: IconName }[] = model ? [
    { id: 'bookings', label: today('reservations'), value: model.counts.reservations, href: '/today', icon: 'today' },
    { id: 'rooms', label: t('summary.availableRooms'), value: model.counts.available, total: model.rooms.length, href: '/rooms', icon: 'rooms' },
    { id: 'therapists', label: today('therapistsOnShift'), value: model.therapists.length, href: canReview ? '/admin/therapists' : '/today', icon: 'therapists' },
    { id: 'attention', label: t('summary.attention'), value: model.attention.length, href: '/today', icon: 'checklist' },
  ] : [];
  const navigation = groups.map((group) => (
    <section key={group.id} aria-labelledby={`staff-home-${group.id}`} className={styles.section}>
      <h2 id={`staff-home-${group.id}`}>{group.label}</h2>
      <ul className={styles.menu}>
        {group.items.filter(({ id }) => id !== 'staffHome' && id !== 'today').map((item) => (
          <li key={item.id}>
            <Link href={item.id === 'schedule' ? { pathname: item.href, query: { view: 'timeline' } } : item.href}
              className={styles.tile} data-tone={TONES[item.id] ?? 'time'} data-testid={`staff-home-${item.id}`}>
              <span className={styles.icon}><Icon name={item.icon} /></span>
              <span>
                <strong>{item.label}</strong>
                <small>{t(`menu.${item.id}`)}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ));

  return (
    <div className={styles.home} data-staff-home="">
      <header className={styles.welcome}>
        <div className={styles.profile}>
          <div className={styles.portrait} aria-hidden="true" data-testid="staff-home-portrait">
            <Avatar name={name} src={photo?.data?.signedUrl} className={styles.avatar} />
          </div>
          <div className={styles.intro}>
            <time dateTime={bangkokDay(now)}>{date}</time>
            <h1>{t('welcome', { name })}</h1>
            <p>{role}</p>
            <div className={styles.actions}>
              <Link href="/today" className={styles.today} data-testid="staff-home-today">
                <Icon name="today" />
                {t('openToday')}
              </Link>
              <Link href="/staff/guide" className={styles.guide}>
                <Icon name="guide" />
                {t('openGuide')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {model ? (
        <ul aria-label={t('summary.label')} className={styles.metrics}>
          {metrics.map(({ id, label, value, total, href, icon }) => (
            <li key={id}>
              <Link href={href} className={styles.metric}>
                <Icon name={icon} />
                <span className={styles.metricContent}>
                  <span className={styles.metricLabel}>{label}</span>
                  <span className={styles.metricDetails}>
                    <span>{t.rich(`summary.units.${id}`, { count: value, value: (text) => <strong>{text}</strong> })}</span>
                    {total !== undefined && <small>{t('summary.roomTotal', { count: total })}</small>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.notice} role="status">{t('summary.unavailable')}</p>
      )}

      <DailyNotesManager
        notes={board.ok ? board.notes : null}
        canPost={session.role === 'owner'}
        discussion={board.ok ? board.replies : null}
      />

      {canReview && navigation}
      <section aria-labelledby="staff-home-requests" className={styles.section}>
        <h2 id="staff-home-requests">{t('requests')}</h2>
        <ul className={styles.menu}>
          <li>
            <Link href="/staff/clock" className={styles.tile} data-tone="money">
              <span className={styles.icon}><Icon name="today" /></span>
              <span>
                <strong>{t('clock.title')}</strong>
                <small>{t('clock.description')}</small>
              </span>
            </Link>
          </li>
          {(['sick', 'shift'] as const).map((type) => (
            <li key={type}>
              <Link href={{ pathname: '/staff/requests', query: { type } }} className={styles.tile} data-tone={type === 'sick' ? 'leave' : 'swap'}>
                <span className={styles.icon}><Icon name={type === 'sick' ? 'bookings' : 'schedule'} /></span>
                <span>
                  <strong>{t(`request.${type}.title`)}</strong>
                  <small>{t(`request.${type}.description`)}</small>
                </span>
              </Link>
            </li>
          ))}
          {canReview && <li>
            <Link href="/admin/staff-requests" className={styles.tile} data-tone="review">
              <span className={styles.icon}><Icon name="guests" /></span>
              <span>
                <strong>{t('request.review.title')}</strong>
                <small>{pending?.count ? t('request.review.pending', { count: pending.count }) : t('request.review.description')}</small>
              </span>
            </Link>
          </li>}
          {canReview && <li>
            <Link href="/admin/staff-clock" className={styles.tile} data-tone="review">
              <span className={styles.icon}><Icon name="today" /></span>
              <span>
                <strong>{t('clock.qrTitle')}</strong>
                <small>{t('clock.qrDescription')}</small>
              </span>
            </Link>
          </li>}
        </ul>
      </section>

      <section aria-labelledby="staff-home-account" className={styles.section}>
        <h2 id="staff-home-account">{t('account.heading')}</h2>
        <ul className={`${styles.menu} ${styles.accountMenu}`}>
          <li>
            <Link href="/account" className={styles.tile} data-tone="neutral" data-testid="staff-home-account">
              <span className={styles.icon}><Icon name="settings" /></span>
              <span>
                <strong>{t('account.title')}</strong>
                <small>{t('account.description')}</small>
              </span>
            </Link>
          </li>
          {canReview && <li>
            <Link href="/admin/guide" className={styles.tile} data-tone="guide" data-testid="staff-home-system-guide">
              <span className={styles.icon}><Icon name="guide" /></span>
              <span>
                <strong>{nav('guide')}</strong>
                <small>{hubDesc('guide')}</small>
              </span>
            </Link>
          </li>}
        </ul>
      </section>

      {!canReview && navigation}
    </div>
  );
}
