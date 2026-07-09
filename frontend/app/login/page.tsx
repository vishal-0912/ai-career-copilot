'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Deliberately NOT calling setLoading(false) here — this component is about to
    // unmount as we navigate to the dashboard. Clearing loading first would flash the
    // button back to "Log in"/"Sign up" for a moment before the navigation lands,
    // which looked like the action had silently failed and then randomly succeeded.
    router.push('/dashboard');
    router.refresh();
  }

  async function handleGoogleAuth() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  // Switching between Log in / Sign up starts the other form fresh — carrying over
  // a failed login's email/password (and its error message) into the sign-up form
  // is confusing, especially since the fields look identical.
  function toggleMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setEmail('');
    setPassword('');
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-2xl font-semibold">
          {mode === 'signin' ? 'Log in' : 'Sign up'}
        </h1>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <button
          onClick={handleGoogleAuth}
          className="w-full rounded-md border px-3 py-2 hover:bg-gray-50"
        >
          Continue with Google
        </button>

        <button
          onClick={toggleMode}
          className="w-full text-sm text-gray-500 underline"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Log in'}
        </button>
      </div>
    </main>
  );
}
