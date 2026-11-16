// Pure navigation model: no React, no server imports (type-only Role import is erased).
import type { Role } from '@/modules/identity/session';

export type NavId = 'today' | 'schedule' | 'bookings' | 'guests' | 'therapists' | 'rooms' | 'payments' | 'reports' | 'earnings' | 'inventory' | 'settings';
export type IconName = NavId | 'menu' | 'close';
export type NavItem = { id: NavId; href: string; icon: IconName; roles: Role[]; hidden?: boolean };
export type NavGroup = { id: 'operate' | 'management'; items: NavItem[] };
export type AdminTool = { id: 'adminRooms' | 'services' | 'notifications' | 'staff' | 'settings'; href: string; roles: Role[] };

const ALL: Role[] = ['owner', 'manager', 'receptionist', 'therapist'];
const FRONT: Role[] = ['owner', 'manager', 'receptionist'];
const MANAGEMENT: Role[] = ['owner', 'manager'];

const GROUPS: NavGroup[] = [
  {
    id: 'operate',
    items: [
      { id: 'today', href: '/today', icon: 'today', roles: ALL },
      { id: 'schedule', href: '/calendar', icon: 'schedule', roles: ALL },
      // Not rendered until sub-project 4.
      { id: 'bookings', href: '/bookings', icon: 'bookings', roles: ALL, hidden: true },
      { id: 'guests', href: '/customers', icon: 'guests', roles: FRONT },
      { id: 'rooms', href: '/rooms', icon: 'rooms', roles: ALL },
    ],
  },
  {
    id: 'management',
    items: [
      { id: 'therapists', href: '/admin/therapists', icon: 'therapists', roles: MANAGEMENT },
      { id: 'payments', href: '/payments', icon: 'payments', roles: MANAGEMENT },
      { id: 'earnings', href: '/earnings', icon: 'earnings', roles: MANAGEMENT },
      { id: 'inventory', href: '/inventory', icon: 'inventory', roles: MANAGEMENT },
      { id: 'reports', href: '/reports', icon: 'reports', roles: MANAGEMENT },
      { id: 'settings', href: '/admin', icon: 'settings', roles: MANAGEMENT },
    ],
  },
];

const ADMIN_TOOLS: AdminTool[] = [
  { id: 'adminRooms', href: '/admin/rooms', roles: MANAGEMENT },
  { id: 'services', href: '/admin/services', roles: MANAGEMENT },
  { id: 'notifications', href: '/admin/notifications', roles: MANAGEMENT },
  { id: 'staff', href: '/admin/staff', roles: ['owner'] },
  { id: 'settings', href: '/admin/settings', roles: ['owner'] },
];

export function visibleNav(role: Role, opts: { managerReports: boolean }): NavGroup[] {
  return GROUPS.map((g) => ({
    id: g.id,
    items: g.items.filter(
      (i) => !i.hidden && i.roles.includes(role) && !(i.id === 'reports' && role === 'manager' && !opts.managerReports),
    ),
  })).filter((g) => g.items.length > 0);
}

export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    if ((pathname === h || pathname.startsWith(h + '/')) && (best === null || h.length > best.length)) best = h;
  }
  return best;
}

export function visibleAdminTools(role: Role): AdminTool[] {
  return ADMIN_TOOLS.filter((t) => t.roles.includes(role));
}
