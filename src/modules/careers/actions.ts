'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { failFrom } from '@/lib/action';
import { publicDb } from '@/modules/public/db';
import { clientIp } from '@/modules/public/http';
import { allow } from '@/modules/public/rateLimit';

const ApplicationInput = z.object({
  fullName: z.string().trim().min(1).max(120),
  age: z.number().int().min(20).max(65),
  contact: z.string().trim().min(1).max(120),
  experience: z.enum(['none', 'under_1', '1_3', '3_5', '5_plus']),
  hasCertificate: z.boolean(),
  workType: z.enum(['full_time', 'part_time']),
  skills: z.string().trim().max(1000),
  locale: z.enum(['en', 'th']),
});
export type ApplicationInput = z.input<typeof ApplicationInput>;

/** Saves one application from the public careers page. Rate limited per visitor address; the table is written with the service role only. */
export async function submitApplication(input: ApplicationInput): Promise<{ ok: true } | { ok: false; code: string }> {
  const p = ApplicationInput.safeParse(input);
  if (!p.success) return { ok: false, code: 'INVALID_INPUT' };
  const ip = clientIp(await headers());
  if (!(await allow(`careers:${ip}`, 5, 3600))) return { ok: false, code: 'RATE_LIMITED' };
  const a = p.data;
  const { error } = await publicDb().from('job_applications').insert({
    full_name: a.fullName,
    age: a.age,
    contact: a.contact,
    experience: a.experience,
    has_certificate: a.hasCertificate,
    work_type: a.workType,
    skills: a.skills || null,
    locale: a.locale,
  });
  if (error) return { ok: false, code: failFrom(error).code };
  return { ok: true };
}
