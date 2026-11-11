import { forbidden } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
export type Session = { userId: string; role: Role };

/** The signed-in active staff member, or null. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: staff } = await supabase.from('staff').select('role, active').eq('user_id', data.user.id).maybeSingle();
  if (!staff || !staff.active) return null;
  return { userId: data.user.id, role: staff.role as Role };
}

/** Every staff page and server action starts with this. No roles listed = any active staff member. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect({ href: '/login', locale: await getLocale() });
  if (roles.length > 0 && !roles.includes(session!.role)) forbidden();
  return session!;
}

/** For server actions: like requireRole but returns null instead of redirecting, so the action can return NOT_AUTHORIZED. */
export async function roleOrNull(...roles: Role[]): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  if (roles.length > 0 && !roles.includes(session.role)) return null;
  return session;
}
