'use client';
// app/login/page.tsx
// Clean, focused login page. No distractions — just a form and the brand mark.
// On success → router.push('/dashboard') via useAuth().login().

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router           = useRouter();
  const { login, token } = useAuth();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in → bounce to dashboard
  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    (e as any).preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(
        (err as any)?.status === 401
          ? 'Incorrect email or password.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center px-4"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.35s ease forwards; }
      `}</style>

      <div className="w-full max-w-sm fade-up">

        {/* Brand */}
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-8 h-8 bg-[#4F7FFF] rounded-lg flex items-center justify-center text-white font-black text-base">B</div>
          <span className="text-[#F0F2F5] font-bold text-lg tracking-tight">BoardOS</span>
        </div>

        {/* Card */}
        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-[#4F7FFF] via-[#60A5FA] to-transparent" />

          <div className="px-8 py-8">
            <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              Sign in
            </h1>
            <p className="text-[#6B7280] text-sm mb-8">Welcome back to your board workspace.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail((e as any).target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  autoFocus
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3
                    text-sm text-[#F0F2F5] placeholder:text-[#374151]
                    focus:outline-none focus:border-[#4F7FFF] focus:ring-1 focus:ring-[#4F7FFF]/20
                    transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest">
                    Password
                  </label>
                  <button type="button" className="text-[#4F7FFF] text-xs hover:text-blue-300 transition-colors">
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword((e as any).target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3
                    text-sm text-[#F0F2F5] placeholder:text-[#374151]
                    focus:outline-none focus:border-[#4F7FFF] focus:ring-1 focus:ring-[#4F7FFF]/20
                    transition-colors"
                />
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 bg-[#4F7FFF] hover:bg-[#3D6FEF] disabled:opacity-60
                  text-white font-semibold py-3 rounded-xl text-sm
                  flex items-center justify-center gap-2 transition-colors"
              >
                {submitting && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="px-8 py-4 border-t border-[#232830] bg-[#13161B] text-center">
            <p className="text-[#6B7280] text-xs">
              Don't have an account?{' '}
              <Link href="/register" className="text-[#4F7FFF] hover:text-blue-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
          </div>
        </div>

        <p className="text-[#374151] text-[11px] text-center mt-6 leading-relaxed">
          By signing in you agree to BoardOS's{' '}
          <span className="text-[#6B7280]">Terms of Service</span> and{' '}
          <span className="text-[#6B7280]">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
