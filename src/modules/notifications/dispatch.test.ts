import { test, expect } from 'vitest';
import { dispatchPending, type OutboxPort, type OutboxRow, type Sender } from './dispatch';

const row = (id: string, customer: string): OutboxRow => ({ id, customer_id: customer, template: 'booking_confirmed', payload: { booking_id: 'b' + id, starts_at: '2030-01-15T03:00:00Z' } });

test('one bad message does not stop the others, and each outcome is recorded', async () => {
  const done: [string, boolean, string?][] = [];
  const port: OutboxPort = {
    claim: async () => [row('a', 'c1'), row('b', 'c2'), row('c', 'c3')],
    contact: async (id) => ({ c1: { phone: '0810000000', email: null }, c2: { phone: null, email: null }, c3: { phone: null, email: 'x@y.z' } }[id]!),
    complete: async (id, ok, error) => { done.push([id, ok, error]); },
  };
  const sent: string[] = [];
  const sender: Sender = { send: async (m) => { if (m.channel === 'email') throw new Error('smtp down'); sent.push(m.channel + ':' + m.to); } };
  expect(await dispatchPending(port, sender, { senderName: 'Studio' })).toEqual({ sent: 1, failed: 2 });
  expect(sent).toEqual(['sms:0810000000']);
  expect(done).toEqual([['a', true, undefined], ['b', false, 'NO_CONTACT'], ['c', false, 'smtp down']]);
});
test('messages are sent in Thai with the sender name', async () => {
  const texts: string[] = [];
  const port: OutboxPort = {
    claim: async () => [row('a', 'c1')],
    contact: async () => ({ phone: '0810000000', email: null }),
    complete: async () => {},
  };
  await dispatchPending(port, { send: async (m) => { texts.push(m.text); } }, { senderName: 'Studio' });
  expect(texts).toEqual(['Studio: ยืนยันนัดหมายของคุณ วันที่ 15/01/2030 เวลา 10:00 น.']);
});
