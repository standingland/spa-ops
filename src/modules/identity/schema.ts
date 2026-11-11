import { z } from 'zod';

export const ROLES = ['owner', 'manager', 'receptionist', 'therapist'] as const;

export const Password = z.string().min(10).max(72);

export const StaffInput = z.object({
  email: z.email(),
  password: Password,
  role: z.enum(ROLES),
  displayName: z.string().trim().min(1).max(80),
});
export type StaffInput = z.input<typeof StaffInput>;

export const SetPasswordInput = z.object({ userId: z.uuid(), password: Password });
export type SetPasswordInput = z.input<typeof SetPasswordInput>;
export const ChangePasswordInput = z.object({ current: z.string().min(1).max(200), next: Password });
export type ChangePasswordInput = z.input<typeof ChangePasswordInput>;
