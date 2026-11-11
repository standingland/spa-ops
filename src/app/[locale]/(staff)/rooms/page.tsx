import { getLocale } from 'next-intl/server';
import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { getRoomStates } from '@/modules/operations/actions';
import { RoomBoard } from '@/modules/operations/components/RoomBoard';
import type { RoomTile } from '@/modules/operations/rooms';

type Params = { q?: string; status?: string; category?: string; zone?: string; compact?: string };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole();
  const sp = await searchParams;
  const locale = await getLocale();
  const supabase = await createClient();
  const [states, rooms, cats, ths] = await Promise.all([
    getRoomStates(),
    supabase.from('rooms').select('id, code, display_name, zone, floor, category_id, notes').eq('active', true),
    supabase.from('room_categories').select('id, name_th, name_en').order('sort_order'),
    supabase.from('therapists').select('id, display_name'),
  ]);
  if (!states.ok) return <p role="alert">{states.code}</p>;
  const showNotes = session.role !== 'therapist';
  const info = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  const tiles: RoomTile[] = states.rooms.flatMap((s) => {
    const r = info.get(s.roomId);
    if (!r) return [];
    return [{ ...s, code: r.code, displayName: r.display_name, zone: r.zone, floor: r.floor, categoryId: r.category_id, notes: showNotes ? r.notes : null }];
  });
  return (
    <RoomBoard
      tiles={tiles}
      categories={(cats.data ?? []).map((c) => ({ id: c.id, name: locale === 'en' && c.name_en ? c.name_en : c.name_th }))}
      therapists={Object.fromEntries((ths.data ?? []).map((x) => [x.id, x.display_name]))}
      initial={{ q: sp.q ?? '', status: sp.status ?? '', category: sp.category ?? '', zone: sp.zone ?? '', compact: sp.compact === '1' }}
      showNotes={showNotes}
    />
  );
}
