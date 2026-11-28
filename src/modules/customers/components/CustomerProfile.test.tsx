import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../../messages/en.json';
import type { CustomerProfile as Profile } from '../schema';

vi.mock('../actions', () => ({
  saveCustomer: vi.fn(),
  addPrivateNote: vi.fn(),
  anonymiseCustomer: vi.fn(),
}));
vi.mock('@/modules/care/actions', () => ({
  savePreferences: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string | { pathname: string; query?: Record<string, string> }; children: React.ReactNode; [k: string]: unknown }) => {
    const url = typeof href === 'string'
      ? href
      : `${href.pathname}${href.query && Object.keys(href.query).length ? `?${new URLSearchParams(href.query).toString()}` : ''}`;
    return <a href={url} {...props}>{children}</a>;
  },
}));

import { CustomerProfile } from './CustomerProfile';

const BASE: Profile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Khun Mali',
  fullName: 'Mali Srisuk',
  phone: '0812345678',
  email: 'mali@example.com',
  preferredTherapistId: 't1',
  serviceNotes: 'Warm towel please',
  commsConsent: true,
  consentRecordedAt: '2026-10-01T03:30:00.000Z',
  anonymisedAt: null,
  summary: {
    visits: 6,
    cancelled: 1,
    noShows: 0,
    upcoming: 2,
    firstVisit: '2025-04-10T04:00:00.000Z',
    lastVisit: '2026-10-20T07:00:00.000Z',
    avgDaysBetween: 21,
    topServiceId: 's1',
  },
  history: [
    {
      bookingId: 'b1',
      startsAt: '2026-10-20T07:00:00.000Z',
      endsAt: '2026-10-20T08:30:00.000Z',
      status: 'completed',
      serviceId: 's1',
      therapistId: 't1',
      roomId: 'r1',
      note: 'Focus on shoulders',
      money: {
        bookingId: 'b1',
        chargeSatang: 150000,
        paidSatang: 150000,
        refundedSatang: 0,
        dueSatang: 0,
        paymentStatus: 'paid',
        hasUnverified: false,
      },
    },
  ],
  privateNotes: [{ id: 'n1', body: 'Prefers quiet corner room', createdAt: '2026-10-01T04:00:00.000Z' }],
};

const NAMES = {
  services: { s1: 'Aroma Oil 90m' },
  therapists: { t1: 'Khun Ploy' },
  rooms: { r1: 'R1' },
};

const render = (props: Partial<Parameters<typeof CustomerProfile>[0]> = {}) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="Asia/Bangkok" messages={en}>
      <CustomerProfile
        customer={BASE}
        role="receptionist"
        names={NAMES}
        preferences={{ pressure: 'firm', oil: 'Lavender', room: 'Warm' }}
        backQuery={{ q: 'Mali', page: '2' }}
        {...props}
      />
    </NextIntlClientProvider>,
  );

it('renders the guest hero, contact links, KPI stats, cadence, preferences, and formatted history', () => {
  const html = render();
  expect(html).toContain('<h1 data-testid="customer-name">Khun Mali</h1>');
  expect(html).toContain('Mali Srisuk');
  expect(html).toContain('href="tel:0812345678"');
  expect(html).toContain('href="mailto:mali@example.com"');
  expect(html).toContain('href="/customers?q=Mali&amp;page=2"');
  expect(html).toContain('data-testid="stat-visits">6<');
  expect(html).toContain('data-testid="stat-upcoming">2<');
  expect(html).toContain('data-testid="stat-cancelled">1<');
  expect(html).toContain('data-testid="stat-no-shows">0<');
  expect(html).toContain('21 days');
  expect(html).toContain('Aroma Oil 90m');
  expect(html).toContain('data-testid="history-row"');
  expect(html).toContain('data-testid="payment-status"');
  expect(html).toContain('฿1,500.00');
  expect(html).toContain('Focus on shoulders');
  expect(html).toContain('Lavender');
});

it('scopes private notes and privacy controls by role (receptionist vs manager vs owner)', () => {
  const rec = render({ role: 'receptionist' });
  expect(rec).not.toContain('data-testid="private-note"');
  expect(rec).not.toContain('data-testid="privacy-tools"');
  expect(rec).not.toContain('data-testid="anonymise-open"');

  const mgr = render({ role: 'manager' });
  expect(mgr).toContain('data-testid="private-note"');
  expect(mgr).toContain('Prefers quiet corner room');
  expect(mgr).toContain('data-testid="export-json"');
  expect(mgr).not.toContain('data-testid="anonymise-open"');

  const owner = render({ role: 'owner' });
  expect(owner).toContain('data-testid="private-note"');
  expect(owner).toContain('data-testid="export-json"');
  expect(owner).toContain('data-testid="anonymise-open"');
});

it('shows removed state and disables editing when the customer is anonymised', () => {
  const html = render({
    role: 'owner',
    customer: {
      ...BASE,
      displayName: 'Removed',
      fullName: null,
      phone: null,
      email: null,
      serviceNotes: null,
      anonymisedAt: '2026-11-01T00:00:00.000Z',
      privateNotes: [],
    },
  });
  expect(html).toContain('<h1 data-testid="customer-name">Removed</h1>');
  expect(html).toContain('data-testid="anonymised-badge"');
  expect(html).toMatch(/<input[^>]*data-testid="f-display-name"[^>]*disabled|<input[^>]*disabled[^>]*data-testid="f-display-name"/);
  expect(html).not.toContain('data-testid="save-customer"');
  expect(html).not.toContain('data-testid="note-add"');
  expect(html).not.toContain('data-testid="anonymise-open"');
});
