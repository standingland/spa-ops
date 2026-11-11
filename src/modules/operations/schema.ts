import { z } from 'zod';

const optText = z.string().trim().optional().transform((v) => (v ? v : undefined));
const instant = z.iso.datetime({ offset: true });

export const RoomIdInput = z.uuid();

export const ReportInput = z.object({ roomId: z.uuid(), note: z.string().trim().min(1).max(300) });
export type ReportInput = z.input<typeof ReportInput>;

export const AbsenceInput = z.object({
  therapistId: z.uuid(), start: instant, end: instant, kind: z.enum(['break', 'leave', 'absence']), note: optText,
}).refine((v) => new Date(v.end) > new Date(v.start), { path: ['end'] });
export type AbsenceInput = z.input<typeof AbsenceInput>;

export const ForceBlockInput = z.object({
  roomId: z.uuid(), start: instant, end: instant, kind: z.enum(['maintenance', 'cleaning', 'closed']), note: optText,
}).refine((v) => new Date(v.end) > new Date(v.start), { path: ['end'] });
export type ForceBlockInput = z.input<typeof ForceBlockInput>;
