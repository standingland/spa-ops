import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NowStrip } from './NowStrip';

const labels = {
  title: 'On shift now', empty: 'Nobody is on shift right now',
  state: { in_treatment: 'In treatment', on_break: 'On break', free: 'Free' },
  inRoom: (room: string) => `in ${room}`,
};

it('lists each person with state text and room', () => {
  const html = renderToStaticMarkup(<NowStrip labels={labels} people={[
    { therapistId: 'a', name: 'Nok', photoUrl: null, state: 'in_treatment', roomName: 'R1' },
    { therapistId: 'b', name: 'Mai', photoUrl: null, state: 'free', roomName: null },
  ]} />);
  expect(html).toContain('data-testid="now-strip"');
  expect(html).toContain('data-testid="now-a"');
  expect(html).toContain('In treatment');
  expect(html).toContain('in R1');
  expect(html).toContain('data-testid="now-b"');
  expect(html).toContain('Free');
});
it('shows the empty state when nobody is on shift', () => {
  const html = renderToStaticMarkup(<NowStrip labels={labels} people={[]} />);
  expect(html).toContain('Nobody is on shift right now');
  expect(html).not.toMatch(/data-testid="now-(?!strip)/);
});
