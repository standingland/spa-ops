import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getBrand } from '@/lib/brand';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';
import { directoryCopy } from '@/modules/public/components/directoryCopy';
import styles from '@/modules/public/components/directory.module.css';

export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const brand = getBrand(process.env);
  const locale = await getLocale();
  const t = directoryCopy[locale === 'th' ? 'th' : 'en'];
  return (
    <div className={styles.site}>
      <a href="#booking-main" className={styles.skip}>{t.skip}</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={brand.name}>
          <span className={styles.brandMark} aria-hidden="true">B</span>
          <span>{brand.name}<small>{brand.tagline}</small></span>
        </Link>
        <nav className={styles.navigation} aria-label={t.navigation}>
          <Link href="/book#therapists">{t.therapists}</Link>
          <Link href="/#experience">{t.experience}</Link>
        </nav>
        <div className={styles.headerActions}><LocaleSwitch /><Link className={styles.homeLink} href="/">{t.home} <span aria-hidden="true">↗</span></Link></div>
      </header>
      <main id="booking-main" className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand}>{brand.name}<small>{brand.tagline}</small></Link>
        <p>{t.footer}</p>
        <Link href="/login">{t.staff}</Link>
      </footer>
    </div>
  );
}
