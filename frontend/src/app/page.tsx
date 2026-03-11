'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  const slides = [
    { number:'01', tag:'Companies Act S.173', headline:'Four meetings. Every year. Non-negotiable.', body:'Every Indian private company must hold a minimum of 4 board meetings annually, with no gap exceeding 120 days between consecutive meetings. A single missed cycle can trigger penalties of Rs.25,000 per officer in default — and in severe cases, director disqualification under S.164.', stat:'Rs.25,000', statLabel:'per officer in default', icon:'⚖️' },
    { number:'02', tag:'Companies Act S.118 · ICSI SS-1', headline:'Minutes must be sealed within 30 days.', body:'ICSI Secretarial Standard SS-1 mandates that minutes of every board meeting be recorded, signed by the Chairperson, and entered in the minute book within 30 days. These are legal documents — courts have held that actions taken without a proper resolution are unenforceable against the company.', stat:'30 days', statLabel:'to seal meeting minutes', icon:'📋' },
    { number:'03', tag:'Companies Act S.117 · Form MGT-14', headline:'File resolutions with ROC in 30 days.', body:'Certain board and shareholder resolutions must be filed with the Registrar of Companies via Form MGT-14 within 30 days of passing. This includes director appointments, related-party transactions, and key delegations under S.179(3). Delays invite compounding penalties and regulatory scrutiny.', stat:'MGT-14', statLabel:'filed within 30 days', icon:'🏛️' },
    { number:'04', tag:'MCA21 V3 · DSC Mandate', headline:'Every filing requires a digital signature.', body:'MCA21 V3 mandates Class 2 or Class 3 Digital Signature Certificates for all corporate filings. Directors, Company Secretaries, and CAs must sign documents digitally — creating a tamper-proof, court-admissible audit trail that links every corporate action to an individual.', stat:'DSC', statLabel:'mandatory for all MCA filings', icon:'🔐' },
    { number:'05', tag:'Companies Act S.175 · Circular Resolutions', headline:'Pass resolutions without convening a meeting.', body:'Section 175 permits boards to pass circular resolutions — without a physical meeting — for routine matters. These require written consent from a majority of directors and must be noted at the next board meeting. Every vote, signature, and timestamp is a permanent legal record.', stat:'S.175', statLabel:'circular resolution power', icon:'✍️' },
    { number:'06', tag:'Audit Trail · Court-Ready Records', headline:'Every action, permanently recorded.', body:'BoardOS creates a cryptographically timestamped audit trail for every resolution, vote, signature, and document — meeting the evidentiary standards required by MCA, ICSI, and Indian courts. Directors, CAs, and CSs get role-specific access with full accountability at every step.', stat:'100%', statLabel:'digital, immutable, court-ready', icon:'🛡️' },
  ];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin ? { email, password } : { name, email, password };
      const res = await fetch(`${API}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Authentication failed');
      localStorage.setItem('token', data.token);
      router.push('/dashboard');
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

  const features = [
    { icon:'📅', title:'Meeting Management', desc:'Schedule, conduct, and close board meetings with agenda builder, quorum tracking, and automatic director notifications — from DRAFT to signed MINUTES in one flow.' },
    { icon:'🗳️', title:'Digital Voting', desc:"Directors cast FOR/AGAINST votes with timestamped records. Resolutions auto-approve on majority, with full audit log of each vote linked to the director's identity." },
    { icon:'📝', title:'Circular Resolutions', desc:'Pass board resolutions without a meeting under S.175. Each signature is timestamped and immutably recorded, noted automatically at the next board meeting.' },
    { icon:'📄', title:'Automated Minutes', desc:'Board minutes generated from meeting data — compliant with ICSI SS-1 format. One-click PDF, watermarked and ready for the statutory minute book.' },
    { icon:'🏢', title:'Multi-Workspace', desc:'Manage governance for multiple companies from a single account. Role-based access — ADMIN, DIRECTOR, PARTNER — scoped per workspace.' },
    { icon:'🔗', title:'MCA CIN Lookup', desc:"Import director details directly from the MCA database using the company's CIN. Pre-fill forms and maintain accuracy against the official registry." },
    { icon:'🗃️', title:'Resolution Archive', desc:'Every resolution, circular, and meeting automatically archived with full metadata. Search, retrieve, and export for statutory audits or legal proceedings.' },
    { icon:'👥', title:'Director Invitations', desc:'Invite directors via email with secure token-based onboarding. Existing and new users both handled — zero friction for multi-director boards.' },
    { icon:'🛡️', title:'Immutable Audit Trail', desc:'Every action — creation, vote, signature, status change — permanently logged with user identity, timestamp, and IP. Tamper-evident by design.' },
  ];

  const audience = [
    { emoji:'⚖️', role:'Company Secretary', desc:'Prepare notices, draft agendas, seal minutes, and maintain the statutory minute book — entirely digital, fully SS-1 compliant.' },
    { emoji:'🏛️', role:'Director', desc:'Attend meetings, cast votes, sign circular resolutions, and access board papers — anytime, from anywhere, with a complete record.' },
    { emoji:'📊', role:'Chartered Accountant', desc:'Review board-level financial resolutions, track compliance timelines, and access a clean audit trail for annual filings.' },
    { emoji:'🏢', role:'Promoter / Founder', desc:"Run your company's governance the right way from day one — without a legal team on retainer for every board action." },
  ];

  return (
    <div className="page-wrap">

      {/* ── LEFT PANEL ── */}
      <div className="left-panel">
        <header className="lp-header">
          <div className="lp-logo">
            <div className="lp-logo-mark">B</div>
            BoardOS
          </div>
          <span className="lp-header-tag">MCA · ICSI · Companies Act 2013</span>
        </header>

        <section className="lp-hero">
          <div className="lp-eyebrow">Board Governance for India</div>
          <h1 className="lp-headline">The <em>complete digital record</em> your board is legally required to keep.</h1>
          <p className="lp-sub">BoardOS is the compliance backbone for Indian private companies — turning board meetings, resolutions, and secretarial obligations into an immutable, court-ready digital trail. Built for directors, Company Secretaries, CAs, and promoters.</p>
          <div className="lp-pills">
            {['Companies Act 2013','ICSI SS-1','MCA21 V3','MGT-14','Sec 118 Minutes','Sec 173-175','DSC Compliant'].map(p => (
              <span key={p} className="lp-pill">{p}</span>
            ))}
          </div>
        </section>

        <div className="lp-warn">
          <span className="lp-warn-icon">⚠️</span>
          <p className="lp-warn-text"><strong>Non-compliance is not a technicality.</strong> Directors defaulting on board meeting records face fines up to Rs.25,000 each, automatic disqualification under S.164, and ROC strike-off proceedings. BoardOS makes compliance the default.</p>
        </div>

        <div className="lp-section">
          <div className="lp-tag">Regulatory Framework</div>
          <h2 className="lp-title">What Indian law demands from every board.</h2>
        </div>

        <div className="lp-tabs">
          {slides.map((s,i) => (
            <button key={i} className={`lp-tab${activeSlide===i?' active':''}`} onClick={() => setActiveSlide(i)}>
              {s.number} {s.tag.split(' ·')[0].replace('Companies Act ','Act ')}
            </button>
          ))}
        </div>

        <div className="lp-slides">
          {slides.map((s,i) => (
            <div key={i} className={`lp-slide${activeSlide===i?' active':''}`}>
              <div className="lp-slide-num">{s.number}</div>
              <div className="lp-slide-chip">{s.icon} {s.tag}</div>
              <h3 className="lp-slide-h">{s.headline}</h3>
              <p className="lp-slide-p">{s.body}</p>
              <div className="lp-stat">
                <span className="lp-stat-val">{s.stat}</span>
                <span className="lp-stat-lbl">{s.statLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="lp-section">
          <div className="lp-tag">Platform</div>
          <h2 className="lp-title">Everything your board needs. Nothing it doesn't.</h2>
        </div>
        <div className="lp-features">
          {features.map(f => (
            <div key={f.title} className="lp-feature">
              <span className="lp-feature-icon">{f.icon}</span>
              <div className="lp-feature-title">{f.title}</div>
              <div className="lp-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <section className="lp-audience">
          <div className="lp-tag">Who It's For</div>
          <h2 className="lp-title">Built for every seat at the board table.</h2>
          <div className="lp-audience-grid">
            {audience.map(a => (
              <div key={a.role} className="lp-aud-card">
                <span className="lp-aud-emoji">{a.emoji}</span>
                <div className="lp-aud-role">{a.role}</div>
                <div className="lp-aud-desc">{a.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="lp-footer">
          <div className="lp-footer-l">© 2026 BoardOS · MCA21 · Companies Act 2013 · ICSI Secretarial Standards</div>
          <div className="lp-footer-r"><span>Privacy</span><span>Terms</span><span>Security</span></div>
        </footer>
      </div>

      {/* ── RIGHT PANEL – LOGIN ── */}
      <div className="right-panel">
        <h2 className="lp-login-h">{isLogin ? 'Welcome back.' : 'Join BoardOS.'}</h2>
        <p className="lp-login-sub">{isLogin ? 'Sign in to access your board workspace and compliance dashboard.' : 'Create your account and set up your first board workspace in minutes.'}</p>

        <div className="lp-tab-row">
          <button className={`lp-tab-btn${isLogin?' active':''}`} onClick={() => { setIsLogin(true); setError(''); }}>Sign In</button>
          <button className={`lp-tab-btn${!isLogin?' active':''}`} onClick={() => { setIsLogin(false); setError(''); }}>Register</button>
        </div>

        <form onSubmit={handleAuth}>
          {!isLogin && (
            <div className="lp-form-group">
              <label className="lp-label">Full Name</label>
              <input type="text" className="lp-input" placeholder="Rajesh Sharma" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div className="lp-form-group">
            <label className="lp-label">Email Address</label>
            <input type="email" className="lp-input" placeholder="director@company.in" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="lp-form-group">
            <label className="lp-label">Password</label>
            <input type="password" className="lp-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div className="lp-error">{error}</div>}
          <button type="submit" className="lp-btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : isLogin ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        <div className="lp-divider"><span>or continue with</span></div>

        <button className="lp-btn-google" onClick={handleGoogle}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="lp-note"><strong>Secure & Compliant.</strong> BoardOS uses encrypted storage and DSC-linked identity verification. Your board data is protected under Indian data governance standards.</div>
      </div>
    </div>
  );
}
