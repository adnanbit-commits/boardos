'use client';
// app/register/page.tsx
// Registration page — name + email + password → create account → dashboard.
// After registration the user lands on an empty dashboard with a prompt
// to create their first company or accept a pending invite.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const router              = useRouter();
  const { register, token } = useAuth();

  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  // Live password strength indicator
  const passwordScore = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8)  score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    return score; // 0-4
  })();

  const strengthColor =
    passwordScore <= 1 ? '#EF4444' :
    passwordScore <= 2 ? '#F59E0B' :
    passwordScore <= 3 ? '#22C55E' : '#4F7FFF';

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][passwordScore];

  async function handleSubmit(e: React.FormEvent) {
    (e as any).preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(
        (err as any)?.status === 409
          ? 'An account with this email already exists.'
          : (err as any)?.status
          ? (err as any).message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center px-4 py-12"
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

        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-[#4F7FFF] via-[#60A5FA] to-transparent" />

          <div className="px-8 py-8">
            <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              Create account
            </h1>
            <p className="text-[#6B7280] text-sm mb-8">
              Set up your BoardOS account to manage board governance.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName((e as any).target.value)}
                  placeholder="Ananya Sharma"
                  required
                  autoFocus
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3
                    text-sm text-[#F0F2F5] placeholder:text-[#374151]
                    focus:outline-none focus:border-[#4F7FFF] focus:ring-1 focus:ring-[#4F7FFF]/20
                    transition-colors"
                />
              </div>

              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Work Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail((e as any).target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3
                    text-sm text-[#F0F2F5] placeholder:text-[#374151]
                    focus:outline-none focus:border-[#4F7FFF] focus:ring-1 focus:ring-[#4F7FFF]/20
                    transition-colors"
                />
              </div>

              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword((e as any).target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3
                    text-sm text-[#F0F2F5] placeholder:text-[#374151]
                    focus:outline-none focus:border-[#4F7FFF] focus:ring-1 focus:ring-[#4F7FFF]/20
                    transition-colors"
                />
                {/* Password strength bar */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex-1 rounded-full transition-all duration-300"
                          style={{ background: i <= passwordScore ? strengthColor : '#232830' }} />
                      ))}
                    </div>
                    <p className="text-[10px]" style={{ color: strengthColor }}>{strengthLabel}</p>
                  </div>
                )}
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
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>

          <div className="px-8 py-4 border-t border-[#232830] bg-[#13161B] text-center">
            <p className="text-[#6B7280] text-xs">
              Already have an account?{' '}
              <Link href="/login" className="text-[#4F7FFF] hover:text-blue-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
