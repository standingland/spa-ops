import { z } from 'zod';

export const MAX_HANDOVER_LENGTH = 600;

export type Handover = { id: string; day: string; body: string; authorName: string; createdAt: string };

export const handoverSchema = z.object({
  body: z.string().trim().min(1).max(MAX_HANDOVER_LENGTH),
});
