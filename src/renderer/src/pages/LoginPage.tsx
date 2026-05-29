import { type FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole, Mail, Truck } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { FormInput } from '@renderer/components/ui/FormInput';
import { notify } from '@renderer/components/ui/Notification';
import { useAuth } from '@renderer/context/AuthContext';
import { hasSupabaseConfig } from '@renderer/services/supabaseClient';

export function LoginPage(): JSX.Element {
  const { session, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      notify.success('Signed in.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-panel lg:grid-cols-[1.1fr_0.9fr]">
          <section className="flex flex-col justify-between bg-ink-900 p-10 text-white">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-brand-500">
                <Truck size={26} aria-hidden="true" />
              </div>
              <h1 className="mt-8 text-3xl font-bold tracking-normal">CHEE LEONG POULTRY TRADING</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-stone-200">
                Internal desktop order management for daily chicken orders, farm purchases, costs,
                sales, deductions, profit, and farm payments.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md bg-white/10 p-4">
                <p className="font-semibold">RM</p>
                <p className="mt-1 text-stone-300">Malaysia currency</p>
              </div>
              <div className="rounded-md bg-white/10 p-4">
                <p className="font-semibold">8kg</p>
                <p className="mt-1 text-stone-300">Default cage weight</p>
              </div>
              <div className="rounded-md bg-white/10 p-4">
                <p className="font-semibold">Daily</p>
                <p className="mt-1 text-stone-300">Order workflow</p>
              </div>
            </div>
            <p className="mt-8 text-xs text-stone-400">
              Copyright (c) 2026 Lee Wan Wu. All rights reserved.
            </p>
          </section>

          <section className="p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-ink-900">Sign in</h2>
            <p className="mt-2 text-sm text-ink-500">Use the email and password created in Supabase Auth.</p>

            {!hasSupabaseConfig ? (
              <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Supabase environment variables are missing. Create `.env` from `.env.example` before
                running the app.
              </div>
            ) : null}

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-9 text-stone-400" size={18} />
                <FormInput
                  label="Email"
                  type="email"
                  value={email}
                  required
                  className="pl-10"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-9 text-stone-400" size={18} />
                <FormInput
                  label="Password"
                  type="password"
                  value={password}
                  required
                  className="pl-10"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !hasSupabaseConfig}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
