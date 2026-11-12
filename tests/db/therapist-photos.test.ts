import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => {
  b = await resetDb();
  await asAdmin((c) => c.query(`delete from storage.objects`));
});

const insertObject = (name: string) => (c: import('pg').PoolClient) =>
  c.query(`insert into storage.objects(bucket_id, name) values ('therapist-photos', $1) returning id`, [name]);

test('owner and manager can set a therapist photo_path', async () => {
  for (const r of ['owner', 'manager'] as const) {
    const res = await asRole(b, r, (c) => c.query(`update therapists set photo_path=$2 where id=$1 returning id`, [b.t1, `${b.t1}-1.jpg`]));
    expect(res.rowCount, r).toBe(1);
  }
});
test('receptionist and therapist cannot change photo_path', async () => {
  for (const r of ['receptionist', 'therapist'] as const) {
    const res = await asRole(b, r, (c) => c.query(`update therapists set photo_path='x.jpg' where id=$1 returning id`, [b.t1]));
    expect(res.rowCount, r).toBe(0);
  }
});
test('owner and manager can insert, read and delete an object in therapist-photos', async () => {
  for (const r of ['owner', 'manager'] as const) {
    await asRole(b, r, async (c) => {
      await insertObject(`${r}.jpg`)(c);
      expect((await c.query(`select 1 from storage.objects where bucket_id='therapist-photos' and name=$1`, [`${r}.jpg`])).rowCount).toBe(1);
      expect((await c.query(`delete from storage.objects where bucket_id='therapist-photos' and name=$1`, [`${r}.jpg`])).rowCount).toBe(1);
    });
  }
});
test('receptionist and therapist cannot read or insert objects in therapist-photos', async () => {
  await asAdmin((c) => insertObject('seed.jpg')(c));
  for (const r of ['receptionist', 'therapist'] as const) {
    const seen = await asRole(b, r, (c) => c.query(`select 1 from storage.objects where bucket_id='therapist-photos'`));
    expect(seen.rowCount, r).toBe(0);
    await expect(asRole(b, r, insertObject(`${r}.jpg`)), r).rejects.toThrow();
  }
});
test('anonymous visitors cannot read the bucket', async () => {
  await asAdmin((c) => insertObject('seed.jpg')(c));
  const seen = await asRole(b, 'anon', (c) => c.query(`select 1 from storage.objects where bucket_id='therapist-photos'`));
  expect(seen.rowCount).toBe(0);
});
test('the bucket is private', async () => {
  const r = await asAdmin((c) => c.query(`select public from storage.buckets where id='therapist-photos'`));
  expect(r.rows).toEqual([{ public: false }]);
});
