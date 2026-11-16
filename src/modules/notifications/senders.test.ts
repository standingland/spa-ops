import { test, expect } from 'vitest';
import { routeSender } from './senders';
import type { Sender } from './dispatch';

const rec = () => { const got: string[] = []; const s: Sender = { send: async (m) => { got.push(m.channel); } }; return { got, s }; };

test('line messages go to the LINE sender when it is configured, everything else to the fallback', async () => {
  const l = rec(); const f = rec();
  const s = routeSender(l.s, f.s);
  await s.send({ channel: 'line', to: 'U1', text: 'x' });
  await s.send({ channel: 'sms', to: '08', text: 'x' });
  await s.send({ channel: 'email', to: 'a@b.c', text: 'x' });
  expect([l.got, f.got]).toEqual([['line'], ['sms', 'email']]);
});
test('without a LINE sender, LINE messages fail rather than being reported as delivered', async () => {
  const f = rec();
  await expect(routeSender(null, f.s).send({ channel: 'line', to: 'U1', text: 'x' })).rejects.toThrow('LINE_NOT_CONFIGURED');
  expect(f.got).toEqual([]);
});
