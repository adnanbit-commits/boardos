'use client';
// app/invite/[token]/page.tsx
//
// Handles the full invite acceptance flow in one page:
//
//   State 1 — LOADING  : fetching invite preview from token
//   State 2 — PREVIEW  : shows company name, role, sender — login or register to accept
//   State 3 — AUTH     : inline login/register form (no redirect away from this page)
//   State 4 — ACCEPTING: POST to accept endpoint
//   State 5 — SUCCESS  : confirmation + redirect to company workspace
//   State 6 — ERROR    : expired / already used / email mismatch

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, invitations, type InvitePreview } from '@/lib/api';
import { getToken, getUser, saveSession } from '@/lib/auth';
import { Button, Input, Spinner } from '@/components/ui';

type Stage = 'loading' | 'preview' | 'auth' | 'accepting' | 'success' | 'error';
type AuthMode = 'login' | 'register';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('loading');
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── 1. Fetch invite preview ─────────────────────────────────────────────────
  useEffect(() => {
    invitations.preview(token)
      .then(data => {
        setInvite(data);
        const jwt = getToken();
        if (jwt) {
          handleAccept(jwt, data.company.id); // pass companyId directly — state not yet flushed
        } else {
          setStage('preview');
        }
      })
      .catch(err => {
        setError(
          (err as any).status === 404 ? 'This invite link is invalid or has expired.' :
          (err as any).status === 409 ? 'This invite has already been accepted.' :
          'Something went wrong loading this invite.',
        );
        setStage('error');
      });
  }, [token]);

  // ── 2. Accept invite ────────────────────────────────────────────────────────
  async function handleAccept(jwt: string, companyId?: string) {
    setStage('accepting');
    try {
      await invitations.accept(token, jwt);
      setStage('success');
      // Use passed companyId (when called before state flush) or fall back to state
      const destId = companyId ?? invite?.company.id;
      setTimeout(() => router.push(`/companies/${destId}`), 2500);
    } catch (err: any) {
      setError(
        (err as any).status === 400 ? (err as any).body?.message ?? 'Email mismatch — log in with the invited email.' :
        (err as any).status === 409 ? 'You are already a member of this company.' :
        (err as any).status === 410 ? 'This invitation has expired.' :
        'Failed to accept the invitation. Please try again.',
      );
      setStage('error');
    }
  }

  // ── 3. Auth form submit ─────────────────────────────────────────────────────
  async function handleAuthSubmit(e: React.FormEvent) {
    (e as any).preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const result = authMode === 'login'
        ? await auth.login({ email: form.email, password: form.password })
        : await auth.register({ name: form.name, email: form.email, password: form.password });

      saveSession(result.token, result.user);
      // invite state is already set here (auth form only shows after preview loads)
      await handleAccept(result.token);
    } catch (err: any) {
      setFormError(
        (err as any).status === 401 ? 'Incorrect email or password.' :
        (err as any).status === 409 ? 'An account with this email already exists. Try logging in.' :
        (err as any).body?.message ?? 'Something went wrong.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const expiresIn = invite
    ? Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0D0F12] flex flex-col items-center justify-center px-4"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
      `}</style>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-10 fade-up">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">B</div>
        <span className="text-white font-bold text-base tracking-tight">BoardOS</span>
      </div>

      <div className="w-full max-w-md">

        {/* LOADING */}
        {stage === 'loading' && (
          <div className="flex flex-col items-center gap-4 fade-up">
            <Spinner className="w-8 h-8" />
            <p className="text-zinc-500 text-sm">Loading your invitation…</p>
          </div>
        )}

        {/* ERROR */}
        {stage === 'error' && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-2xl p-8 text-center fade-up">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-white font-semibold text-lg mb-2">Invite Unavailable</h2>
            <p className="text-red-400 text-sm mb-6">{error}</p>
            <Link href="/login" className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
              Go to login →
            </Link>
          </div>
        )}

        {/* PREVIEW — invite card before auth */}
        {stage === 'preview' && invite && (
          <div className="space-y-5 fade-up">
            {/* Invite card */}
            <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
              {/* Accent bar */}
              <div className="h-1 bg-gradient-to-r from-blue-600 to-blue-400" />

              <div className="p-7">
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium mb-5">
                  Board Invitation
                </p>

                {/* Company block */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-blue-950 border border-blue-800/50 flex items-center justify-center text-blue-400 font-black text-lg">
                    {invite.company.name[0]}
                  </div>
                  <div>
                    <h1 className="text-white font-bold text-xl leading-tight"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {invite.company.name}
                    </h1>
                    {invite.company.cin && (
                      <p className="text-zinc-600 text-xs mt-0.5">CIN: {invite.company.cin}</p>
                    )}
                  </div>
                </div>

                {/* Role detail */}
                <div className="bg-[#13161B] border border-[#232830] rounded-xl p-4 space-y-3 mb-5">
                  <Row label="Invited as" value={
                    <span className="flex items-center gap-2">
                      <span className="text-white font-semibold">{invite.role}</span>
                      {false && (
                        <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full font-bold tracking-wide">
                          CHAIRMAN
                        </span>
                      )}
                    </span>
                  } />
                  <Row label="Invited by"  value={<span className="text-zinc-300">{invite.invitedBy.name}</span>} />
                  <Row label="Sent to"     value={<span className="text-zinc-300">{invite.email}</span>} />
                  <Row label="Expires in"  value={
                    <span className={expiresIn <= 1 ? 'text-red-400' : 'text-zinc-300'}>
                      {expiresIn === 0 ? 'Today' : `${expiresIn} day${expiresIn !== 1 ? 's' : ''}`}
                    </span>
                  } />
                </div>

                <p className="text-zinc-500 text-xs leading-relaxed">
                  By accepting, you'll join the board of <strong className="text-zinc-400">{invite.company.name}</strong> and
                  receive access to meetings, resolutions, and governance documents.
                </p>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => setStage('auth')}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              Accept Invitation →
            </button>
            <p className="text-center text-zinc-600 text-xs">
              This invite is only valid for {invite.email}
            </p>
          </div>
        )}

        {/* AUTH — login or register to complete acceptance */}
        {stage === 'auth' && invite && (
          <div className="space-y-4 fade-up">
            <div className="bg-[#191D24] border border-[#232830] rounded-2xl p-7">
              {/* Back to preview */}
              <button
                onClick={() => setStage('preview')}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs mb-6 transition-colors"
              >
                ← {invite.company.name}
              </button>

              <h2 className="text-white font-bold text-lg mb-1"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {authMode === 'login' ? 'Sign in to accept' : 'Create your account'}
              </h2>
              <p className="text-zinc-500 text-sm mb-6">
                {authMode === 'login'
                  ? `Log in with ${invite.email} to join the board.`
                  : `Create an account for ${invite.email} to join the board.`}
              </p>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Full Name</label>
                    <Input
                      type="text"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: (e as any).target.value }))}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Email</label>
                  <Input
                    type="email"
                    placeholder={invite.email}
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: (e as any).target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Password</label>
                  <Input
                    type="password"
                    placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: (e as any).target.value }))}
                    required
                    minLength={8}
                  />
                </div>

                {formError && (
                  <p className="text-red-400 text-xs bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Spinner className="w-3.5 h-3.5" />}
                  {authMode === 'login' ? 'Sign in & Accept' : 'Create account & Accept'}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-[#232830] text-center">
                {authMode === 'login' ? (
                  <p className="text-zinc-500 text-xs">
                    No account yet?{' '}
                    <button onClick={() => setAuthMode('register')} className="text-blue-400 hover:text-blue-300">
                      Create one
                    </button>
                  </p>
                ) : (
                  <p className="text-zinc-500 text-xs">
                    Already have an account?{' '}
                    <button onClick={() => setAuthMode('login')} className="text-blue-400 hover:text-blue-300">
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ACCEPTING */}
        {stage === 'accepting' && (
          <div className="flex flex-col items-center gap-5 fade-up">
            <Spinner className="w-8 h-8" />
            <div className="text-center">
              <p className="text-white font-medium text-sm">Joining {invite?.company.name}…</p>
              <p className="text-zinc-500 text-xs mt-1">Setting up your board access</p>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {stage === 'success' && (
          <div className="bg-green-950/40 border border-green-800/40 rounded-2xl p-8 text-center fade-up">
            <div className="w-14 h-14 bg-green-950 border border-green-800/50 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
              ✓
            </div>
            <h2 className="text-green-400 font-bold text-xl mb-2"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Welcome to the board.
            </h2>
            <p className="text-zinc-400 text-sm mb-1">
              You're now a <strong className="text-white">{invite?.role}</strong> at{' '}
              <strong className="text-white">{invite?.company.name}</strong>.
            </p>
            <p className="text-zinc-600 text-xs mt-4">Redirecting to your workspace…</p>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Small helper ─────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-600 text-xs">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}
