import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay, mondayOf } from '@/lib/time';
import { getBoard, getMonthCounts, getWeek } from '@/modules/booking/actions';
import { BookingCalendar } from '@/modules/booking/components/BookingCalendar';
import { MonthView } from '@/modules/booking/components/MonthView';
import { WeekView } from '@/modules/booking/components/WeekView';
import type { RoomOpt, ServiceOpt, TherapistOpt } from '@/modules/booking/components/types';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; view?: string; span?: string }> }) {
  const session = await requireRole();
  const sp = await searchParams;
  const today = bangkokDay(new Date());
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const view = sp.view === 'rooms' ? 'rooms' : 'therapists';
  const span = sp.span === 'week' || sp.span === 'month' ? sp.span : 'day';
  const t = await getTranslations('booking');

  const supabase = await createClient();
  const [ths, rooms, svcs, retired] = await Promise.all([
    supabase.from('therapists').select('id, display_name').eq('active', true).order('sort_order'),
    supabase.from('rooms').select('id, code, display_name, zone, room_positions(id, label, active)').eq('active', true).order('zone', { nullsFirst: false }).order('sort_order'),
    supabase.from('services').select('id, name_th, name_en, duration_min').order('sort_order'),
    supabase.from('rooms').select('id, code').eq('active', false),
  ]);
  const therapists = (ths.data ?? []) as TherapistOpt[];
  const roomOpts = (rooms.data ?? []) as RoomOpt[];
  const services = (svcs.data ?? []) as ServiceOpt[];
  const failed = <p role="alert" className="text-clay">{t('loadFailed')}</p>;

  if (span === 'week') {
    const monday = mondayOf(day);
    const week = await getWeek(monday);
    if (!week.ok) return failed;
    return <WeekView monday={monday} rows={week.rows} therapists={therapists} rooms={roomOpts} services={services} />;
  }
  if (span === 'month') {
    const month = day.slice(0, 7);
    const counts = await getMonthCounts(month);
    if (!counts.ok) return failed;
    return <MonthView month={month} days={counts.days} today={today} />;
  }
  const board = await getBoard(day);
  if (!board.ok) return failed;
  return <BookingCalendar day={day} view={view} role={session.role} rows={board.rows} therapists={therapists} rooms={roomOpts} services={services} retiredRooms={retired.data ?? []} />;
}
