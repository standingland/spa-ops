import { describe, expect, it } from 'vitest';
import { activeHref, visibleAdminTools, visibleNav } from './nav';

const ids = (role: Parameters<typeof visibleNav>[0], managerReports = true) =>
  visibleNav(role, { managerReports }).flatMap((g) => g.items.map((i) => i.id));

describe('visibleNav', () => {
  it('gives a therapist one operate group with today, schedule, rooms', () => {
    const groups = visibleNav('therapist', { managerReports: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('operate');
    expect(groups[0].items.map((i) => i.id)).toEqual(['today', 'schedule', 'rooms']);
  });

  it('adds guests for a receptionist', () => {
    const groups = visibleNav('receptionist', { managerReports: true });
    expect(groups.map((g) => g.id)).toEqual(['operate']);
    expect(ids('receptionist')).toEqual(['today', 'schedule', 'guests', 'rooms', 'waitlist']);
  });

  it('drops reports but keeps payments for a manager when managerReports is false', () => {
    const list = ids('manager', false);
    expect(list).not.toContain('reports');
    expect(list).toContain('payments');
    expect(ids('manager', true)).toContain('reports');
  });

  it('gives an owner payments, reports and settings, and never bookings', () => {
    const list = ids('owner');
    expect(list).toEqual(expect.arrayContaining(['payments', 'earnings', 'inventory', 'reports', 'settings']));
    expect(list).not.toContain('bookings');
    const groups = visibleNav('owner', { managerReports: true });
    expect(groups.map((g) => g.id)).toEqual(['operate', 'management']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['settings', 'today', 'schedule', 'guests', 'rooms', 'waitlist']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['therapists', 'payments', 'earnings', 'inventory', 'reports']);
  });
});

describe('activeHref', () => {
  it('returns the longest matching href', () => {
    expect(activeHref('/admin/therapists', ['/admin', '/admin/therapists'])).toBe('/admin/therapists');
    expect(activeHref('/admin/staff', ['/admin', '/admin/therapists'])).toBe('/admin');
  });
  it('matches nested paths', () => {
    expect(activeHref('/customers/123', ['/customers'])).toBe('/customers');
  });
  it('matches only on a segment boundary', () => {
    expect(activeHref('/customersx', ['/customers'])).toBeNull();
  });
});

describe('visibleAdminTools', () => {
  it('excludes staff and settings for a manager', () => {
    const tools = visibleAdminTools('manager').map((t) => t.id);
    expect(tools).toEqual(['adminRooms', 'services', 'notifications', 'applications', 'guide']);
  });
  it('gives the owner everything', () => {
    expect(visibleAdminTools('owner').map((t) => t.id)).toEqual(['adminRooms', 'services', 'notifications', 'applications', 'staff', 'settings', 'guide']);
  });
  it('gives others nothing', () => {
    expect(visibleAdminTools('therapist')).toEqual([]);
  });
});
