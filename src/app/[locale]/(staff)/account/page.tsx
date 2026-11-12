import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/modules/identity/session';
import { PasswordForm } from '@/modules/identity/components/PasswordForm';

export default async function AccountPage() {
  const session = await requireRole();
  const t = await getTranslations('account');
  const roles = await getTranslations('staff.roles');
  const { data } = await (await createClient()).from('staff').select('display_name').eq('user_id', session.userId).maybeSingle();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} />
      <p className="min-w-0 break-words text-body" data-testid="account-summary">{data?.display_name} · {roles(session.role)}</p>
      <PasswordForm />
    </div>
  );
}
