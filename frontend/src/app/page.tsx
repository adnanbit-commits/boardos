'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';

const PLATFORM_ROLE_OPTIONS = [
  { value: 'DIRECTOR',         label: 'Director',               desc: 'Board member / promoter' },
  { value: 'CS',               label: 'Company Secretary',       desc: 'Compliance officer / KMP' },
  { value: 'CA',               label: 'Chartered Accountant',    desc: 'Auditor / financial advisor' },
  { value: 'COST_ACCOUNTANT',  label: 'Cost Accountant',         desc: 'Cost & management accountant' },
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

  useEffect(() => {
    const token = getToken();
    const user  = getUser();
    if (token) {
      setIsLoggedIn(true);
      setUserName(user?.name ?? '');
    }
  }, []);

  function toggleRole(value: string) {
    setPlatformRoles(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    );
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin
        ? { email, password }
        : { name, email, password, ...(platformRoles.length ? { platformRoles } : {}) };
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Authentication failed');
      // Use saveSession so the correct keys are written
      const { saveSession } = await import('@/lib/auth');
      saveSession(data.token, data.user);
      setUserName(data.user?.name ?? '');
      setIsLoggedIn(true); // show workspace panel — don't redirect
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

  const compliance = [
    {
      ref: 'Sec. 173',
      title: 'Minimum 4 Board Meetings Per Year',
      body: 'Every Indian private company must hold at least 4 board meetings annually with no gap exceeding 120 days between consecutive meetings. Default attracts a penalty of Rs. 25,000 per officer and can lead to director disqualification under Sec. 164.',
    },
    {
      ref: 'Sec. 118 + ICSI SS-1',
      title: 'Minutes Must Be Sealed Within 30 Days',
      body: 'Minutes of every board meeting must be recorded, signed by the Chairperson, and entered into the statutory minute book within 30 days. These are legal documents — actions taken without a properly recorded resolution can be held unenforceable.',
    },
    {
      ref: 'Sec. 117 + Form MGT-14',
      title: 'Resolutions Filed With ROC in 30 Days',
      body: 'Certain board and shareholder resolutions must be filed with the Registrar of Companies via Form MGT-14 within 30 days of passing — including director appointments, RPTs, and delegations under Sec. 179(3). Late filings attract compounding penalties.',
    },
    {
      ref: 'MCA21 V3',
      title: 'Every Filing Requires a Digital Signature',
      body: 'MCA21 mandates Class 2 or Class 3 DSC for all corporate filings. Directors, Company Secretaries, and CAs must sign digitally — creating a tamper-proof, court-admissible trail linking every corporate action to a named individual.',
    },
    {
      ref: 'Sec. 175',
      title: 'Circular Resolutions — Without Convening a Meeting',
      body: 'Routine board matters can be resolved by circular resolution under Sec. 175, without holding a physical meeting. Majority written consent is required, and the resolution must be noted at the next board meeting. Every signature and timestamp is a permanent record.',
    },
  ];

  const features = [
    { title: 'Meeting Management', body: 'Create meetings, build agendas, track quorum, notify directors, and generate compliant minutes — from draft to signed record in one place.' },
    { title: 'Digital Voting', body: 'Directors vote FOR or AGAINST on each resolution. Votes are timestamped and linked to identity. Resolutions auto-approve on majority.' },
    { title: 'Circular Resolutions', body: 'Pass resolutions without a meeting under Sec. 175. Signatures are recorded and noted at the next board meeting automatically.' },
    { title: 'Automated Minutes', body: 'Minutes generated from meeting data in ICSI SS-1 format. One-click PDF download, ready for the statutory minute book.' },
    { title: 'Multi-Company Workspace', body: 'Manage multiple companies from one account. Role-based access — Admin, Director, Partner — scoped per entity.' },
    { title: 'MCA CIN Lookup', body: 'Import director details from the MCA registry using your company CIN. Accurate data, pre-filled, no manual entry.' },
    { title: 'Resolution Archive', body: 'Every resolution, circular, and meeting archived with full metadata. Exportable for statutory audits and legal proceedings.' },
    { title: 'Director Invitations', body: 'Invite directors by email. Token-based onboarding handles both new and existing users.' },
    { title: 'Audit Trail', body: 'Every action — creation, vote, signature, status change — logged with user identity, timestamp, and IP. Immutable by design.' },
  ];

  const s: Record<string, React.CSSProperties> = {
    page:       { display: 'flex', minHeight: '100vh', fontFamily: 'Georgia, serif', background: '#0C0F1A', color: '#D8D4CC' },
    left:       { flex: 1, overflowY: 'auto', borderRight: '1px solid #1E2535' },
    right:      { width: '380px', flexShrink: 0, background: '#0F1320', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', padding: '48px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },

    // header
    header:     { padding: '28px 56px', borderBottom: '1px solid #1E2535', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    logoWrap:   { display: 'flex', alignItems: 'center', gap: '12px' },
    logoMark:   { width: '32px', height: '32px', background: '#8B7355', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#0C0F1A', fontFamily: 'Georgia, serif' },
    logoText:   { fontSize: '18px', fontWeight: 600, color: '#D8D4CC', letterSpacing: '0.04em' },
    headerBadge:{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#6B7A94', border: '1px solid #1E2535', borderRadius: '4px', padding: '4px 10px' },

    // hero
    hero:       { padding: '64px 56px 48px' },
    eyebrow:    { fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#8B7355', marginBottom: '20px' },
    h1:         { fontSize: 'clamp(32px, 3.5vw, 52px)', fontWeight: 400, lineHeight: 1.15, color: '#E8E4DC', maxWidth: '620px', marginBottom: '20px', fontStyle: 'italic' },
    h1span:     { fontStyle: 'normal', fontWeight: 600 },
    heroSub:    { fontSize: '15px', fontWeight: 400, lineHeight: 1.7, color: '#8B95A8', maxWidth: '540px', marginBottom: '36px', fontFamily: "'DM Sans', sans-serif" },
    pills:      { display: 'flex', flexWrap: 'wrap' as const, gap: '8px' },
    pill:       { fontSize: '11px', color: '#6B7A94', border: '1px solid #1E2535', borderRadius: '3px', padding: '4px 12px', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.04em' },

    // alert
    alert:      { margin: '0 56px 64px', padding: '20px 24px', background: 'rgba(139,115,85,0.08)', border: '1px solid rgba(139,115,85,0.2)', borderLeft: '3px solid #8B7355', borderRadius: '4px' },
    alertText:  { fontSize: '13px', color: '#B0A898', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" },

    // section
    section:    { padding: '0 56px', marginBottom: '40px' },
    secLabel:   { fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#8B7355', marginBottom: '10px', fontFamily: "'DM Sans', sans-serif" },
    secTitle:   { fontSize: '28px', fontWeight: 400, color: '#D8D4CC', lineHeight: 1.2 },

    // compliance table
    compWrap:   { padding: '0 56px', marginBottom: '80px' },
    compRow:    { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0', borderTop: '1px solid #1A2030' },
    compRef:    { padding: '24px 16px 24px 0', fontSize: '11px', color: '#8B7355', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.06em', lineHeight: 1.5 },
    compBody:   { padding: '24px 0', borderLeft: '1px solid #1A2030', paddingLeft: '24px' },
    compTitle:  { fontSize: '15px', fontWeight: 600, color: '#D8D4CC', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" },
    compText:   { fontSize: '13px', color: '#7A8499', lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif" },
    compLast:   { borderBottom: '1px solid #1A2030' },

    // features
    featWrap:   { padding: '0 56px', marginBottom: '80px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#1A2030', border: '1px solid #1A2030', borderRadius: '8px', overflow: 'hidden' },
    featCard:   { background: '#0C0F1A', padding: '28px 24px' },
    featTitle:  { fontSize: '14px', fontWeight: 600, color: '#C8C4BC', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" },
    featBody:   { fontSize: '12px', color: '#5A6478', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" },

    // footer
    footer:     { padding: '28px 56px', borderTop: '1px solid #1A2030', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    footerL:    { fontSize: '11px', color: '#3A4455', fontFamily: "'DM Sans', sans-serif" },
    footerR:    { fontSize: '11px', color: '#3A4455', fontFamily: "'DM Sans', sans-serif", display: 'flex', gap: '20px' },

    // login
    loginH:     { fontSize: '24px', fontWeight: 400, color: '#D8D4CC', marginBottom: '6px', fontStyle: 'italic' },
    loginSub:   { fontSize: '13px', color: '#5A6478', marginBottom: '32px', lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" },
    tabRow:     { display: 'flex', background: '#161B28', borderRadius: '6px', padding: '3px', marginBottom: '24px' },
    tabBtn:     { flex: 1, padding: '8px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent', color: '#5A6478', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
    tabBtnActive:{ flex: 1, padding: '8px', fontSize: '13px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: '#1E2535', color: '#D8D4CC', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
    formGroup:  { marginBottom: '14px' },
    label:      { display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#5A6478', marginBottom: '7px', fontFamily: "'DM Sans', sans-serif" },
    input:      { width: '100%', padding: '11px 14px', background: '#161B28', border: '1px solid #1E2535', borderRadius: '6px', color: '#D8D4CC', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", outline: 'none' },
    errorBox:   { fontSize: '12px', color: '#E05252', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px', fontFamily: "'DM Sans', sans-serif" },
    btnPrimary: { width: '100%', padding: '12px', background: '#8B7355', color: '#0C0F1A', fontSize: '14px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '12px' },
    btnDisabled:{ width: '100%', padding: '12px', background: '#8B7355', color: '#0C0F1A', fontSize: '14px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", border: 'none', borderRadius: '6px', cursor: 'not-allowed', opacity: 0.6, marginBottom: '12px' },
    divider:    { display: 'flex', alignItems: 'center', gap: '12px', margin: '14px 0' },
    divLine:    { flex: 1, height: '1px', background: '#1E2535' },
    divText:    { fontSize: '11px', color: '#3A4455', fontFamily: "'DM Sans', sans-serif" },
    btnGoogle:  { width: '100%', padding: '11px', background: 'transparent', border: '1px solid #1E2535', borderRadius: '6px', color: '#6B7A94', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
    loginNote:  { marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #1A2030', fontSize: '11px', color: '#3A4455', lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" },
  };

  return (
    <div style={s.page}>
      {/* ── LEFT ── */}
      <div style={s.left}>
        <header style={s.header}>
          <div style={s.logoWrap}>
            <div style={s.logoMark}>S</div>
            <span style={s.logoText}>SafeMinutes</span>
          </div>
          <span style={s.headerBadge}>MCA · ICSI · Companies Act 2013</span>
        </header>

        <section style={s.hero}>
          <div style={s.eyebrow}>Board Governance · Indian Private Companies</div>
          <h1 style={s.h1}>
            The <span style={s.h1span}>complete digital record</span> your board is legally required to maintain.
          </h1>
          <p style={s.heroSub}>
            SafeMinutes handles the full governance cycle for Indian private companies — meetings, resolutions, minutes, and audit trails — in a single compliant platform. Built for directors, Company Secretaries, CAs, and promoters.
          </p>
          <div style={s.pills}>
            {['Companies Act 2013', 'ICSI SS-1', 'MCA21 V3', 'MGT-14', 'Sec. 118 Minutes', 'Sec. 173-175', 'DSC Compliant'].map(p => (
              <span key={p} style={s.pill}>{p}</span>
            ))}
          </div>
        </section>

        <div style={s.alert}>
          <p style={s.alertText}>
            <strong style={{ color: '#C8B898' }}>Non-compliance is not a technicality.</strong> Directors of defaulting companies face penalties of Rs. 25,000 per officer, automatic disqualification under Sec. 164, and ROC strike-off proceedings. SafeMinutes makes compliance the default outcome — not an afterthought.
          </p>
        </div>

        {/* Compliance Requirements */}
        <div style={s.section}>
          <div style={s.secLabel}>Regulatory Framework</div>
          <h2 style={s.secTitle}>What Indian law requires of every board.</h2>
        </div>

        <div style={s.compWrap}>
          {compliance.map((c, i) => (
            <div key={c.ref} style={{ ...s.compRow, ...(i === compliance.length - 1 ? s.compLast : {}) }}>
              <div style={s.compRef}>{c.ref}</div>
              <div style={s.compBody}>
                <div style={s.compTitle}>{c.title}</div>
                <div style={s.compText}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={s.section}>
          <div style={s.secLabel}>Platform</div>
          <h2 style={s.secTitle}>Everything your board needs.</h2>
        </div>

        <div style={s.featWrap}>
          {features.map(f => (
            <div key={f.title} style={s.featCard}>
              <div style={s.featTitle}>{f.title}</div>
              <div style={s.featBody}>{f.body}</div>
            </div>
          ))}
        </div>

        <footer style={s.footer}>
          <span style={s.footerL}>© 2026 SafeMinutes — Companies Act 2013 · MCA21 · ICSI Secretarial Standards</span>
          <span style={s.footerR}>
            <span>Privacy</span><span>Terms</span>
          </span>
        </footer>
      </div>

      {/* ── RIGHT — LOGIN / WORKSPACE ── */}
      <div style={s.right}>
        {isLoggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(79,127,255,0.10)', border: '1px solid rgba(79,127,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#4F7FFF' }}>◈</div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399' }} />
                <span style={{ fontSize: 12, color: '#34D399', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Session active</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 400, color: '#D8D4CC', margin: '0 0 8px', fontStyle: 'italic' }}>
                {userName ? `Welcome back, ${userName.split(' ')[0]}.` : 'Welcome back.'}
              </h2>
              <p style={{ fontSize: 13, color: '#5A6478', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                Your board workspaces, meetings, and compliance records are waiting.
              </p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%', padding: '13px', background: '#4F7FFF', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 10, letterSpacing: '0.01em' }}>
              Open my workspaces →
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #1E2535', borderRadius: 7, color: '#6B7A94', fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', marginBottom: 36 }}>
              Go to dashboard
            </button>

            <div style={{ borderTop: '1px solid #1A2030', paddingTop: 22 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 20 }}>
                {[
                  { icon: '◈', label: 'Board meetings & agendas' },
                  { icon: '⊟', label: 'Document vault' },
                  { icon: '▦', label: 'Director compliance register' },
                  { icon: '▤', label: 'Resolution archive' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: '#4F7FFF', width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, color: '#3A4455', fontFamily: "'DM Sans', sans-serif" }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => { const { clearSession } = await import('@/lib/auth'); clearSession(); setIsLoggedIn(false); setUserName(''); }}
                style={{ background: 'none', border: 'none', color: '#3A4455', fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif", textDecoration: 'underline' }}>
                Sign out and switch account
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 style={s.loginH}>{isLogin ? 'Welcome back.' : 'Create account.'}</h2>
            <p style={s.loginSub}>
              {isLogin ? 'Sign in to your board workspace.' : 'Set up your first board workspace in minutes.'}
            </p>

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
                    <label style={s.label}>I am a <span style={{ color: '#6B7280', fontWeight: 400 }}>(select all that apply)</span></label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {PLATFORM_ROLE_OPTIONS.map(opt => {
                        const active = platformRoles.includes(opt.value);
                        return (
                          <button key={opt.value} type="button" onClick={() => toggleRole(opt.value)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, background: active ? 'rgba(79,127,255,0.10)' : '#13161B', border: `1px solid ${active ? '#4F7FFF' : '#232830'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: active ? '#4F7FFF' : 'transparent', border: `2px solid ${active ? '#4F7FFF' : '#374151'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {active && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: active ? '#F0F2F5' : '#9CA3AF', margin: 0 }}>{opt.label}</p>
                              <p style={{ fontSize: 11, color: '#4B5563', margin: 0 }}>{opt.desc}</p>
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
                <input style={s.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {error && <div style={s.errorBox}>{error}</div>}
              <button type="submit" style={loading ? s.btnDisabled : s.btnPrimary} disabled={loading}>
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
              SafeMinutes uses encrypted storage and identity-linked access. Your board data is private and protected.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
