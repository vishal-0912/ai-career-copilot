'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  function switchMode(target: 'signin' | 'signup') {
    setMode(target);
    setEmail('');
    setPassword('');
    setError(null);
  }

  const tabBase =
    'bg-transparent border-none pb-3 pt-0 px-0 cursor-pointer text-sm font-semibold border-b-2';

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-10 bg-[#4E220F] p-14 text-[#F7F1DE]">
        <Link href="/" className="font-serif text-xl font-semibold no-underline">
          Career Copilot
        </Link>
        <div>
          <div className="mb-[22px] font-mono text-xs uppercase tracking-[0.12em] text-[#D8B08C]">
            Since 2026
          </div>
          <p className="max-w-[440px] font-serif text-[34px] leading-[1.3]">
            Built for the job search you&rsquo;d actually want to spend less time on.
          </p>
        </div>
        <div className="text-[13px] text-[#C9A480]">Resume in, tailored applications out.</div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#F7F1DE] p-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-[30px] flex gap-7 border-b border-[rgba(78,34,15,0.2)]">
            <button
              onClick={() => switchMode('signin')}
              className={`${tabBase} ${
                mode === 'signin'
                  ? 'border-[#9D6638] text-[#4E220F]'
                  : 'border-transparent text-[#8A7A5E]'
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`${tabBase} ${
                mode === 'signup'
                  ? 'border-[#9D6638] text-[#4E220F]'
                  : 'border-transparent text-[#8A7A5E]'
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="flex flex-col gap-[18px]">
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-0 border-b-[1.5px] border-[rgba(78,34,15,0.3)] bg-transparent px-0.5 py-2 text-sm text-[#4E220F] placeholder:text-[#A6997C] focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-0 border-b-[1.5px] border-[rgba(78,34,15,0.3)] bg-transparent px-0.5 py-2 text-sm text-[#4E220F] placeholder:text-[#A6997C] focus:outline-none"
            />
            {error && <p className="text-sm text-[#A34B3F]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-1.5 w-full rounded-md bg-[#9D6638] py-[13px] text-sm font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29] disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
            </button>
          </form>

          <div className="my-[22px] flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(78,34,15,0.15)]" />
            <span className="font-mono text-[11px] text-[#8A7A5E]">or</span>
            <div className="h-px flex-1 bg-[rgba(78,34,15,0.15)]" />
          </div>

          <button
            onClick={handleGoogleAuth}
            className="w-full rounded-md border border-[rgba(78,34,15,0.25)] py-3 text-sm text-[#4E220F] transition-colors hover:bg-[rgba(78,34,15,0.06)]"
          >
            Continue with Google
          </button>

          <button
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="mt-5 w-full bg-transparent text-center text-[13px] text-[#8A7A5E] underline"
          >
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
