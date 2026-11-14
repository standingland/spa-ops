import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { getBoard } from '@/modules/booking/actions';
import { bangkokDay } from '@/lib/time';
import { getTranslations } from 'next-intl/server';
import { CounterDisplay } from '@/modules/booking/components/CounterDisplay';
import type { RoomOpt, TherapistOpt } from '@/modules/booking/components/types';
import { getBrand } from '@/lib/brand';

export default async function CounterPage() {
  await requireRole('owner', 'manager', 'receptionist');
  const day = bangkokDay(new Date());
  const db = await createClient();
  const t = await getTranslations('booking');
  const [board, rooms, therapists] = await Promise.all([
    getBoard(day),
    db.from('rooms').select('id, code, display_name, zone, room_positions(id, label, active)').eq('active', true).order('sort_order'),
    db.from('therapists').select('id, display_name').eq('active', true).order('sort_order'),
  ]);
  if (!board.ok || rooms.error || therapists.error) return <main className="p-8"><p role="alert">{t('loadFailed')}</p><a href="">↻</a></main>;
  return <CounterDisplay brand={getBrand(process.env).name} day={day} rows={board.rows} rooms={(rooms.data ?? []) as RoomOpt[]} therapists={(therapists.data ?? []) as TherapistOpt[]} />;
}
