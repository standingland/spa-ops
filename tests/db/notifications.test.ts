import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asService, resetDb, bkk, book, expectCode, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const consent = (id: string) => asAdmin((c) => c.query(`update customers set comms_consent=true, phone='0810000000' where id=$1`, [id]));
const box = () => asAdmin((c) => c.query(`select * from notification_outbox order by created_at`)).then((r) => r.rows);
const due = () => asAdmin((c) => c.query(`update notification_outbox set next_attempt_at = now()`));
const claim = () => asService((c) => c.query(`select * from claim_notifications(10)`)).then((r) => r.rows);

test('nothing is queued without consent', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  expect(await box()).toEqual([]);
});
test('create, move and cancel each queue one discreet message', async () => {
  await consent(b.c1);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('14:00'), b.t1, b.pos[0]]));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,2)`, [k.id, bkk('14:00'), b.t2, b.pos[0]]));   // reassign only: no message
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',3)`, [k.id]));
  const rows = await box();
  expect(rows.map((r) => r.template)).toEqual(['booking_confirmed', 'booking_changed', 'booking_cancelled']);
  for (const r of rows) expect(Object.keys(r.payload).sort()).toEqual(['booking_id', 'starts_at']);
});
test('a claimed message is hidden for five minutes, then claimable again if the sender died', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await claim()).map((r) => r.attempts)).toEqual([1]);
  expect(await claim()).toEqual([]);
  await due();
  expect((await claim()).map((r) => r.attempts)).toEqual([2]);
});
test('failures back off and die after five attempts; a sent message is never claimed again', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  for (let i = 1; i <= 5; i++) {
    const [m] = await claim();
    await asService((c) => c.query(`select complete_notification($1,false,'boom')`, [m.id]));
    expect((await box())[0].status).toBe(i < 5 ? 'failed' : 'dead');
    await due();
  }
  expect(await claim()).toEqual([]);
  const [dead] = await box();
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select retry_notification($1)`, [dead.id])), 'NOT_AUTHORIZED');
  await asRole(b, 'manager', (c) => c.query(`select retry_notification($1)`, [dead.id]));
  const [m] = await claim();
  await asService((c) => c.query(`select complete_notification($1,true)`, [m.id]));
  await due();
  expect(await claim()).toEqual([]);
  expect((await box())[0]).toMatchObject({ status: 'sent', attempts: 1 });
});
test('signed-in staff cannot claim or read around the rules', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  await expect(asRole(b, 'owner', (c) => c.query(`select claim_notifications(1)`))).rejects.toMatchObject({ code: '42501' });
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from notification_outbox`))).rowCount).toBe(0);
  expect((await asRole(b, 'manager', (c) => c.query(`select 1 from notification_outbox`))).rowCount).toBe(1);
});
