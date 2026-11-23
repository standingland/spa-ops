import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/shell/Icon';
import { WorkspaceHero } from '@/components/shell/WorkspaceHero';
import { buttonVariants } from '@/components/ui/button';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/modules/identity/session';
import { getCustomer, getRetentionCandidates, listCustomers } from '@/modules/customers/actions';
import { CustomerList } from '@/modules/customers/components/CustomerList';
import { RetentionList } from '@/modules/customers/components/RetentionList';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; tab?: string }> }) {
  const session = await requireRole('owner', 'manager', 'receptionist');
  const sp = await searchParams;
  if (sp.tab === 'retention') {
    await requireRole('owner');
    const r = await getRetentionCandidates();
    if (!r.ok) return <Alert tone="error">{r.code}</Alert>;
    return <RetentionList rows={r.rows} months={r.months} />;
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const [r, t, design, locale] = await Promise.all([
    listCustomers({ q: sp.q, page }), getTranslations('customers'), getTranslations('workspaceDesign'), getLocale(),
  ]);
  if (!r.ok) return <Alert tone="error">{r.code}</Alert>;
  const first = r.rows[0];
  const result = first && await getCustomer(first.id);
  const guest = result && result.ok ? result.customer : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
  return (
    <div className="customer-directory">
      <WorkspaceHero title={t('title')} description={design('customersDesc')} icon="guests" />
      <div className="customer-directory-grid">
        <CustomerList key={sp.q ?? ''} rows={r.rows} total={r.total} page={page} q={sp.q ?? ''} isOwner={session.role === 'owner'} selectedId={guest?.id} />
        <aside className="workspace-surface customer-preview">
          {guest ? (
            <>
              <div className="customer-preview-head">
                <span aria-hidden="true"><Avatar name={guest.displayName} /></span>
                <h2>{guest.displayName}</h2>
              </div>
              <section>
                <h3 className="workspace-section-title">{design('contact')}</h3>
                <dl>
                  <div><dt>{t('phone')}</dt><dd>{guest.phone || '—'}</dd></div>
                  <div><dt>{t('email')}</dt><dd>{guest.email || '—'}</dd></div>
                </dl>
              </section>
              <section>
                <h3 className="workspace-section-title">{t('summary')}</h3>
                <div className="customer-preview-metrics">
                  <div><span>{t('visits')}</span><strong>{guest.summary.visits}</strong></div>
                  <div><span>{t('lastVisit')}</span><strong>{guest.summary.lastVisit ? date.format(new Date(guest.summary.lastVisit)) : '—'}</strong></div>
                </div>
              </section>
              <Link href={{ pathname: `/customers/${guest.id}`, query: { ...(sp.q ? { q: sp.q } : {}), ...(page > 1 ? { page } : {}) } }}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{design('openProfile')} <Icon name="chevron" /></Link>
            </>
          ) : <p className="text-ink-muted">{design('selectGuest')}</p>}
        </aside>
      </div>
    </div>
  );
}
