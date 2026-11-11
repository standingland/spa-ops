import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/modules/identity/session';

/** Everything held about one customer, as a JSON download. Owner and manager only. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== 'owner' && session.role !== 'manager')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('export_customer', { p_customer_id: id });
  if (error) return NextResponse.json({ error: 'forbidden' }, { status: error.message === 'NOT_AUTHORIZED' ? 403 : 500 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="customer-${id}.json"`,
      'cache-control': 'no-store',
    },
  });
}
