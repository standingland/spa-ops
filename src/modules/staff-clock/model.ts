import { z } from 'zod';
import type { Role } from '@/modules/identity/session';

export const clockCodeSchema = z.uuid();
export type ClockAction = 'in' | 'out';
export type ClockStatus = 'waiting' | 'working' | 'finished';

export type ClockSnapshot = {
  attendance: { started_at: string; ended_at: string | null } | null;
  coworkers: { user_id: string; display_name: string; role: Role; state: ClockStatus }[];
};
