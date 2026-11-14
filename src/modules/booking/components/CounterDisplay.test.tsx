import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CounterDisplay } from './CounterDisplay';
import type { BoardRow } from '../actions';

vi.mock('next-intl', () => ({ useLocale: () => 'th', useTranslations: () => (s: string) => s }));
vi.mock('@/lib/realtime', () => ({ useLiveRefresh: () => 'live' }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

test('counter hides guest names on first render and still shows rooms with no bookings', () => {
  const row = { bookingId: 'b', roomId: 'r1', therapistId: 't', positionId: 'p', customerDisplayName: 'PRIVATE GUEST NAME', status: 'confirmed', startsAt: '2026-11-15T10:00:00+07:00', endsAt: '2026-11-15T11:00:00+07:00' } as BoardRow;
  const html = renderToStaticMarkup(<CounterDisplay brand="Test spa" day="2026-11-15" rows={[row]} rooms={['201', '202'].map((code, i) => ({ id: `r${i + 1}`, code, display_name: `Room ${code}`, zone: null, room_positions: [{ id: 'p', label: '1', active: true }] }))} therapists={[{ id: 't', display_name: 'Therapist' }]} />);
  expect(html).not.toContain('PRIVATE GUEST NAME');
  expect(html).toContain('201');
  expect(html).toContain('202');
  expect(html).toContain('10:00–11:00');
  expect(html.match(/data-testid="counter-row"/g)).toHaveLength(2);
});
