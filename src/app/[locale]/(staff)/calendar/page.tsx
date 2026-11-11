import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay } from '@/lib/time';
import { getBoard } from '@/modules/booking/actions';
import { BookingCalendar } from '@/modules/booking/components/BookingCalendar';
import type { RoomOpt, ServiceOpt, TherapistOpt } from '@/modules/booking/components/types';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; view?: string }> }) {
  const session = await requireRole();
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : bangkokDay(new Date());
  const view = sp.view === 'rooms' ? 'rooms' : 'therapists';
  const t = await getTranslations('booking');

  const supabase = await createClient();
  const [board, ths, rooms, svcs] = await Promise.all([
    getBoard(day),
    supabase.from('therapists').select('id, display_name').eq('active', true).order('sort_order'),
    supabase.from('rooms').select('id, code, display_name, zone, room_positions(id, label, active)').eq('active', true).order('zone', { nullsFirst: false }).order('sort_order'),
    supabase.from('services').select('id, name_th, name_en, duration_min').order('sort_order'),
  ]);

  if (!board.ok) return <p role="alert" className="text-clay">{t('loadFailed')}</p>;
  return (
    <BookingCalendar
      day={day} view={view} role={session.role} rows={board.rows}
      therapists={(ths.data ?? []) as TherapistOpt[]} rooms={(rooms.data ?? []) as RoomOpt[]} services={(svcs.data ?? []) as ServiceOpt[]}
    />
  );
}
