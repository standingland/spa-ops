export type TherapistOpt = { id: string; display_name: string };
export type RoomOpt = { id: string; code: string; display_name: string; zone: string | null; room_positions: { id: string; label: string; active: boolean }[] };
export type ServiceOpt = { id: string; name_th: string; name_en: string | null; duration_min: number };
export type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
