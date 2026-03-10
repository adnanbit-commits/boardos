'use client';
// app/register/page.tsx

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function RegisterPage() {
  const router              = useRouter();
  const { register, token } = useAuth();

  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (token) router.replace('/dashboard'); }, [token, router]);

  const passwordScore = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    return s;
  })();
  const strengthColor = ['','#EF4444','#F59E0B','#22C55E','#4F7FFF'][passwordScore];
  const strengthLabel = ['','Weak','Fair','Good','Strong'][passwordScore];

  async function handleSubmit(e: React.FormEvent) {
    (e as any).preventDefault();
    setError(''); setSubmitting(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(
        err?.status === 409 ? 'An account with this email already exists.' :
        err?.status ? err.message : 'Something went wrong. Please try again.',
      );
    } finally { setSubmitting(false); }
  }

  function handleGoogle() {
    window.location.href = `${BACKEND}/auth/google`;
  }

  return (
    <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center px-4 py-12"
      style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} .fade-up{animation:fadeUp 0.35s ease forwards}`}</style>

      <div className="w-full max-w-sm fade-up">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-8 h-8 bg-[#4F7FFF] rounded-lg flex items-center justify-center text-white font-black text-base">B</div>
          <span className="text-[#F0F2F5] font-bold text-lg tracking-tight">BoardOS</span>
        </div>

        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-[#4F7FFF] via-[#60A5FA] to-transparent" />
          <div className="px-8 py-8">
            <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1"
              style={{ fontFamily:"'Playfair Display',Georgia,serif", letterSpacing:'-0.02em' }}>Create account</h1>
            <p className="text-[#6B7280] text-sm mb-8">Set up your BoardOS account to manage board governance.</p>

            {/* Google OAuth button */}
            <button onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50
                text-gray-700 font-semibold py-3 rounded-xl text-sm mb-6 transition-colors">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-[#232830]" />
              <span className="text-[#374151] text-xs">or sign up with email</span>
              <div className="flex-1 h-px bg-[#232830]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={e => setName((e as any).target.value)}
                  placeholder="Ananya Sharma" required autoFocus
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3 text-sm text-[#F0F2F5] placeholder:text-[#374151] focus:outline-none focus:border-[#4F7FFF] transition-colors" />
              </div>
              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">Work Email</label>
                <input type="email" value={email} onChange={e => setEmail((e as any).target.value)}
                  placeholder="you@company.com" required autoComplete="email"
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3 text-sm text-[#F0F2F5] placeholder:text-[#374151] focus:outline-none focus:border-[#4F7FFF] transition-colors" />
              </div>
              <div>
                <label className="block text-[#6B7280] text-[11px] font-semibold uppercase tracking-widest mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword((e as any).target.value)}
                  placeholder="At least 8 characters" required minLength={8}
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-3 text-sm text-[#F0F2F5] placeholder:text-[#374151] focus:outline-none focus:border-[#4F7FFF] transition-colors" />
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1 h-1">
                      {[1,2,3,4].map(i => (
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
              <button type="submit" disabled={submitting}
                className="w-full mt-2 bg-[#4F7FFF] hover:bg-[#3D6FEF] disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
          <div className="px-8 py-4 border-t border-[#232830] bg-[#13161B] text-center">
            <p className="text-[#6B7280] text-xs">Already have an account?{' '}
              <Link href="/login" className="text-[#4F7FFF] hover:text-blue-300 font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
