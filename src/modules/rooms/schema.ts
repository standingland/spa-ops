import { z } from 'zod';

const optText = z.string().trim().optional().transform((v) => (v ? v : undefined));

export const RoomInput = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().min(1).max(20),
  displayName: z.string().trim().min(1).max(80),
  categoryId: z.uuid(),
  floor: optText,
  zone: optText,
  turnoverMin: z.number().int().min(0).max(240),
  equipment: z.array(z.string().trim().min(1)),
  notes: optText,
});
export type RoomInput = z.input<typeof RoomInput>;

export const RoomBlockInput = z.object({
  roomId: z.uuid(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  kind: z.enum(['maintenance', 'cleaning', 'closed']),
  note: optText,
}).refine((v) => new Date(v.end) > new Date(v.start), { path: ['end'] });
export type RoomBlockInput = z.input<typeof RoomBlockInput>;

export const PositionLabel = z.string().trim().min(1).max(20);
