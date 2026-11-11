import { LoginForm } from '@/modules/identity/components/LoginForm';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <LoginForm />
    </main>
  );
}
