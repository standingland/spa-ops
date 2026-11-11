import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'date');

export const ReportRange = z.object({ from: day, to: day, grain: z.enum(['day', 'week', 'month']).default('day') })
  .refine((r) => r.from <= r.to, 'from <= to')
  .refine((r) => (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86400000 <= 365, 'at most 366 days');
export type ReportRange = z.input<typeof ReportRange>;

export type RevenueRow = { bucket: string; bookedSatang: number; collectedSatang: number; refundedSatang: number; netCollectedSatang: number };
export type Summary = {
  bookings: number; completed: number; cancelled: number; noShows: number; walkIns: number; reschedules: number;
  cancellationRate: number; noShowRate: number; bookedSatang: number; feeSatang: number; avgTransactionSatang: number;
  customers: number; returningCustomers: number; returningRate: number;
};
export type ServiceRow = { serviceId: string; name: string; completed: number; minutes: number; bookedSatang: number };
export type TherapistRow = { therapistId: string; name: string; completed: number; minutes: number; bookedSatang: number };
export type RoomUtilRow = {
  roomId: string; code: string; zone: string; categoryId: string; categoryName: string; openMinutes: number; bookedMinutes: number;
  utilization: number; turnovers: number; avgTurnoverMin: number | null; onTimeRate: number | null;
};
export type TherapistUtilRow = { therapistId: string; name: string; shiftMinutes: number; timeOffMinutes: number; bookedMinutes: number; utilization: number };
export type PeakCell = { dow: number; hour: number; bookings: number };

export type ReportData = {
  revenue: RevenueRow[]; summary: Summary; services: ServiceRow[]; therapists: TherapistRow[];
  rooms: RoomUtilRow[]; therapistUtil: TherapistUtilRow[]; peaks: PeakCell[];
};

export const CSV_NAMES = ['revenue', 'services', 'therapists', 'rooms', 'therapist-utilization', 'peaks'] as const;
export type CsvName = (typeof CSV_NAMES)[number];
