import { z } from 'zod';
import { publicDb } from '@/modules/public/db';
import { clientIp } from '@/modules/public/http';
import { allow } from '@/modules/public/rateLimit';

/** A public therapist's photo, streamed from private storage only while the database says the therapist is public. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const notFound = () => new Response('Not found', { status: 404 });
  if (!z.uuid().safeParse(id).success) return notFound();
  if (!(await allow(`photo:${clientIp(_request.headers)}`, 120, 60))) return new Response('Too many requests', { status: 429 });
  const db = publicDb();
  const { data: path } = await db.rpc('public_therapist_photo_path', { p_therapist_id: id });
  if (typeof path !== 'string' || !path) return notFound();
  const { data: file, error } = await db.storage.from('therapist-photos').download(path);
  if (error || !file) return notFound();
  return new Response(file, {
    headers: { 'content-type': file.type === 'image/png' ? 'image/png' : 'image/jpeg', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' },
  });
}
