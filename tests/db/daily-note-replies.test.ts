import { beforeEach, expect, test } from 'vitest';
import { asRole, deactivate, resetDb, type Actor, type Base } from './helpers';

let base: Base;
beforeEach(async () => { base = await resetDb(); });

async function postNote(yesterday = false): Promise<string> {
  return asRole(base, 'owner', async (client) => {
    const { rows } = await client.query(
      `insert into staff_daily_notes (body, author_name, day)
       values ('Shift update', 'Owner', (now() at time zone 'Asia/Bangkok')::date - $1::int)
       returning id`,
      [yesterday ? 1 : 0],
    );
    return rows[0].id;
  });
}

const reply = (actor: Actor, noteId: string, body = 'Acknowledged') =>
  asRole(base, actor, (client) => client.query(
    'insert into staff_daily_note_replies (note_id, body) values ($1, $2)', [noteId, body],
  ));

const readReplies = (actor: Actor, noteId: string) =>
  asRole(base, actor, (client) => client.query(
    'select body, author_name from staff_daily_note_replies where note_id = $1', [noteId],
  ));

test('active staff can see each other’s replies and the database assigns the author', async () => {
  const noteId = await postNote();
  await reply('therapist', noteId);
  expect((await readReplies('owner', noteId)).rows).toEqual([
    { body: 'Acknowledged', author_name: 'therapist' },
  ]);
  await expect(asRole(base, 'therapist', (client) => client.query(
    `insert into staff_daily_note_replies (note_id, body, author_name) values ($1, 'Pretending', 'owner')`,
    [noteId],
  ))).rejects.toMatchObject({ code: '42501' });
  await expect(reply('receptionist', noteId, ' \t\n ')).rejects.toMatchObject({ code: '23514' });
});

test('visitors and inactive staff cannot read or post replies', async () => {
  const noteId = await postNote();
  await reply('owner', noteId);
  await deactivate(base, 'therapist');

  for (const actor of ['customer', 'therapist'] as const) {
    expect((await readReplies(actor, noteId)).rows).toEqual([]);
    await expect(reply(actor, noteId)).rejects.toMatchObject({ code: '42501' });
  }
  await expect(readReplies('anon', noteId)).rejects.toMatchObject({ code: '42501' });
  await expect(reply('anon', noteId)).rejects.toMatchObject({ code: '42501' });
});

test('archiving hides a thread and past notes no longer accept replies', async () => {
  const noteId = await postNote();
  const oldNoteId = await postNote(true);
  await reply('receptionist', noteId);
  await expect(reply('manager', oldNoteId)).rejects.toMatchObject({ code: '42501' });

  await asRole(base, 'owner', (client) => client.query(
    'update staff_daily_notes set archived_at = now() where id = $1', [noteId],
  ));
  expect((await readReplies('receptionist', noteId)).rows).toEqual([]);
  await expect(reply('receptionist', noteId)).rejects.toMatchObject({ code: '42501' });
});
