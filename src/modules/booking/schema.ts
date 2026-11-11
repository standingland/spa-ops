import { z } from 'zod';

export const BOOKING_STATUSES = ['requested', 'confirmed', 'checked_in', 'in_treatment', 'completed', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const instant = z.iso.datetime({ offset: true });

export const DayInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SuggestInput = z.object({ serviceId: z.uuid(), start: instant, customerId: z.uuid().optional() });
export type SuggestInput = z.input<typeof SuggestInput>;

export const CreateBookingInput = z.object({
  customerId: z.uuid(),
  serviceId: z.uuid(),
  therapistId: z.uuid(),
  positionId: z.uuid(),
  start: instant,
  source: z.enum(['advance', 'walk_in']),
  idempotencyKey: z.string().min(8).max(100),
  partyId: z.uuid().optional(),
  note: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});
export type CreateBookingInput = z.input<typeof CreateBookingInput>;

export const MoveBookingInput = z.object({
  bookingId: z.uuid(),
  start: instant,
  therapistId: z.uuid(),
  positionId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});
export type MoveBookingInput = z.input<typeof MoveBookingInput>;

export const SetStatusInput = z.object({
  bookingId: z.uuid(),
  to: z.enum(BOOKING_STATUSES),
  expectedVersion: z.number().int().min(1),
});
export type SetStatusInput = z.input<typeof SetStatusInput>;
