import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const insert = `insert into job_applications(full_name, age, contact, experience, work_type) values ('สมชาย', 28, '@somchai', '1_3', 'full_time') returning id`;

test('an application starts as new and carries no insert rights for staff', async () => {
  const id = (await asAdmin((c) => c.query(insert))).rows[0].id;
  const row = (await asAdmin((c) => c.query(`select status, has_certificate, locale from job_applications where id=$1`, [id]))).rows[0];
  expect(row).toEqual({ status: 'new', has_certificate: false, locale: 'th' });
  await expect(asRole(b, 'manager', (c) => c.query(insert))).rejects.toMatchObject({ code: '42501' });
});
test('owner and manager read and update applications; other staff see none', async () => {
  const id = (await asAdmin((c) => c.query(insert))).rows[0].id;
  const seen = (r: Parameters<typeof asRole>[1]) => asRole(b, r, (c) => c.query(`select id from job_applications`)).then((x) => x.rows.length);
  expect(await seen('manager')).toBe(1);
  expect(await seen('receptionist')).toBe(0);
  expect(await seen('therapist')).toBe(0);
  await asRole(b, 'manager', (c) => c.query(`update job_applications set status='interview', correspondence='โทรแล้ว นัดวันพุธ' where id=$1`, [id]));
  const after = (await asAdmin((c) => c.query(`select status, correspondence, updated_at > created_at as touched from job_applications where id=$1`, [id]))).rows[0];
  expect(after).toMatchObject({ status: 'interview', correspondence: 'โทรแล้ว นัดวันพุธ', touched: true });
});
test('the table rejects ages and values outside the form', async () => {
  const bad = (set: string) => asAdmin((c) => c.query(`insert into job_applications(full_name, age, contact, experience, work_type) values ${set}`));
  await expect(bad(`('x', 19, 'c', 'none', 'full_time')`)).rejects.toMatchObject({ code: '23514' });
  await expect(bad(`('x', 30, 'c', 'ten_years', 'full_time')`)).rejects.toMatchObject({ code: '23514' });
  await expect(bad(`('  ', 30, 'c', 'none', 'full_time')`)).rejects.toMatchObject({ code: '23514' });
  await expect(bad(`('x', 30, 'c', 'none', 'weekends')`)).rejects.toMatchObject({ code: '23514' });
});
