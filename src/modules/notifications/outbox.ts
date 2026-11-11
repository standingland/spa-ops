import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
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
      const { data, error } = await admin.from('customers').select('phone, email').eq('id', customerId).maybeSingle();
      if (error) throw new Error(error.message);
      return { phone: data?.phone?.trim() || null, email: data?.email?.trim() || null };
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
