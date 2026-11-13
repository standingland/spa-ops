import { getBrand } from '@/lib/brand';
import { Wordmark } from '@/components/shell/Wordmark';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';

/** The public pages: no staff navigation, nothing that needs a login. */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  const brand = getBrand(process.env);
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
        <Wordmark name={brand.name} tagline={brand.tagline} />
        <LocaleSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-12">{children}</main>
    </div>
  );
}
