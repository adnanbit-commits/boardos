'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';

// ── Castle SVG logo — inline for use in header and sidebar ─────────────────
function CastleLogo({ size = 26, color = '#C4973A' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2"  y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="8"  y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="14" y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="20" y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="2" y="6" width="22" height="2" fill={color}/>
      <rect x="2" y="8" width="22" height="16" fill="none" stroke={color} strokeWidth="2"/>
      <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="5"  y="12" width="4" height="4" stroke={color} strokeWidth="1.2" fill="none"/>
      <rect x="17" y="12" width="4" height="4" stroke={color} strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

const PLATFORM_ROLE_OPTIONS = [
  { value: 'DIRECTOR',         label: 'Director',            desc: 'Board member / promoter' },
  { value: 'CS',               label: 'Company Secretary',   desc: 'Compliance officer / KMP' },
  { value: 'CA',               label: 'Chartered Accountant',desc: 'Auditor / financial advisor' },
  { value: 'COST_ACCOUNTANT',  label: 'Cost Accountant',     desc: 'Cost and management accountant' },
];

const features = [
  { icon: '&#128196;', title: 'Compliant Minutes', body: 'Minutes generated from meeting data in SS-1 format — letterhead, DINs, serial numbers, quorum statement. One-click PDF.' },
  { icon: '&#9989;',   title: 'Live Voting',       body: 'Directors vote on each resolution in real time. Results recorded with names and timestamps automatically.' },
  { icon: '&#128221;', title: 'Attendance Register',body: 'A statutory attendance register is generated separately for every meeting, as required under SS-1 Para 4.' },
  { icon: '&#128193;', title: 'Document Vault',    body: 'Store your MOA, AOA, incorporation certificate, board papers, and compliance filings in one organised place.' },
  { icon: '&#128203;', title: 'Agenda Templates',  body: 'First meeting, quarterly board, AGM — templates include all mandatory items in the correct order.' },
  { icon: '&#128279;', title: 'Circular Resolutions', body: 'Pass resolutions without a meeting under Section 175. Collect approvals from directors digitally.' },
];

export default function LandingPage() {
  const router = useRouter();
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [isLogin,       setIsLogin]       = useState(true);
  const [name,          setName]          = useState('');
  const [platformRoles, setPlatformRoles] = useState<string[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [isLoggedIn,    setIsLoggedIn]    = useState(false);
  const [userName,      setUserName]      = useState('');
  const [betaAccepted,  setBetaAccepted]  = useState(false);

  useEffect(() => {
    const token = getToken();
    const user  = getUser();
    if (token) { setIsLoggedIn(true); setUserName(user?.name ?? ''); }
  }, []);

  function toggleRole(value: string) {
    setPlatformRoles(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    );
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin
        ? { email, password }
        : { name, email, password, ...(platformRoles.length ? { platformRoles } : {}) };
      const res  = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Authentication failed');
      const { saveSession } = await import('@/lib/auth');
      saveSession(data.token, data.user);
      setUserName(data.user?.name ?? '');
      setIsLoggedIn(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.location.href = `${API}/auth/google`;
  };

  // ── Colour tokens matching the new brand ─────────────────────────────────
  const C = {
    charcoal:    '#1C1A18',
    charcoalMid: '#252320',
    charcoalLt:  '#33302A',
    charcoalBdr: 'rgba(255,255,255,0.07)',
    crimson:     '#8B1A1A',
    crimsonMid:  '#A52020',
    gold:        '#C4973A',
    goldMute:    'rgba(196,151,58,0.12)',
    goldBdr:     'rgba(196,151,58,0.22)',
    stone:       '#F5F2EE',
    ink:         '#231F1B',
    white:       '#FDFCFB',
    textDim:     'rgba(255,255,255,0.5)',
    textFaint:   'rgba(255,255,255,0.25)',
    textMuted:   'rgba(255,255,255,0.35)',
    ruleDark:    'rgba(255,255,255,0.07)',
  };

  const s: Record<string, React.CSSProperties> = {
    page:     { display: 'flex', minHeight: '100vh', fontFamily: "'Instrument Sans', system-ui, sans-serif", background: C.charcoal, color: '#E8E4DE' },
    left:     { flex: 1, overflowY: 'auto', borderRight: `1px solid ${C.charcoalBdr}` },
    right:    { width: '390px', flexShrink: 0, background: C.charcoalMid, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', padding: '48px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },

    // header
    header:   { padding: '22px 56px', borderBottom: `1px solid ${C.charcoalBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    logoWrap: { display: 'flex', alignItems: 'center', gap: '10px' },
    logoDivider: { width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 2px' },
    logoText: { fontSize: '15px', fontWeight: 600, color: '#fff', letterSpacing: '0.09em', textTransform: 'uppercase' as const },
    headerRight: { fontSize: '11px', color: C.textFaint, letterSpacing: '0.04em' },

    // hero
    hero:     { padding: '64px 56px 52px' },
    eyebrow:  { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.gold, marginBottom: '20px' },
    h1:       { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(30px, 3vw, 46px)', fontWeight: 600, lineHeight: 1.12, color: '#fff', maxWidth: '580px', marginBottom: '20px', letterSpacing: '-0.02em' },
    h1em:     { fontStyle: 'italic', color: 'rgba(212,171,106,0.9)' },
    heroSub:  { fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '17px', fontWeight: 300, lineHeight: 1.75, color: C.textDim, maxWidth: '520px', marginBottom: '36px' },

    // feature grid
    featGrid: { padding: '0 56px', marginBottom: '72px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: C.charcoalBdr, border: `1px solid ${C.charcoalBdr}`, borderRadius: '10px', overflow: 'hidden' },
    featCard: { background: C.charcoal, padding: '24px 22px' },
    featIcon: { fontSize: '18px', marginBottom: '10px', display: 'block' },
    featTitle:{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '6px' },
    featBody: { fontSize: '12px', color: C.textMuted, lineHeight: 1.65 },

    // footer
    footer:   { padding: '24px 56px', borderTop: `1px solid ${C.charcoalBdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    footerL:  { fontSize: '11px', color: C.textFaint },
    footerR:  { fontSize: '11px', color: C.textFaint, display: 'flex', gap: '20px' },

    // login sidebar
    loginH:   { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 500, fontStyle: 'italic', color: '#fff', marginBottom: '6px' },
    loginSub: { fontSize: '13px', color: C.textMuted, marginBottom: '28px', lineHeight: 1.6 },
    tabRow:   { display: 'flex', background: C.charcoal, borderRadius: '6px', padding: '3px', marginBottom: '22px', border: `1px solid ${C.charcoalBdr}` },
    tabBtn:   { flex: 1, padding: '8px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent', color: C.textMuted, fontFamily: "'Instrument Sans', system-ui, sans-serif", fontWeight: 500 },
    tabBtnActive: { flex: 1, padding: '8px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: C.charcoalLt, color: '#fff', fontFamily: "'Instrument Sans', system-ui, sans-serif", fontWeight: 600 },
    formGroup:{ marginBottom: '14px' },
    label:    { display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.textMuted, marginBottom: '7px' },
    input:    { width: '100%', padding: '11px 14px', background: C.charcoal, border: `1px solid ${C.charcoalBdr}`, borderRadius: '6px', color: '#E8E4DE', fontSize: '14px', fontFamily: "'Instrument Sans', system-ui, sans-serif", outline: 'none' },
    errorBox: { fontSize: '12px', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px' },
    btnPrimary: { width: '100%', padding: '12px', background: C.crimson, color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: "'Instrument Sans', system-ui, sans-serif", border: 'none', borderRadius: '7px', cursor: 'pointer', marginBottom: '10px', letterSpacing: '0.01em' },
    btnDisabled:{ width: '100%', padding: '12px', background: C.crimson, color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: "'Instrument Sans', system-ui, sans-serif", border: 'none', borderRadius: '7px', cursor: 'not-allowed', opacity: 0.55, marginBottom: '10px' },
    divider:  { display: 'flex', alignItems: 'center', gap: '12px', margin: '14px 0' },
    divLine:  { flex: 1, height: '1px', background: C.charcoalBdr },
    divText:  { fontSize: '11px', color: C.textFaint },
    btnGoogle:{ width: '100%', padding: '11px', background: 'transparent', border: `1px solid ${C.charcoalBdr}`, borderRadius: '7px', color: C.textMuted, fontSize: '13px', fontFamily: "'Instrument Sans', system-ui, sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'border-color 0.15s' },
    loginNote:{ marginTop: '22px', paddingTop: '18px', borderTop: `1px solid ${C.charcoalBdr}`, fontSize: '11px', color: C.textFaint, lineHeight: 1.65 },
  };

  return (
    <div style={s.page}>
      {/* ── LEFT ──────────────────────────────────────────────────────── */}
      <div style={s.left}>

        {/* Header */}
        <header style={s.header}>
          <div style={s.logoWrap}>
            <CastleLogo size={24} color="#C4973A" />
            <div style={s.logoDivider} />
            <span style={s.logoText}>SafeMinutes</span>
          </div>
          <span style={s.headerRight}>Board Governance for Indian Companies</span>
        </header>

        {/* Hero — two column with demo card */}
        <section style={{ padding: '52px 56px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
          <div>
            <div style={s.eyebrow}>
              <span style={{ width: '18px', height: '1px', background: '#C4973A', display: 'inline-block', flexShrink: 0 }} />
              Board Governance &middot; Indian Private Companies
            </div>
            <h1 style={s.h1}>
              Your board meetings,{' '}
              <span style={s.h1em}>finally in order.</span>
            </h1>
            <p style={s.heroSub}>
              SafeMinutes guides your board through every meeting &mdash; agenda, attendance, voting, and minutes &mdash; and produces the right documents at the end. No more Word files. No more chasing signatures.
            </p>
          </div>

          {/* Product demo card */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px', padding: '24px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>Q1 2026 Board Meeting</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginTop: '1px' }}>Acme Ventures Pvt Ltd &middot; In progress</div>
              </div>
            </div>
            {[
              { done: true,   active: false, num: '1', text: 'Quorum confirmed — 3 of 3 directors', badge: null },
              { done: true,   active: false, num: '2', text: 'Director declarations noted',              badge: null },
              { done: false,  active: true,  num: '3', text: 'Auditor appointment — voting open',  badge: 'Live vote' },
              { done: false,  active: false, num: '4', text: 'Bank account authorisation',              badge: null },
              { done: false,  active: false, num: '5', text: 'Any other business',                      badge: null },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700,
                  background: row.done ? 'rgba(74,222,128,0.15)' : row.active ? 'rgba(196,151,58,0.2)' : 'rgba(255,255,255,0.06)',
                  color:      row.done ? '#4ade80'              : row.active ? '#C4973A'               : 'rgba(255,255,255,0.3)' }}>
                  {row.done
                    ? <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : row.num}
                </div>
                <span style={{ fontSize: '11px', color: row.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)', fontWeight: row.active ? 500 : 400, flex: 1 }}>{row.text}</span>
                {row.badge && (
                  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: '3px', background: 'rgba(196,151,58,0.15)', color: '#C4973A', border: '1px solid rgba(196,151,58,0.25)', whiteSpace: 'nowrap' }}>
                    {row.badge}
                  </span>
                )}
              </div>
            ))}
            <p style={{ marginTop: '14px', textAlign: 'center', fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
              Minutes generated automatically when the meeting closes.
            </p>
          </div>
        </section>

        {/* Feature strip */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', margin: '0 0 0 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
          {[
            { label: 'SS-1 minutes, auto-generated' },
            { label: 'Live voting on every resolution' },
            { label: 'Attendance register exported separately' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '14px 28px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4973A', flexShrink: 0, opacity: 0.7 }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.32)', fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Features grid */}
        <div style={{ padding: '32px 56px 0', marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C4973A', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '16px', height: '2px', background: '#C4973A', display: 'inline-block' }} />
            What it does
          </div>
        </div>
        <div style={s.featGrid}>
          {features.map(f => (
            <div key={f.title} style={s.featCard}>
              <span style={s.featIcon} dangerouslySetInnerHTML={{ __html: f.icon }} />
              <div style={s.featTitle}>{f.title}</div>
              <div style={s.featBody}>{f.body}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer style={s.footer}>
          <span style={s.footerL}>© 2026 SafeMinutes by Passhai Technologies Private Limited</span>
          <span style={s.footerR}>
            <span>Privacy</span><span>Terms</span>
          </span>
        </footer>
      </div>

      {/* ── RIGHT — LOGIN / WORKSPACE ────────────────────────────────── */}
      <div style={s.right}>
        {isLoggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
            <div style={{ marginBottom: 32 }}>
              {/* Logo mark in panel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <CastleLogo size={28} color="#C4973A" />
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>Session active</span>
              </div>
              <h2 style={s.loginH}>
                {userName ? `Welcome back, ${userName.split(' ')[0]}.` : 'Welcome back.'}
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, margin: 0 }}>
                Your board workspaces, meetings, and records are ready.
              </p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              style={{ ...s.btnPrimary, marginBottom: 10 }}>
              Open my workspaces &rarr;
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%', padding: '10px', background: 'transparent', border: `1px solid ${s.divLine.background}`, borderRadius: 7, color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: "'Instrument Sans', system-ui, sans-serif", cursor: 'pointer', marginBottom: 36 }}>
              Go to dashboard
            </button>

            <div style={{ borderTop: `1px solid rgba(255,255,255,0.07)`, paddingTop: 22 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Board meetings and agendas' },
                  { label: 'Document Vault' },
                  { label: 'Director compliance register' },
                  { label: 'Resolution archive' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C4973A', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => { const { clearSession } = await import('@/lib/auth'); clearSession(); setIsLoggedIn(false); setUserName(''); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Sign out and switch account
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              <CastleLogo size={22} color="#C4973A" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>SafeMinutes</span>
            </div>

            <h2 style={s.loginH}>{isLogin ? 'Welcome back.' : 'Create account.'}</h2>
            <p style={s.loginSub}>
              {isLogin ? 'Sign in to your board workspace.' : 'Set up your first board workspace.'}
            </p>

            {!isLogin && (
              <div style={{ marginBottom: '20px', padding: '10px 14px', background: 'rgba(196,151,58,0.08)', border: '1px solid rgba(196,151,58,0.18)', borderRadius: '7px' }}>
                <p style={{ fontSize: '11px', color: 'rgba(196,151,58,0.75)', lineHeight: 1.65, margin: 0 }}>
                  SafeMinutes is currently in early access beta &mdash; free to use while we build with real users.
                </p>
              </div>
            )}
            <div style={s.tabRow}>
              <button style={isLogin ? s.tabBtnActive : s.tabBtn} onClick={() => { setIsLogin(true); setError(''); }}>Sign In</button>
              <button style={!isLogin ? s.tabBtnActive : s.tabBtn} onClick={() => { setIsLogin(false); setError(''); }}>Register</button>
            </div>

            <form onSubmit={handleAuth}>
              {!isLogin && (
                <>
                  <div style={s.formGroup}>
                    <label style={s.label}>Full Name</label>
                    <input style={s.input} type="text" placeholder="Rajesh Sharma" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>I am a <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400 }}>(select all that apply)</span></label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {PLATFORM_ROLE_OPTIONS.map(opt => {
                        const active = platformRoles.includes(opt.value);
                        return (
                          <button key={opt.value} type="button" onClick={() => toggleRole(opt.value)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, background: active ? 'rgba(139,26,26,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(139,26,26,0.45)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '9px 13px', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, background: active ? '#8B1A1A' : 'transparent', border: `2px solid ${active ? '#8B1A1A' : 'rgba(255,255,255,0.18)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {active && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : 'rgba(255,255,255,0.45)', margin: 0 }}>{opt.label}</p>
                              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', margin: 0 }}>{opt.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              <div style={s.formGroup}>
                <label style={s.label}>Email</label>
                <input style={s.input} type="email" placeholder="director@company.in" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Password</label>
                <input style={s.input} type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {error && <div style={s.errorBox}>{error}</div>}
              {!isLogin && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                    <div
                      onClick={() => setBetaAccepted(v => !v)}
                      style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, marginTop: 1, background: betaAccepted ? '#8B1A1A' : 'transparent', border: `2px solid ${betaAccepted ? '#8B1A1A' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {betaAccepted && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                      I have read and agree to the{' '}
                      <a href="/beta-terms" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(196,151,58,0.8)', textDecoration: 'underline' }}>
                        Early Access Beta Terms
                      </a>
                    </span>
                  </label>
                </div>
              )}
              <button type="submit" style={loading || (!isLogin && !betaAccepted) ? s.btnDisabled : s.btnPrimary} disabled={loading || (!isLogin && !betaAccepted)}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div style={s.divider}>
              <div style={s.divLine} />
              <span style={s.divText}>or</span>
              <div style={s.divLine} />
            </div>

            <button style={s.btnGoogle} onClick={handleGoogle}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div style={s.loginNote}>
              Your board data is stored securely in India. We do not share or sell your data.{' '}
              <a href="/beta-terms" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(196,151,58,0.6)', textDecoration: 'underline' }}>Beta terms</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
