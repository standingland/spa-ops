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

const lineRow = (id: string, template: OutboxRow['template'] = 'booking_confirmed'): OutboxRow => ({ ...row(id, 'cl'), template });
const contacts = {
  cl: { phone: null, email: null, lineUserId: 'U-line' },
  both: { phone: '0810000000', email: null, lineUserId: 'U-line' },
  ph: { phone: '0810000000', email: null, lineUserId: null },
};

test('a customer with a LINE id is sent on the line channel, ahead of sms', async () => {
  const sent: string[] = [];
  const port: OutboxPort = { claim: async () => [{ ...row('a', 'both') }, lineRow('b')], contact: async (id) => (contacts as Record<string, { phone: string | null; email: string | null; lineUserId: string | null }>)[id], complete: async () => {} };
  await dispatchPending(port, { send: async (m) => { sent.push(m.channel + ':' + m.to); } }, { senderName: 'Studio' });
  expect(sent).toEqual(['line:U-line', 'line:U-line']);
});
test('a customer with only a phone is still sent by sms (staff-made bookings are unchanged)', async () => {
  const sent: string[] = [];
  const port: OutboxPort = { claim: async () => [row('a', 'ph')], contact: async (id) => (contacts as Record<string, { phone: string | null; email: string | null; lineUserId: string | null }>)[id], complete: async () => {} };
  await dispatchPending(port, { send: async (m) => { sent.push(m.channel + ':' + m.to); } }, { senderName: 'Studio' });
  expect(sent).toEqual(['sms:0810000000']);
});
test('the confirmed message carries the cancel link when the port supplies one; other messages never do', async () => {
  const texts: string[] = [];
  const port: OutboxPort = {
    claim: async () => [lineRow('a'), lineRow('b', 'booking_cancelled')],
    contact: async () => contacts.cl, complete: async () => {},
    cancelUrl: async (bookingId) => `https://spa.example.com/th/book/cancel?token=T-${bookingId}`,
  };
  await dispatchPending(port, { send: async (m) => { texts.push(m.text); } }, { senderName: 'Studio' });
  expect(texts[0]).toContain('https://spa.example.com/th/book/cancel?token=T-ba');
  expect(texts[1]).not.toContain('http');
});
test('a failing LINE push (guest blocked the account) is recorded as failed with the reason, and the next message still goes', async () => {
  const done: [string, boolean, string?][] = [];
  const port: OutboxPort = { claim: async () => [lineRow('a'), lineRow('b')], contact: async () => contacts.cl, complete: async (id, ok, e) => { done.push([id, ok, e]); } };
  let n = 0;
  const r = await dispatchPending(port, { send: async () => { if (n++ === 0) throw new Error('LINE_PUSH_FAILED 403'); } }, { senderName: 'Studio' });
  expect(r).toEqual({ sent: 1, failed: 1 });
  expect(done).toEqual([['a', false, 'LINE_PUSH_FAILED 403'], ['b', true, undefined]]);
});

test('the cancel link is asked for with the booking id and its start, so the link can outlive the booking', async () => {
  const asked: [string, string][] = [];
  const port: OutboxPort = {
    claim: async () => [lineRow('a')], contact: async () => contacts.cl, complete: async () => {},
    cancelUrl: async (bookingId, startsAt) => { asked.push([bookingId, startsAt]); return 'https://x.test/c'; },
  };
  await dispatchPending(port, { send: async () => {} }, { senderName: 'Studio' });
  expect(asked).toEqual([['ba', '2030-01-15T03:00:00Z']]);
});
