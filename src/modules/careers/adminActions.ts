'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { roleOrNull } from '@/modules/identity/session';
import { APPLICATION_STATUSES, type ApplicationRow, type ApplicationStatus } from './application';

const UpdateInput = z.object({
  status: z.enum(APPLICATION_STATUSES),
  correspondence: z.string().trim().max(4000),
});

/** Owner and manager: applications from the careers page, newest first. Row-level security enforces the same rule in the database. */
export async function listApplications(): Promise<ApplicationRow[]> {
  if (!(await roleOrNull('owner', 'manager'))) return [];
  const { data } = await (await createClient())
    .from('job_applications')
    .select('id, created_at, full_name, age, contact, experience, has_certificate, work_type, skills, locale, status, correspondence')
    .order('created_at', { ascending: false })
    .limit(500);
  return (data ?? []).map((r) => ({
    id: r.id, createdAt: r.created_at, fullName: r.full_name, age: r.age, contact: r.contact, experience: r.experience,
    hasCertificate: r.has_certificate, workType: r.work_type, skills: r.skills, locale: r.locale,
    status: r.status as ApplicationStatus, correspondence: r.correspondence,
  }));
}

/** Sets the status and the team's note on one application. */
export async function updateApplication(id: string, input: z.input<typeof UpdateInput>): Promise<ActionResult> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const p = UpdateInput.safeParse(input);
  if (!z.uuid().safeParse(id).success || !p.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient())
    .from('job_applications')
    .update({ status: p.data.status, correspondence: p.data.correspondence || null })
    .eq('id', id)
    .select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}
