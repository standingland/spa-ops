import { beforeEach, expect, test } from 'vitest';
import { addDays, bangkokDay } from '../../src/lib/time';
import { nextMonthDays } from '../../src/modules/staff-requests/model';
import { asAdmin, asRole, book, bkk, expectCode, resetDb, TEST_DAY, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const submit = (kind: 'sick' | 'shift', from: string, to: string) =>
  asRole(b, 'therapist', async (c) => {
    const r = await c.query(
      'insert into staff_requests(kind, during) values ($1, tstzrange($2, $3)) returning id', [kind, from, to],
    );
    return r.rows[0].id as string;
  });

test('staff can submit and withdraw their own requests, and only management can review them', async () => {
  const id = await submit('sick', bkk('00:00'), bkk('00:00', addDays(TEST_DAY, 1)));
  const read = (role: 'therapist' | 'receptionist' | 'manager') =>
    asRole(b, role, (c) => c.query('select id, status from staff_requests'));
  expect((await read('receptionist')).rows).toEqual([]);
  expect((await read('therapist')).rows).toEqual([{ id, status: 'pending' }]);
  expect((await read('manager')).rows).toEqual([{ id, status: 'pending' }]);
  await expectCode(asRole(b, 'therapist', (c) => c.query("update staff_requests set status='approved' where id=$1", [id])), 'NOT_AUTHORIZED');
  await expect(asRole(b, 'receptionist', (c) => c.query(
    "insert into staff_requests(staff_user_id, kind, during) select $1, kind, during from staff_requests where id=$2", [b.users.therapist, id],
  ))).rejects.toMatchObject({ code: '42501' });
  await asRole(b, 'therapist', (c) => c.query("update staff_requests set status='withdrawn' where id=$1", [id]));
  expect((await read('therapist')).rows).toEqual([{ id, status: 'withdrawn' }]);
});

test('approving sick leave marks an affected appointment for reassignment and preserves the booking', async () => {
  const booking = await asRole(b, 'receptionist', (c) => book(c, b));
  const id = await submit('sick', bkk('00:00'), bkk('00:00', addDays(TEST_DAY, 1)));
  const stranded = () => asRole(b, 'receptionist', (c) => c.query('select * from stranded_bookings()'));
  expect((await stranded()).rows).toEqual([]);
  const approval = () => asRole(b, 'manager', (c) => c.query(
    "update staff_requests set status='approved' where id=$1 and status='pending' returning status, affected_bookings", [id],
  ));
  const results = await Promise.all([approval(), approval()]);
  expect(results.flatMap((r) => r.rows)).toEqual([{ status: 'approved', affected_bookings: 1 }]);
  expect((await stranded()).rows).toEqual([{ booking_id: booking.id, reason: 'therapist_time_off' }]);
  const timeOff = await asAdmin((c) => c.query("select kind, note from therapist_time_off where therapist_id=$1", [b.t1]));
  expect(timeOff.rows).toEqual([{ kind: 'absence', note: null }]);
});

test('only next-month shifts are accepted and approval cannot overwrite a conflicting shift', async () => {
  const today = bangkokDay(new Date());
  const [day] = nextMonthDays(new Date());
  await expectCode(submit('shift', bkk('10:00', today), bkk('18:00', today)), 'OUT_OF_WINDOW');
  const id = await submit('shift', bkk('10:00', day), bkk('18:00', day));
  await expect(submit('shift', bkk('12:00', day), bkk('20:00', day))).rejects.toMatchObject({ code: '23P01' });
  const conflicting = await asAdmin((c) => c.query(
    'insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2, $3)) returning id',
    [b.t1, bkk('09:00', day), bkk('11:00', day)],
  ));
  const approve = () => asRole(b, 'owner', (c) => c.query(
    "update staff_requests set status='approved' where id=$1 returning status", [id],
  ));
  await expect(approve()).rejects.toMatchObject({ code: '23P01' });
  const pending = await asAdmin((c) => c.query('select status from staff_requests where id=$1', [id]));
  expect(pending.rows).toEqual([{ status: 'pending' }]);
  await asAdmin((c) => c.query('delete from therapist_shifts where id=$1', [conflicting.rows[0].id]));
  expect((await approve()).rows).toEqual([{ status: 'approved' }]);
  const published = await asAdmin((c) => c.query(
    'select id from therapist_shifts where therapist_id=$1 and during=tstzrange($2, $3)', [b.t1, bkk('10:00', day), bkk('18:00', day)],
  ));
  expect(published.rowCount).toBe(1);
});
