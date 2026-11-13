/** photoUrl is a signed link, filled only for owner and manager (photos are private to them); otherwise the card shows initials. */
export type TherapistOpt = { id: string; display_name: string; photoUrl?: string | null };
export type RoomOpt = { id: string; code: string; display_name: string; zone: string | null; room_positions: { id: string; label: string; active: boolean }[] };
export type ServiceOpt = { id: string; name_th: string; name_en: string | null; duration_min: number };
export type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
