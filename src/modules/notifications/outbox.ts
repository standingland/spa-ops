import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { parseEnv } from '@/lib/env';
import { cancelTtlSec } from '@/modules/public/http';
import { signCancelToken } from '@/modules/public/session';
import type { OutboxPort, OutboxRow, Sender } from './dispatch';


/** The only notifications file that uses the service-key client. */
export function supabaseOutbox(): OutboxPort {
  const admin = createAdminClient();
  return {
    async claim(limit) {
      const { data, error } = await admin.rpc('claim_notifications', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxRow[];
    },
    async contact(customerId) {
      const { data, error } = await admin.from('customers').select('phone, email, line_user_id').eq('id', customerId).maybeSingle();
      if (error) throw new Error(error.message);
      return { phone: data?.phone?.trim() || null, email: data?.email?.trim() || null, lineUserId: data?.line_user_id || null };
    },
    async cancelUrl(bookingId, startsAt) {
      const line = parseEnv(process.env).line;
      if (!line) return null;
      const { data, error } = await admin.from('bookings').select('source').eq('id', bookingId).maybeSingle();
      if (error) throw new Error(error.message);
      if (data?.source !== 'online') return null;
      return `${line.publicBaseUrl}/th/book/cancel?token=${signCancelToken(bookingId, cancelTtlSec(startsAt))}`;
    },
    async complete(id, ok, error) {
      const { error: e } = await admin.rpc('complete_notification', { p_id: id, p_ok: ok, p_error: error ?? null });
      if (e) throw new Error(e.message);
    },
  };
}

/** Stand-in for a real provider: one structured log line, recipient masked to its last two characters. */
export const logSender: Sender = {
  async send(m) {
    log('info', 'notification.send', { channel: m.channel, length: m.text.length });
  },
};
