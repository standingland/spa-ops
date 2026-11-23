import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay } from '@/lib/time';
import { requireRole } from '@/modules/identity/session';
import { visibleAdminTools, type AdminTool, type IconName } from '@/modules/identity/nav';
import { getStaffNavigation } from '@/modules/identity/staffNavigation';
import { getBoard } from '@/modules/booking/actions';
import { RoomTimeline } from '@/modules/booking/components/RoomTimeline';
import { getToday } from '@/modules/operations/actions';
import { listDailyNotes } from '@/modules/daily-notes/actions';
import { DailyNotesManager } from '@/modules/daily-notes/components/DailyNotesManager';
import { Icon } from '@/components/shell/Icon';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { ROOM_STATUS_KEY } from '@/components/ui/status';
import { StatusChip } from '@/components/ui/badge';
import styles from './dashboard.module.css';

const toolIcons: Record<AdminTool['id'], IconName> = {
  staffRequests: 'schedule',
  staffClockQr: 'today',
  adminRooms: 'rooms', services: 'bookings', notifications: 'bookings', applications: 'guests',
  staff: 'guests', settings: 'settings', guide: 'guide',
};

export default async function AdminHubPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const session = await requireRole('owner', 'manager');
  const { by } = await searchParams;
  const timelineBy = by === 'therapist' ? 'therapist' : 'room';
  const [locale, nav, t, today, booking, care, status, supabase, design, groups] = await Promise.all([
    getLocale(), getTranslations('nav'), getTranslations('adminHub'),
    getTranslations('today'), getTranslations('booking'), getTranslations('care'),
    getTranslations('status'), createClient(), getTranslations('workspaceDesign'), getStaffNavigation(session.role),
  ]);
  const now = new Date();
  const day = bangkokDay(now);
  const [operations, board, waitlist, rooms, services, therapists, dailyNotes, staffRequests] = await Promise.all([
    getToday(), getBoard(day),
    supabase.from('waitlist_entries').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'offered']),
    supabase.from('rooms').select('id, code, display_name, active, zone, room_positions(id, label, active)').order('sort_order'),
    supabase.from('services').select('id, name_th, name_en, duration_min'),
    supabase.from('therapists').select('id, display_name').eq('active', true).order('sort_order'),
    listDailyNotes(day),
    supabase.from('staff_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const model = operations.ok ? operations.model : null;
  const notes = dailyNotes.ok ? dailyNotes.notes : [];
  const tools = visibleAdminTools(session.role);
  const roomCodes = new Map(rooms.data?.map((room) => [room.id, room.code]));
  const roomStates = new Map(model?.rooms.map((room) => [room.roomId, room.status]));
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'Asia/Bangkok' });
  const clock = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  const calendar = { pathname: '/calendar', query: { day } };
  const management = groups.find((group) => group.id === 'management')?.items.filter((item) => item.id !== 'settings') ?? [];
  const tileDescriptions = {
    therapists: design('therapistManagement'),
    payments: design('financeManagement'),
    earnings: design('commissionManagement'),
    inventory: design('inventoryManagement'),
    reports: design('reportsManagement'),
  };
  const metrics = model ? [
    { label: today('reservations'), value: model.counts.reservations, href: calendar, icon: 'schedule' },
    { label: today('therapistsOnShift'), value: model.therapists.length, href: '/admin/therapists', icon: 'therapists' },
    { label: t('roomsReady'), value: model.counts.available, total: model.rooms.length, href: '/rooms', icon: 'rooms' },
    { label: today('attention'), value: model.attention.length, href: '/today', icon: 'today' },
  ] as const : [];
  const quickActions = [
    {
      id: 'newBooking',
      label: t('quickAction.newBooking'),
      description: t('quickAction.newBookingDesc'),
      href: { pathname: '/calendar', query: { day, create: '1' } },
      icon: 'schedule' as IconName,
    },
    {
      id: 'newTherapist',
      label: t('quickAction.newTherapist'),
      description: t('quickAction.newTherapistDesc'),
      href: { pathname: '/admin/therapists', query: { create: '1' } },
      icon: 'therapists' as IconName,
    },
    {
      id: 'viewWaitlist',
      label: t('quickAction.viewWaitlist'),
      description: waitlist.count && waitlist.count > 0
        ? t('quickAction.viewWaitlistCount', { count: waitlist.count })
        : t('quickAction.viewWaitlistDesc'),
      href: '/waitlist',
      icon: 'waitlist' as IconName,
    },
    {
      id: 'roomBoard',
      label: t('quickAction.roomBoard'),
      description: t('quickAction.roomBoardDesc'),
      href: '/rooms',
      icon: 'rooms' as IconName,
    },
    {
      id: 'inventory',
      label: nav('inventory'),
      description: design('inventoryManagement'),
      href: '/inventory',
      icon: 'inventory' as IconName,
    },
    {
      id: 'payments',
      label: nav('payments'),
      description: design('financeManagement'),
      href: '/payments',
      icon: 'payments' as IconName,
    },
  ] as const;

  return (
    <div className={styles.dashboard}>
      <div className={styles.landing}>
        <div className={styles.features}>
          <WorkspaceHero title={design('managementTitle')} description={design('managementDesc')} />
          <ul className={styles.featureList}>
            {management.map((item) => (
              <li key={item.id} data-feature={item.id}>
                <Link href={item.href} className={styles.feature}>
                  <span className={styles.featureIcon}><Icon name={item.icon} /></span>
                  <Icon name="chevron" className={styles.featureArrow} />
                  <strong>{item.label}</strong>
                  <p>{tileDescriptions[item.id as keyof typeof tileDescriptions]}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.side}>
          <section id="admin-attention" className={styles.panel} aria-labelledby="admin-attention-title">
            <div className={styles.panelHead}>
              <h2 id="admin-attention-title"><Icon name="bell" />{today('attention')}</h2>
              <Link href="/today">{nav('today')} <Icon name="chevron" /></Link>
            </div>
            {!model ? <p className={styles.empty}>{t('operationsFailed')}</p>
              : model.attention.length ? (
                <ul className={styles.issues}>
                  {model.attention.slice(0, 5).map((issue) => (
                    <li key={[issue.kind, issue.roomId, issue.bookingId].join(':')}>
                      <strong>{today(`kind.${issue.kind}`)}{issue.roomId && roomCodes.has(issue.roomId) && <small>{roomCodes.get(issue.roomId)}</small>}</strong>
                      <time dateTime={issue.since}>{clock.format(new Date(issue.since))}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.empty}>{t('noIssues')}</p>}
          </section>
          <section className={styles.panel} aria-labelledby="admin-pending">
            <div className={styles.panelHead}><h2 id="admin-pending">{design('operatingStatus')}</h2></div>
            <ul className={styles.pending}>
              {([
                { href: '/admin/staff-requests', label: nav('staffRequests'), value: staffRequests.count, icon: 'guests' },
                { href: '/waitlist', label: care('waitlist'), value: waitlist.count, icon: 'waitlist' },
                { href: '/rooms', label: t('roomsReady'), value: model?.counts.available, icon: 'rooms' },
              ] as const).map(({ href, label, value, icon }) => (
                <li key={href}><Link href={href}><Icon name={icon} /><span>{label}</span><strong>{value == null ? '—' : number.format(value)}</strong><Icon name="chevron" /></Link></li>
              ))}
            </ul>
          </section>
          <section className={styles.panel} aria-labelledby="admin-quick-actions" data-testid="admin-quick-actions">
            <div className={styles.panelHead}><h2 id="admin-quick-actions">{t('quickActions')}</h2></div>
            <ul className={styles.quickActionList}>
              {quickActions.map((action) => (
                <li key={action.id}>
                  <Link href={action.href} className={styles.quickAction} data-testid={`quick-action-${action.id}`} title={action.description}>
                    <Icon name={action.icon} /><span>{action.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <h2 className={styles.operatingTitle}>{today('title')} <small><time dateTime={day}>{date.format(now)}</time> · {t('bangkokTime')}</small></h2>

      {model ? (
        <ul className={styles.metrics}>
          {metrics.map(({ label, value, href, icon, ...metric }) => (
            <li key={label}>
              <Link className={styles.metric} href={href}>
                <span>{label}</span>
                <Icon name={icon} />
                <strong>{number.format(value)}{'total' in metric && <small> / {number.format(metric.total)}</small>}</strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className={styles.notice} role="alert">{t('operationsFailed')}</p>}

      <DailyNotesManager notes={notes} canPost={session.role === 'owner'} />

      <div className={styles.workspace}>
        <section className={styles.panel} aria-labelledby="admin-schedule">
          <div className={styles.panelHead}>
            <h2 id="admin-schedule">{t('schedule')}</h2>
            <Link href={{ pathname: '/calendar', query: { day, view: 'timeline' } }}>{t('openCalendar')}</Link>
          </div>
          <div className={styles.timelineViews}>
            <Link href="/admin" aria-current={timelineBy === 'room' ? 'true' : undefined}>{booking('viewRooms')}</Link>
            <Link href={{ pathname: '/admin', query: { by: 'therapist' } }}
              aria-current={timelineBy === 'therapist' ? 'true' : undefined}>{booking('viewTherapists')}</Link>
          </div>
          {board.ok && !rooms.error && !services.error && !therapists.error ? (
            <RoomTimeline key={timelineBy} embedded by={timelineBy} day={day} role={session.role} rows={board.rows}
              rooms={rooms.data.filter((room) => room.active)} therapists={therapists.data} services={services.data} />
          ) : <p className={styles.empty} role="alert">{booking('loadFailed')}</p>}
        </section>

        <div className={styles.side}>
          <section className={styles.panel} aria-labelledby="admin-room-status">
            <div className={styles.panelHead}>
              <h2 id="admin-room-status">{today('roomStatus')}</h2>
              <Link href="/rooms">{nav('rooms')}</Link>
            </div>
            {!model || rooms.error ? <p className={styles.empty}>{t('operationsFailed')}</p>
              : model.rooms.length ? (
                <ul className={styles.rooms}>
                  {rooms.data?.flatMap((room) => {
                    const state = roomStates.get(room.id);
                    return state ? [(
                      <li key={room.id}>
                        <strong>{room.code}</strong>
                        <StatusChip kind="room" status={state} label={status(ROOM_STATUS_KEY[state])} />
                      </li>
                    )] : [];
                  })}
                </ul>
              ) : <p className={styles.empty}>{t('noRooms')}</p>}
          </section>

          <section className={styles.panel} aria-labelledby="admin-waitlist">
            <div className={styles.panelHead}>
              <h2 id="admin-waitlist">{care('waitlist')}</h2>
              <Link href="/waitlist">{t('manageWaitlist')}</Link>
            </div>
            <p className={styles.empty}>{waitlist.count === null ? care('loadFailed')
              : waitlist.count === 0 ? care('noWaitlist')
                : t('activeWaitlist', { count: waitlist.count })}</p>
          </section>
        </div>
      </div>

      <section className={styles.settings} aria-labelledby="admin-settings">
        <h2 id="admin-settings">{nav('settings')}</h2>
        <ul className={styles.tools}>
          {tools.map((tool) => (
            <li key={tool.id}>
              <Link href={tool.href} data-testid={`admin-tool-${tool.id}`} className={styles.tool}>
                <Icon name={toolIcons[tool.id]} />
                <span>
                  <strong>{nav(tool.id === 'settings' ? 'policies' : tool.id)}</strong>
                  <small>{t(`desc.${tool.id}`)}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
