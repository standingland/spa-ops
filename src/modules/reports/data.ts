import { createClient } from '@/lib/supabase/server';
import type { ReportData, ReportRange } from './schema';

type Db = Record<string, number | string | null>;
const n = (v: unknown) => Number(v ?? 0);
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
type Failure = { ok: false; code: string };

/** Calls the seven report functions and joins display names from the catalog. The database decides who may read. */
export async function loadReports(range: Required<ReportRange>, locale: string): Promise<({ ok: true } & ReportData) | Failure> {
  const supabase = await createClient();
  const args = { p_from: range.from, p_to: range.to };
  const [rev, sum, bySvc, byTh, rooms, thUtil, peaks, svcs, ths, rms, cats] = await Promise.all([
    supabase.rpc('report_revenue', { ...args, p_grain: range.grain }),
    supabase.rpc('report_summary', args),
    supabase.rpc('report_by_service', args),
    supabase.rpc('report_by_therapist', args),
    supabase.rpc('report_room_utilization', args),
    supabase.rpc('report_therapist_utilization', args),
    supabase.rpc('report_peak_periods', args),
    supabase.from('services').select('id, name_th, name_en'),
    supabase.from('therapists').select('id, display_name'),
    supabase.from('rooms').select('id, code'),
    supabase.from('room_categories').select('id, name_th, name_en'),
  ]);
  for (const r of [rev, sum, bySvc, byTh, rooms, thUtil, peaks, svcs, ths, rms, cats]) {
    if (r.error) return { ok: false, code: r.error.message === 'NOT_AUTHORIZED' || r.error.code === '42501' ? 'NOT_AUTHORIZED' : r.error.message === 'INVALID_SETTING' ? 'INVALID_SETTING' : 'UNKNOWN' };
  }
  const pick = (th: string, en: string | null) => (locale === 'en' && en ? en : th);
  const svcName = new Map((svcs.data ?? []).map((s) => [s.id, pick(s.name_th, s.name_en)]));
  const thName = new Map((ths.data ?? []).map((t) => [t.id, t.display_name as string]));
  const roomCode = new Map((rms.data ?? []).map((r) => [r.id, r.code as string]));
  const catName = new Map((cats.data ?? []).map((c) => [c.id, pick(c.name_th, c.name_en)]));
  const s = ((sum.data ?? []) as Db[])[0] ?? {};
  return {
    ok: true,
    revenue: ((rev.data ?? []) as Db[]).map((r) => ({
      bucket: String(r.bucket), bookedSatang: n(r.booked_satang), collectedSatang: n(r.collected_satang),
      refundedSatang: n(r.refunded_satang), netCollectedSatang: n(r.net_collected_satang),
    })),
    summary: {
      bookings: n(s.bookings), completed: n(s.completed), cancelled: n(s.cancelled), noShows: n(s.no_shows), walkIns: n(s.walk_ins),
      reschedules: n(s.reschedules), cancellationRate: n(s.cancellation_rate), noShowRate: n(s.no_show_rate), bookedSatang: n(s.booked_satang),
      feeSatang: n(s.fee_satang), avgTransactionSatang: n(s.avg_transaction_satang), customers: n(s.customers),
      returningCustomers: n(s.returning_customers), returningRate: n(s.returning_rate),
    },
    services: ((bySvc.data ?? []) as Db[]).map((r) => ({
      serviceId: String(r.service_id), name: svcName.get(String(r.service_id)) ?? '', completed: n(r.completed), minutes: n(r.minutes), bookedSatang: n(r.booked_satang),
    })),
    therapists: ((byTh.data ?? []) as Db[]).map((r) => ({
      therapistId: String(r.therapist_id), name: thName.get(String(r.therapist_id)) ?? '', completed: n(r.completed), minutes: n(r.minutes), bookedSatang: n(r.booked_satang),
    })),
    rooms: ((rooms.data ?? []) as Db[]).map((r) => ({
      roomId: String(r.room_id), code: roomCode.get(String(r.room_id)) ?? '', zone: r.zone ? String(r.zone) : '', categoryId: String(r.category_id),
      categoryName: catName.get(String(r.category_id)) ?? '', openMinutes: n(r.open_minutes), bookedMinutes: n(r.booked_minutes),
      utilization: n(r.utilization), turnovers: n(r.turnovers), avgTurnoverMin: nn(r.avg_turnover_min), onTimeRate: nn(r.on_time_rate),
    })),
    therapistUtil: ((thUtil.data ?? []) as Db[]).map((r) => ({
      therapistId: String(r.therapist_id), name: thName.get(String(r.therapist_id)) ?? '', shiftMinutes: n(r.shift_minutes),
      timeOffMinutes: n(r.time_off_minutes), bookedMinutes: n(r.booked_minutes), utilization: n(r.utilization),
    })),
    peaks: ((peaks.data ?? []) as Db[]).map((r) => ({ dow: n(r.dow), hour: n(r.hour), bookings: n(r.bookings) })),
  };
}
