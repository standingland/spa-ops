import { z } from 'zod';

export const CustomerInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().transform((v) => (v ? v : undefined)),
});
export type CustomerInput = z.input<typeof CustomerInput>;
