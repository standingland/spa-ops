import { z } from 'zod';

const optText = z.string().trim().optional().transform((v) => (v ? v : undefined));
const instant = z.iso.datetime({ offset: true });

export const TherapistInput = z.object({
  id: z.uuid().optional(),
  displayName: z.string().trim().min(1).max(80),
  employmentType: z.enum(['employee', 'freelance']),
  staffUserId: z.uuid().nullable().optional(),
  serviceIds: z.array(z.uuid()),
  public: z.boolean().default(false),
  bioTh: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
  bioEn: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
  specialties: z.array(z.string().trim()).transform((a) => a.filter(Boolean)).pipe(z.array(z.string().max(24)).max(6)).default([]),
});
export type TherapistInput = z.input<typeof TherapistInput>;

export const ShiftInput = z.object({
  id: z.uuid().optional(),
  therapistId: z.uuid(),
  start: instant,
  end: instant,
}).refine((v) => new Date(v.end) > new Date(v.start), { path: ['end'] });
export type ShiftInput = z.input<typeof ShiftInput>;

export const TimeOffInput = z.object({
  id: z.uuid().optional(),
  therapistId: z.uuid(),
  start: instant,
  end: instant,
  kind: z.enum(['break', 'leave', 'absence']),
  note: optText,
}).refine((v) => new Date(v.end) > new Date(v.start), { path: ['end'] });
export type TimeOffInput = z.input<typeof TimeOffInput>;

export const Monday = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
