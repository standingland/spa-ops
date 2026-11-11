import { z } from 'zod';

export const ROLES = ['owner', 'manager', 'receptionist', 'therapist'] as const;

export const StaffInput = z.object({
  email: z.email(),
  password: z.string().min(10).max(72),
  role: z.enum(ROLES),
  displayName: z.string().trim().min(1).max(80),
});
export type StaffInput = z.input<typeof StaffInput>;
