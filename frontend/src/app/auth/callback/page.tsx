'use client';
// app/auth/callback/page.tsx
// useSearchParams must be inside a Suspense boundary in Next.js 14

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveSession, getToken } from '@/lib/auth';

const INTENTS = [
  { value: 'cs_ca',    label: 'CS / CA',           desc: 'I manage governance for client companies' },
  { value: 'director', label: 'Director',           desc: 'I sit on a company board' },
  { value: 'observer', label: 'Observer / Advisor', desc: 'I attend meetings in an advisory capacity' },
  { value: 'other',    label: 'Other',              desc: 'Something else' },
];

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function CallbackInner() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [step,   setStep]   = useState<'loading'|'onboarding'>('loading');
  const [intent, setIntent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token      = params.get('token');
    const onboarding = params.get('onboarding') === '1';
    if (!token) { router.replace('/login'); return; }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(user => {
        saveSession(token, user);
        if (onboarding) setStep('onboarding');
        else router.replace('/');  // landing page shows workspace panel for logged-in users
      })
      .catch(() => router.replace('/login'));
  }, [params, router]);

  async function handleOnboarding() {
    if (!intent) return;
    setSaving(true);
    try {
      const token = getToken();
      await fetch(`${API}/auth/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ intent }),
      });
    } catch {}
    router.replace('/');
  }

  if (step === 'loading') return (
    <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#232830] border-t-[#4F7FFF] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center px-4"
      style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} .fade-up{animation:fadeUp 0.35s ease forwards}`}</style>

      <div className="w-full max-w-md fade-up">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-8 h-8 bg-[#4F7FFF] rounded-lg flex items-center justify-center text-white font-black text-base">S</div>
          <span className="text-[#F0F2F5] font-bold text-lg tracking-tight">SafeMinutes</span>
        </div>
        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-[#4F7FFF] via-[#60A5FA] to-transparent" />
          <div className="px-8 py-8">
            <h1 className="text-[#F0F2F5] font-bold text-2xl mb-2"
              style={{ fontFamily:"'Playfair Display',Georgia,serif", letterSpacing:'-0.02em' }}>
              How will you use SafeMinutes?
            </h1>
            <p className="text-[#6B7280] text-sm mb-8">Helps us personalise your experience. You can change this any time.</p>
            <div className="space-y-3 mb-8">
              {INTENTS.map(i => (
                <button key={i.value} onClick={() => setIntent(i.value)}
                  className="w-full text-left p-4 rounded-xl border transition-all"
                  style={{ background: intent===i.value?'#1A2540':'#13161B', borderColor: intent===i.value?'#4F7FFF':'#232830' }}>
                  <p className="text-[#F0F2F5] text-sm font-semibold">{i.label}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{i.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={handleOnboarding} disabled={!intent || saving}
              className="w-full bg-[#4F7FFF] hover:bg-[#3D6FEF] disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
              {saving ? 'Saving…' : 'Continue →'}
            </button>
            <button onClick={() => router.replace('/')}
              className="w-full mt-3 text-[#6B7280] text-xs hover:text-[#9CA3AF] transition-colors">
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#232830] border-t-[#4F7FFF] rounded-full animate-spin" />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  );
}
