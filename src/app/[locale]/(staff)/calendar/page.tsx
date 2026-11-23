import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay, bangkokDayRange, mondayOf, parseRange } from '@/lib/time';
import { photoUrls } from '@/modules/therapists/actions';
import { getBoard, getMonthCounts, getWeek } from '@/modules/booking/actions';
import { BookingCalendar } from '@/modules/booking/components/BookingCalendar';
import { RoomTimeline, type TimelineBlock } from '@/modules/booking/components/RoomTimeline';
import { MonthView } from '@/modules/booking/components/MonthView';
import { WeekView } from '@/modules/booking/components/WeekView';
import type { RoomOpt, ServiceOpt, TherapistOpt } from '@/modules/booking/components/types';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; view?: string; span?: string; by?: string; create?: string }> }) {
  const session = await requireRole();
  const sp = await searchParams;
  const now = new Date();
  const today = bangkokDay(now);
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && !Number.isNaN(Date.parse(sp.day)) ? sp.day : today;
  const timeline = sp.view === 'timeline';
  const view = sp.view === 'rooms' ? 'rooms' : 'therapists';
  const dayView = timeline ? 'timeline' : view;
  const span = sp.span === 'week' || sp.span === 'month' ? sp.span : 'day';
  const t = await getTranslations('booking');

  const supabase = await createClient();
  const [ths, rooms, svcs, retired] = await Promise.all([
    supabase.from('therapists').select('id, display_name, photo_path').eq('active', true).order('sort_order'),
    supabase.from('rooms').select('id, code, display_name, zone, room_positions(id, label, active)').eq('active', true).order('zone', { nullsFirst: false }).order('sort_order'),
    supabase.from('services').select('id, name_th, name_en, duration_min').order('sort_order'),
    supabase.from('rooms').select('id, code').eq('active', false),
  ]);
  const thRows = (ths.data ?? []) as { id: string; display_name: string; photo_path: string | null }[];
  const urls = await photoUrls(thRows.flatMap((x) => (x.photo_path ? [x.photo_path] : [])));
  const therapists: TherapistOpt[] = thRows.map((x) => ({ id: x.id, display_name: x.display_name, photoUrl: x.photo_path ? (urls[x.photo_path] ?? null) : null }));
  const roomOpts = (rooms.data ?? []) as RoomOpt[];
  const services = (svcs.data ?? []) as ServiceOpt[];
  const failed = <p role="alert" className="text-clay">{t('loadFailed')}</p>;

  if (span === 'week') {
    const monday = mondayOf(day);
    const week = await getWeek(monday);
    if (!week.ok) return failed;
    return <WeekView monday={monday} dayView={dayView} rows={week.rows} therapists={therapists} rooms={roomOpts} services={services} />;
  }
  if (span === 'month') {
    const month = day.slice(0, 7);
    const counts = await getMonthCounts(month);
    if (!counts.ok) return failed;
    return <MonthView month={month} dayView={dayView} days={counts.days} today={today} />;
  }
  const { from, to } = bangkokDayRange(day);
  const [board, blocks] = await Promise.all([
    getBoard(day),
    timeline && sp.by !== 'therapist'
      ? supabase.from('room_blocks').select('id, room_id, kind, during').filter('during', 'ov', `[${from},${to})`)
      : null,
  ]);
  if (!board.ok || blocks?.error) return failed;
  if (timeline) {
    const roomBlocks: TimelineBlock[] = (blocks?.data ?? []).map((block) => {
      const range = String(block.during).replace(/^\(,/, `["${from}",`).replace(/,\)$/, `,"${to}")`);
      return { id: block.id, roomId: block.room_id, kind: block.kind, ...parseRange(range) };
    });
    return <RoomTimeline day={day} now={now.toISOString()} by={sp.by === 'therapist' ? 'therapist' : 'room'} role={session.role}
      rows={board.rows} therapists={therapists} rooms={roomOpts} services={services} blocks={roomBlocks} />;
  }
  const initiallyCreating = sp.create === '1' && session.role !== 'therapist';
  return <BookingCalendar key={initiallyCreating ? 'create' : 'browse'} initiallyCreating={initiallyCreating} day={day} view={view} role={session.role} rows={board.rows} therapists={therapists} rooms={roomOpts} services={services} retiredRooms={retired.data ?? []} />;
}
