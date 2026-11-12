import { Card } from '@/components/ui/card';
import { Leaf } from '@/components/shell/Leaf';
import { Wordmark } from '@/components/shell/Wordmark';
import { getBrand } from '@/lib/brand';
import { LocaleSwitch } from '@/modules/identity/components/LocaleSwitch';
import { LoginForm } from '@/modules/identity/components/LoginForm';

export default function LoginPage() {
  const brand = getBrand(process.env);
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-surface-muted px-4">
      <Leaf className="pointer-events-none absolute -bottom-8 -left-8 size-48 text-stone sm:size-64" />
      <div className="relative flex justify-end py-4">
        <LocaleSwitch />
      </div>
      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 pb-12">
        <Card className="flex flex-col gap-6 p-6">
          <Wordmark name={brand.name} tagline={brand.tagline} />
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
