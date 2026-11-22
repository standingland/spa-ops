import { addDays, bangkokDay } from '@/lib/time';

export type RequestKind = 'sick' | 'shift';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type Decision = Exclude<RequestStatus, 'pending'>;

export type StaffRequest = {
  id: string;
  kind: RequestKind;
  during: string;
  status: RequestStatus;
  affected_bookings: number;
};

export type ReviewRequest = StaffRequest & {
  staff: { display_name: string; role: 'owner' | 'manager' | 'receptionist' | 'therapist' };
};

export function nextMonthDays(now: Date): string[] {
  const [year, month] = bangkokDay(now).split('-').map(Number);
  const first = bangkokDay(new Date(Date.UTC(year, month, 1, 12)));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => addDays(first, i));
}
