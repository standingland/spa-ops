import { bangkokDay, formatTime } from '@/lib/time';

export type TemplateKey = 'booking_confirmed' | 'booking_changed' | 'booking_cancelled';

// Discreet by design: no service, therapist, room or business-type wording.
const TEXT: Record<'th' | 'en', Record<TemplateKey, string>> = {
  th: {
    booking_confirmed: '{sender}: ยืนยันนัดหมายของคุณ วันที่ {date} เวลา {time} น.',
    booking_changed: '{sender}: นัดหมายของคุณเปลี่ยนเป็นวันที่ {date} เวลา {time} น.',
    booking_cancelled: '{sender}: นัดหมายวันที่ {date} เวลา {time} น. ถูกยกเลิกแล้ว',
  },
  en: {
    booking_confirmed: '{sender}: Your appointment is confirmed for {date} at {time}.',
    booking_changed: '{sender}: Your appointment has been changed to {date} at {time}.',
    booking_cancelled: '{sender}: Your appointment on {date} at {time} has been cancelled.',
  },
};

/** {date} is DD/MM/YYYY and {time} is HH:mm, both in Bangkok time. */
export function renderTemplate(key: TemplateKey, payload: { starts_at: string }, locale: 'th' | 'en', senderName: string): string {
  const [y, m, d] = bangkokDay(payload.starts_at).split('-');
  return TEXT[locale][key]
    .replace('{sender}', senderName)
    .replace('{date}', `${d}/${m}/${y}`)
    .replace('{time}', formatTime(payload.starts_at));
}
