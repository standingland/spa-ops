import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../../messages/en.json';

vi.mock('../actions', () => ({ bookOnline: vi.fn(), loadTimes: vi.fn(async () => []) }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BookingPanel } from './BookingPanel';

const T = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const services = [{ id: S, nameTh: 'นวดไทย', nameEn: 'Thai massage', durationMin: 60, priceSatang: 90000 }];
const render = (props: Partial<Parameters<typeof BookingPanel>[0]> = {}) => renderToStaticMarkup(
  <NextIntlClientProvider locale="en" messages={en}>
    <BookingPanel therapistId={T} services={services} guestName={null} today="2030-01-15" initial={{}} error={null} {...props} />
  </NextIntlClientProvider>,
);

it('lists each treatment in the guest language with its duration and price', () => {
  const html = render();
  expect(html).toContain('Thai massage');
  expect(html).toContain('60 min');
  expect(html).toContain('900');
  expect(html).not.toContain('นวดไทย');
});
it('a guest who is not signed in gets a plain LINE link that carries where they are and what they chose', () => {
  const html = render({ initial: { serviceId: S, day: '2030-01-16', start: '2030-01-16T05:00:00.000Z' } });
  const href = /href="([^"]*\/api\/line\/login[^"]*)"/.exec(html)?.[1]?.replaceAll('&amp;', '&') ?? '';
  const u = new URL(href, 'https://x.test');
  expect(u.searchParams.get('returnTo')).toBe(`/en/book/${T}`);
  expect(u.searchParams.get('serviceId')).toBe(S);
  expect(u.searchParams.get('day')).toBe('2030-01-16');
  expect(u.searchParams.get('start')).toBe('2030-01-16T05:00:00.000Z');
  expect(html).not.toContain('data-testid="book-confirm"');
});
it('a signed-in guest sees who they are booking as and a confirm button, disabled until a time is chosen', () => {
  const html = render({ guestName: 'Nok' });
  expect(html).toContain('Booking as Nok');
  expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="book-confirm"|<button[^>]*data-testid="book-confirm"[^>]*disabled/);
  expect(html).not.toContain('Continue with LINE');
});
it('a failed sign-in shows its message; an unknown error code from the address bar is ignored', () => {
  expect(render({ error: 'login' })).toContain('could not sign you in with LINE');
  expect(render({ error: '<script>alert(1)</script>' })).not.toContain('script');
});
it('a therapist with no online treatments shows the explanation and no form', () => {
  const html = render({ services: [] });
  expect(html).toContain('no treatments open for online booking');
  expect(html).not.toContain('data-testid="booking-panel"');
});
