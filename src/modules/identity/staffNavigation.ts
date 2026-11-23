import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { visibleNav } from './nav';
import type { Role } from './session';

export const getStaffNavigation = cache(async (role: Role) => {
  // Managers see Reports only when the owner's policy allows it.
  const [nav, care, design, settings] = await Promise.all([
    getTranslations('nav'),
    getTranslations('care'),
    getTranslations('workspaceDesign'),
    role === 'manager' ? (await createClient()).rpc('get_settings') : null,
  ]);
  const managerReports = (settings?.data as Record<string, unknown> | null)?.['reports.manager_can_view'] !== false;

  return visibleNav(role, { managerReports }).map((group) => ({
    id: group.id,
    label: nav(`group.${group.id}`),
    items: group.items.map(({ id, href, icon }) => ({
      id,
      href,
      icon,
      label: id === 'waitlist' ? care('waitlist') : id === 'settings' ? design('managementHome') : nav(id === 'overview' ? 'adminOverview' : id),
    })),
  }));
});
