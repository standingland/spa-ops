import { parseEnv } from '@/lib/env';
import { lineSender } from '@/lib/line';
import { dispatchPending } from './dispatch';
import { logSender, supabaseOutbox } from './outbox';
import { routeSender } from './senders';

/** Sends whatever is due in the outbox now. Shared by the scheduler route and by actions that should not wait for it. */
export function dispatchNow() {
  const line = parseEnv(process.env).line;
  return dispatchPending(supabaseOutbox(), routeSender(line ? lineSender : null, logSender), { senderName: process.env.NOTIFY_SENDER_NAME ?? 'Studio' });
}
