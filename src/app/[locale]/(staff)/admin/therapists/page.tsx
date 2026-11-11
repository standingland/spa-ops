import { requireRole } from '@/modules/identity/session';
import { createClient } from '@/lib/supabase/server';
import { addDays, bangkokDay, bangkokDayRange, mondayOf, parseRange } from '@/lib/time';
import {
  TherapistsAdmin, type ServiceOpt, type ShiftRow, type StaffOpt, type TherapistRow, type TimeOffRow,
} from '@/modules/therapists/components/TherapistsAdmin';

export default async function TherapistsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole('owner', 'manager');
  const { week } = await searchParams;
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : bangkokDay(new Date()));
  const range = `[${bangkokDayRange(monday).from},${bangkokDayRange(addDays(monday, 6)).to})`;
  const supabase = await createClient();
  const [ths, shifts, off, svcs, staff] = await Promise.all([
    supabase.from('therapists').select('id, display_name, employment_type, active, staff_user_id, therapist_services(service_id)').order('sort_order'),
    supabase.from('therapist_shifts').select('id, therapist_id, during').filter('during', 'ov', range),
    supabase.from('therapist_time_off').select('id, therapist_id, during, kind, note').filter('during', 'ov', range),
    supabase.from('services').select('id, name_th, name_en').eq('active', true).order('sort_order'),
    supabase.from('staff').select('user_id, display_name').eq('role', 'therapist').eq('active', true),
  ]);
  return (
    <TherapistsAdmin
      monday={monday}
      therapists={(ths.data ?? []) as TherapistRow[]}
      shifts={(shifts.data ?? []).map((s) => ({ id: s.id, therapist_id: s.therapist_id, ...parseRange(s.during as string) })) as ShiftRow[]}
      timeOff={(off.data ?? []).map((o) => ({ id: o.id, therapist_id: o.therapist_id, kind: o.kind, note: o.note, ...parseRange(o.during as string) })) as TimeOffRow[]}
      services={(svcs.data ?? []) as ServiceOpt[]}
      staff={(staff.data ?? []) as StaffOpt[]}
    />
  );
}
