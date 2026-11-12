import type { BookingStatus } from '@/modules/booking/schema';
import type { RoomStatus } from '@/modules/operations/today';

/** Room status → message key under `status` in messages/*.json. */
export const ROOM_STATUS_KEY: Record<RoomStatus, string> = {
  available: 'available',
  reserved: 'reserved',
  occupied: 'occupied',
  cleaning: 'cleaning',
  out_of_service: 'outOfService',
};

const CHIP = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption text-ink';

const ROOM: Record<RoomStatus, { dot: string; chip: string }> = {
  available: { dot: 'bg-sage', chip: `${CHIP} bg-tint-available` },
  reserved: { dot: 'bg-brass', chip: `${CHIP} bg-tint-reserved` },
  occupied: { dot: 'bg-charcoal', chip: `${CHIP} bg-tint-occupied` },
  cleaning: { dot: 'bg-clay', chip: `${CHIP} bg-tint-cleaning` },
  out_of_service: { dot: 'bg-stone-dark', chip: `${CHIP} bg-tint-out-of-service` },
};

/** `card` is the calendar's existing STATUS_BG, kept verbatim. */
const BOOKING: Record<BookingStatus, { chip: string; card: string }> = {
  requested: { chip: `${CHIP} bg-tint-requested`, card: 'bg-stone text-charcoal' },
  confirmed: { chip: `${CHIP} bg-tint-confirmed`, card: 'bg-brass text-white' },
  checked_in: { chip: `${CHIP} bg-tint-checked-in`, card: 'bg-sage text-white' },
  in_treatment: { chip: `${CHIP} bg-tint-in-treatment`, card: 'bg-charcoal text-ivory' },
  completed: { chip: `${CHIP} bg-tint-completed`, card: 'bg-stone-dark text-white' },
  cancelled: { chip: `${CHIP} bg-tint-cancelled line-through`, card: 'bg-stone text-stone-dark line-through opacity-60' },
  no_show: { chip: `${CHIP} bg-tint-no-show`, card: 'bg-clay text-white opacity-80' },
};

export const roomStatusStyle = (s: RoomStatus) => ROOM[s];
export const bookingStatusStyle = (s: BookingStatus) => BOOKING[s];
