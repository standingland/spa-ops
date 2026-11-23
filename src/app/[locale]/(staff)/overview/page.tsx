import { forbidden } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/shell/Icon';
import { Link } from '@/i18n/navigation';
import { formatTHB } from '@/lib/money';
import { addDays, bangkokDay } from '@/lib/time';
import { requireRole } from '@/modules/identity/session';
import { getReports } from '@/modules/reports/actions';
import { ReportRange } from '@/modules/reports/schema';

const SERVICE_COLORS = ['#284931', '#718358', '#a3ae83', '#d6d9bf'];

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole('owner', 'manager');
  const today = bangkokDay(new Date());
  const defaults = { from: addDays(today, -6), to: today, grain: 'day' as const };
  const [sp, t, reports, nav, locale] = await Promise.all([
    searchParams, getTranslations('workspaceDesign'), getTranslations('reports'), getTranslations('nav'), getLocale(),
  ]);
  const parsed = ReportRange.safeParse({ ...defaults, from: sp.from ?? defaults.from, to: sp.to ?? today });
  const range = parsed.success ? parsed.data : defaults;
  const data = await getReports(range);
  if (!data.ok && data.code === 'NOT_AUTHORIZED') forbidden();
  if (!data.ok) return <Alert tone="error">{data.code}</Alert>;

  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rangeDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const summary = data.summary;
  const openMinutes = data.rooms.reduce((total, row) => total + row.openMinutes, 0);
  const bookedMinutes = data.rooms.reduce((total, row) => total + row.bookedMinutes, 0);
  const revenue = data.revenue.reduce((total, row) => total + row.netCollectedSatang, 0);
  const peak = Math.max(1, ...data.revenue.map((row) => Math.abs(row.netCollectedSatang)));
  const hasNegative = data.revenue.some((row) => row.netCollectedSatang < 0);
  const orderedServices = data.services.filter((row) => row.bookedSatang > 0).sort((a, b) => b.bookedSatang - a.bookedSatang);
  const other = orderedServices.slice(3).reduce((total, row) => total + row.bookedSatang, 0);
  const serviceTotal = orderedServices.reduce((total, row) => total + row.bookedSatang, 0);
  const services = orderedServices.slice(0, 3).map((row) => ({ id: row.serviceId, name: row.name, amount: row.bookedSatang }));
  if (other) services.push({ id: 'other', name: t('otherServices'), amount: other });
  const stops = services.map((row, index) => {
    const priorAmount = services.slice(0, index).reduce((total, service) => total + service.amount, 0);
    const start = priorAmount / serviceTotal * 100;
    const end = (priorAmount + row.amount) / serviceTotal * 100;
    return `${SERVICE_COLORS[index]} ${start}% ${end}%`;
  }).join(', ');
  const returning = summary.customers ? summary.returningRate : 0;
  const rangeLabel = rangeDate.formatRange(new Date(range.from), new Date(range.to));
  const metrics = [
    { label: reports('kpi.net'), value: formatTHB(revenue), icon: 'payments' },
    { label: reports('kpi.bookings'), value: number.format(summary.bookings), icon: 'today' },
    { label: reports('roomUtilization'), value: openMinutes ? percent.format(bookedMinutes / openMinutes) : '—', icon: 'rooms' },
    { label: reports('kpi.returningRate'), value: summary.customers ? percent.format(returning) : '—', icon: 'guests' },
  ] as const;

  return (
    <div className="overview-board">
      <header className="overview-heading">
        <h1>{t('overviewTitle')}</h1>
        <details className="overview-range">
          <summary className="workspace-surface">
            <Icon name="today" />
            <span><small>{t('range')}</small><strong>{rangeLabel}</strong></span>
            <Icon name="chevron" />
          </summary>
          <form className="workspace-surface overview-range-form">
            <Field label={reports('from')}><Input type="date" name="from" defaultValue={range.from} required /></Field>
            <Field label={reports('to')}><Input type="date" name="to" defaultValue={range.to} required /></Field>
            <button className={buttonVariants({ size: 'sm' })}>{reports('apply')}</button>
          </form>
        </details>
      </header>

      <section className="overview-metrics" aria-label={reports('headline')}>
        {metrics.map(({ label, value, icon }) => (
          <article className="workspace-surface overview-metric" key={label}>
            <div><h2>{label}</h2><Icon name={icon} /></div>
            <strong className="tnum">{value}</strong>
          </article>
        ))}
      </section>

      <div className="overview-charts">
        <section className="workspace-surface overview-chart">
          <h2 className="workspace-section-title">{reports('revenueOverTime')}</h2>
          {data.revenue.length ? (
            <div className="workspace-scroll" tabIndex={0} aria-label={reports('revenueOverTime')}>
              <ul className="overview-bars" data-negative={hasNegative} style={{ minWidth: Math.max(0, data.revenue.length * 25) }}>
                {data.revenue.map((row) => (
                  <li key={row.bucket} title={`${row.bucket}: ${formatTHB(row.netCollectedSatang)}`}>
                    <div className="overview-bar-track" aria-hidden="true">
                      <span data-negative={row.netCollectedSatang < 0} style={{ height: `${Math.abs(row.netCollectedSatang) / peak * (hasNegative ? 50 : 100)}%` }} />
                    </div>
                    <span aria-hidden="true">{date.format(new Date(row.bucket))}</span>
                    <span className="sr-only">{row.bucket} {formatTHB(row.netCollectedSatang)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="overview-empty">{reports('none')}</p>}
        </section>

        <section className="workspace-surface overview-chart">
          <h2 className="workspace-section-title">{t('serviceMix')}</h2>
          {services.length ? (
            <div className="overview-mix">
              <div className="overview-ring" style={{ background: `conic-gradient(${stops})` }}>
                <span>{number.format(summary.completed)}<small>{t('completed')}</small></span>
              </div>
              <ul>{services.map((row, index) => (
                <li key={row.id}><i style={{ background: SERVICE_COLORS[index] }} />{row.name}<strong>{percent.format(row.amount / serviceTotal)}</strong></li>
              ))}</ul>
            </div>
          ) : <p className="overview-empty">{reports('none')}</p>}
        </section>

        <section className="workspace-surface overview-chart">
          <h2 className="workspace-section-title">{t('guestMix')}</h2>
          <div className="overview-returning">
            <div><strong>{number.format(summary.returningCustomers)}</strong><span>{t('guestMix')}</span></div>
            <div><strong>{number.format(summary.customers - summary.returningCustomers)}</strong><span>{t('newGuests')}</span></div>
          </div>
          <div className="overview-guest-meter" aria-hidden="true"><span style={{ width: `${returning * 100}%` }} /></div>
          <p className="text-caption text-ink-muted">{t('allGuests')} <strong className="tnum">{number.format(summary.customers)}</strong></p>
        </section>
      </div>

      <section className="workspace-surface overview-report-link">
        <div><h2 className="workspace-section-title">{nav('reports')}</h2><p>{t('reportsManagement')}</p></div>
        <Link href={{ pathname: '/reports', query: range }} className={buttonVariants({ variant: 'secondary' })}>
          {nav('reports')} <Icon name="chevron" />
        </Link>
      </section>
    </div>
  );
}
