import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { parseRange } from '@/lib/time';
import { RoomsAdmin, type BlockRow, type CategoryRow, type RoomRow } from '@/modules/rooms/components/RoomsAdmin';

export default async function RoomsPage() {
  await requireRole('owner', 'manager');
  const supabase = await createClient();
  const [rooms, cats, blocks] = await Promise.all([
    supabase.from('rooms').select('*, room_positions(id,label,active)').order('sort_order'),
    supabase.from('room_categories').select('id,name_th,name_en').order('sort_order'),
    supabase.from('room_blocks').select('id,room_id,during,kind,note'),
  ]);
  const blockRows: BlockRow[] = (blocks.data ?? []).map((b) => ({ id: b.id, room_id: b.room_id, kind: b.kind, note: b.note, ...parseRange(b.during as string) }));
  return <RoomsAdmin rooms={(rooms.data ?? []) as RoomRow[]} categories={(cats.data ?? []) as CategoryRow[]} blocks={blockRows} />;
}
