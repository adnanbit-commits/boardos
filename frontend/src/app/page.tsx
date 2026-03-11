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
    {
      number: '01',
      tag: 'Companies Act §173',
      headline: 'Four meetings. Every year. Non-negotiable.',
      body: 'Every Indian private company must hold a minimum of 4 board meetings annually, with no gap exceeding 120 days between consecutive meetings. A single missed cycle can trigger penalties of ₹25,000 per officer in default — and in severe cases, director disqualification under §164.',
      stat: '₹25,000',
      statLabel: 'per officer in default',
      icon: '⚖️',
    },
    {
      number: '02',
      tag: 'Companies Act §118 · ICSI SS-1',
      headline: 'Minutes must be sealed within 30 days.',
      body: 'ICSI Secretarial Standard SS-1 mandates that minutes of every board meeting be recorded, signed by the Chairperson, and entered in the minute book within 30 days. These are legal documents — courts have held that actions taken without a proper resolution are unenforceable against the company.',
      stat: '30 days',
      statLabel: 'to seal meeting minutes',
      icon: '📋',
    },
    {
      number: '03',
      tag: 'Companies Act §117 · Form MGT-14',
      headline: 'File resolutions with ROC in 30 days.',
      body: 'Certain board and shareholder resolutions must be filed with the Registrar of Companies via Form MGT-14 within 30 days of passing. This includes director appointments, related-party transactions, and key delegations under §179(3). Delays invite compounding penalties and regulatory scrutiny.',
      stat: 'MGT-14',
      statLabel: 'filed within 30 days',
      icon: '🏛️',
    },
    {
      number: '04',
      tag: 'MCA21 V3 · DSC Mandate',
      headline: 'Every filing requires a digital signature.',
      body: 'MCA21 V3 mandates Class 2 or Class 3 Digital Signature Certificates for all corporate filings. Directors, Company Secretaries, and CAs must sign documents digitally — creating a tamper-proof, court-admissible audit trail that links every corporate action to an individual.',
      stat: 'DSC',
      statLabel: 'mandatory for all MCA filings',
      icon: '🔐',
    },
    {
      number: '05',
      tag: 'Companies Act §175 · Circular Resolutions',
      headline: 'Pass resolutions without convening a meeting.',
      body: 'Section 175 permits boards to pass circular resolutions — without a physical meeting — for routine matters. These require written consent from a majority of directors and must be noted at the next board meeting. Every vote, signature, and timestamp is a permanent legal record.',
      stat: '§175',
      statLabel: 'circular resolution power',
      icon: '✍️',
    },
    {
      number: '06',
      tag: 'Audit Trail · Court-Ready Records',
      headline: 'Every action, permanently recorded.',
      body: 'BoardOS creates a cryptographically timestamped audit trail for every resolution, vote, signature, and document — meeting the evidentiary standards required by MCA, ICSI, and Indian courts. Directors, CAs, and CSs get role-specific access with full accountability at every step.',
      stat: '100%',
      statLabel: 'digital, immutable, court-ready',
      icon: '🛡️',
    },
  ];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin ? { email, password } : { name, email, password };
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #080C18; --navy-2: #0F1525; --navy-3: #161D30; --navy-4: #1E2740;
          --gold: #C9A84C; --gold-light: #E2C97A; --gold-dim: rgba(201,168,76,0.12);
          --gold-border: rgba(201,168,76,0.25); --text: #E8E4D9; --text-muted: #8B95A8;
          --text-dim: #3A4558; --red: #E05252;
        }
        html { scroll-behavior: smooth; }
        body { font-family: 'DM Sans', sans-serif; background: var(--navy); color: var(--text); overflow-x: hidden; }
        .page-wrap { display: flex; min-height: 100vh; }
        .left-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
        .right-panel {
          width: 420px; flex-shrink: 0; background: var(--navy-2);
          border-left: 1px solid var(--gold-border); position: sticky; top: 0;
          height: 100vh; display: flex; flex-direction: column; justify-content: center;
          padding: 48px 40px; overflow-y: auto;
        }
        .header { padding: 28px 64px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(201,168,76,0.1); }
        .logo { display: flex; align-items: center; gap: 12px; font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
        .logo-mark { width: 36px; height: 36px; background: var(--gold); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: var(--navy); font-family: 'Cormorant Garamond', serif; }
        .header-tag { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 100px; padding: 5px 14px; }
        .hero { padding: 72px 64px 56px; position: relative; }
        .hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(ellipse 60% 40% at 30% 30%, rgba(201,168,76,0.05) 0%, transparent 70%); pointer-events: none; }
        .hero-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        .hero-eyebrow::before { content: ''; width: 28px; height: 1px; background: var(--gold); opacity: 0.6; }
        .hero-headline { font-family: 'Cormorant Garamond', serif; font-size: clamp(38px, 4.5vw, 60px); font-weight: 500; line-height: 1.1; color: var(--text); max-width: 660px; margin-bottom: 22px; letter-spacing: -0.01em; }
        .hero-headline em { font-style: italic; color: var(--gold); }
        .hero-sub { font-size: 15px; font-weight: 300; line-height: 1.75; color: var(--text-muted); max-width: 560px; margin-bottom: 40px; }
        .hero-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 0; }
        .pill { font-size: 11px; font-weight: 500; letter-spacing: 0.06em; color: var(--text-muted); border: 1px solid rgba(139,149,168,0.18); border-radius: 100px; padding: 5px 14px; transition: all 0.2s; cursor: default; }
        .pill:hover { border-color: var(--gold-border); color: var(--gold-light); }
        .compliance-strip { margin: 48px 64px 72px; padding: 22px 28px; background: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 12px; display: flex; align-items: flex-start; gap: 14px; }
        .compliance-strip-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
        .compliance-strip-text { font-size: 13px; color: var(--gold-light); line-height: 1.65; }
        .compliance-strip-text strong { font-weight: 600; }
        .section-wrap { padding: 0 64px; margin-bottom: 56px; }
        .section-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; }
        .section-title { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 500; color: var(--text); line-height: 1.2; }
        .slides-nav { padding: 0 64px; display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; }
        .slide-tab { font-size: 12px; font-weight: 500; padding: 7px 16px; border-radius: 6px; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; color: var(--text-muted); background: transparent; font-family: 'DM Sans', sans-serif; }
        .slide-tab.active { background: var(--gold-dim); border-color: var(--gold-border); color: var(--gold-light); }
        .slide-tab:hover:not(.active) { color: var(--text); background: var(--navy-3); }
        .slides-container { padding: 0 64px; margin-bottom: 88px; }
        .slide-card { background: var(--navy-3); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 44px; display: none; position: relative; overflow: hidden; }
        .slide-card.active { display: block; animation: fadeUp 0.3s ease; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .slide-card::before { content: ''; position: absolute; top: 0; right: 0; width: 280px; height: 280px; background: radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%); pointer-events: none; }
        .slide-number { font-family: 'Cormorant Garamond', serif; font-size: 80px; font-weight: 300; color: rgba(201,168,76,0.08); line-height: 1; position: absolute; top: 24px; right: 40px; }
        .slide-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-border); border-radius: 100px; padding: 4px 12px; margin-bottom: 18px; }
        .slide-headline { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 500; color: var(--text); line-height: 1.2; margin-bottom: 18px; max-width: 580px; }
        .slide-body { font-size: 14px; font-weight: 300; line-height: 1.8; color: var(--text-muted); max-width: 600px; margin-bottom: 32px; }
        .slide-stat { display: flex; align-items: baseline; gap: 12px; }
        .stat-value { font-family: 'Cormorant Garamond', serif; font-size: 40px; font-weight: 600; color: var(--gold); line-height: 1; }
        .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 300; }
        .features-grid { padding: 0 64px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 88px; }
        .feature-card { background: var(--navy-3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; transition: all 0.25s; }
        .feature-card:hover { border-color: var(--gold-border); transform: translateY(-2px); }
        .feature-icon { font-size: 20px; margin-bottom: 14px; display: block; }
        .feature-title { font-family: 'Cormorant Garamond', serif; font-size: 17px; font-weight: 500; color: var(--text); margin-bottom: 8px; }
        .feature-desc { font-size: 12px; font-weight: 300; line-height: 1.65; color: var(--text-muted); }
        .audience-section { padding: 0 64px; margin-bottom: 88px; }
        .audience-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 40px; }
        .audience-card { border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 22px; text-align: center; transition: all 0.25s; position: relative; overflow: hidden; }
        .audience-card::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--gold); transform: scaleX(0); transition: transform 0.3s; }
        .audience-card:hover::after { transform: scaleX(1); }
        .audience-card:hover { border-color: var(--gold-border); }
        .audience-emoji { font-size: 26px; display: block; margin-bottom: 10px; }
        .audience-role { font-family: 'Cormorant Garamond', serif; font-size: 17px; font-weight: 500; color: var(--text); margin-bottom: 7px; }
        .audience-desc { font-size: 11px; font-weight: 300; color: var(--text-muted); line-height: 1.6; }
        .footer { padding: 32px 64px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; }
        .footer-left { font-size: 12px; color: var(--text-dim); }
        .footer-right { font-size: 11px; color: var(--text-dim); display: flex; gap: 20px; }
        /* Login */
        .login-headline { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 500; color: var(--text); line-height: 1.3; margin-bottom: 6px; }
        .login-sub { font-size: 13px; color: var(--text-muted); font-weight: 300; margin-bottom: 32px; line-height: 1.6; }
        .tab-row { display: flex; background: var(--navy-3); border-radius: 8px; padding: 4px; margin-bottom: 26px; }
        .tab-btn { flex: 1; padding: 9px; font-size: 13px; font-weight: 500; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--text-muted); font-family: 'DM Sans', sans-serif; }
        .tab-btn.active { background: var(--navy-4); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .form-group { margin-bottom: 14px; }
        .form-label { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 7px; }
        .form-input { width: 100%; padding: 11px 15px; background: var(--navy-3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text); font-size: 14px; font-family: 'DM Sans', sans-serif; transition: border-color 0.2s; outline: none; }
        .form-input:focus { border-color: var(--gold-border); background: var(--navy-4); }
        .form-input::placeholder { color: var(--text-dim); }
        .error-msg { font-size: 12px; color: var(--red); background: rgba(224,82,82,0.1); border: 1px solid rgba(224,82,82,0.2); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; }
        .btn-primary { width: 100%; padding: 13px; background: var(--gold); color: var(--navy); font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; }
        .btn-primary:hover:not(:disabled) { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(201,168,76,0.3); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .divider { display: flex; align-items: center; gap: 12px; margin: 14px 0; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
        .divider span { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
        .btn-google { width: 100%; padding: 11px; background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text-muted); font-size: 13px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px; }
        .btn-google:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }
        .login-note { margin-top: 24px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: var(--text-dim); line-height: 1.6; }
        .login-note strong { color: var(--text-muted); }
        @media (max-width: 1100px) {
          .right-panel { width: 360px; padding: 36px 28px; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
          .audience-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 800px) {
          .page-wrap { flex-direction: column; }
          .right-panel { width: 100%; height: auto; position: static; border-left: none; border-top: 1px solid var(--gold-border); }
          .header, .hero, .section-wrap, .slides-nav, .slides-container, .features-grid, .audience-section, .footer { padding-left: 24px !important; padding-right: 24px !important; }
          .compliance-strip { margin-left: 24px; margin-right: 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .audience-grid { grid-template-columns: repeat(2, 1fr); }
          .hero { padding-top: 48px !important; padding-bottom: 40px !important; }
        }
      `}</style>

      <div className="page-wrap">
        {/* ── LEFT PANEL ── */}
        <div className="left-panel">
          <header className="header">
            <div className="logo">
              <div className="logo-mark">B</div>
              BoardOS
            </div>
            <span className="header-tag">MCA · ICSI · Companies Act 2013</span>
          </header>

          <section className="hero">
            <div className="hero-eyebrow">Board Governance for India</div>
            <h1 className="hero-headline">
              The <em>complete digital record</em> your board is legally required to keep.
            </h1>
            <p className="hero-sub">
              BoardOS is the compliance backbone for Indian private companies — turning board meetings, resolutions, and secretarial obligations into an immutable, court-ready digital trail. Built for directors, Company Secretaries, CAs, and promoters.
            </p>
            <div className="hero-pills">
              {['Companies Act 2013', 'ICSI SS-1', 'MCA21 V3', 'MGT-14', 'Form AOC-4', '§118 Minutes', '§173–175', 'DSC Compliant'].map(p => (
                <span key={p} className="pill">{p}</span>
              ))}
            </div>
          </section>

          <div className="compliance-strip">
            <span className="compliance-strip-icon">⚠️</span>
            <p className="compliance-strip-text">
              <strong>Non-compliance is not a technicality.</strong> Directors of companies defaulting on board meeting records face fines up to ₹25,000 each, automatic disqualification under §164, and ROC strike-off proceedings. BoardOS makes compliance the default — not an afterthought.
            </p>
          </div>

          {/* Compliance Slides */}
          <div className="section-wrap">
            <div className="section-tag">Regulatory Framework</div>
            <h2 className="section-title">What Indian law demands from every board.</h2>
          </div>

          <div className="slides-nav">
            {slides.map((s, i) => (
              <button key={i} className={`slide-tab${activeSlide === i ? ' active' : ''}`} onClick={() => setActiveSlide(i)}>
                {s.number} {s.tag.split(' ·')[0].replace('Companies Act ', 'Act ')}
              </button>
            ))}
          </div>

          <div className="slides-container">
            {slides.map((s, i) => (
              <div key={i} className={`slide-card${activeSlide === i ? ' active' : ''}`}>
                <div className="slide-number">{s.number}</div>
                <div className="slide-chip">{s.icon} {s.tag}</div>
                <h3 className="slide-headline">{s.headline}</h3>
                <p className="slide-body">{s.body}</p>
                <div className="slide-stat">
                  <span className="stat-value">{s.stat}</span>
                  <span className="stat-label">{s.statLabel}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="section-wrap">
            <div className="section-tag">Platform</div>
            <h2 className="section-title">Everything your board needs. Nothing it doesn't.</h2>
          </div>

          <div className="features-grid">
            {[
              { icon: '📅', title: 'Meeting Management', desc: 'Schedule, conduct, and close board meetings with agenda builder, quorum tracking, and automatic director notifications — from DRAFT to signed MINUTES in one flow.' },
              { icon: '🗳️', title: 'Digital Voting', desc: 'Directors cast FOR/AGAINST votes with timestamped records. Resolutions auto-approve on majority, with full audit log of each vote linked to the director\'s identity.' },
              { icon: '📝', title: 'Circular Resolutions', desc: 'Pass board resolutions without a meeting under §175. Each signature is timestamped and immutably recorded, noted automatically at the next board meeting.' },
              { icon: '📄', title: 'Automated Minutes', desc: 'Board minutes generated from meeting data — compliant with ICSI SS-1 format. One-click PDF, watermarked and ready for the statutory minute book.' },
              { icon: '🏢', title: 'Multi-Workspace', desc: 'Manage governance for multiple companies from a single account. Role-based access — ADMIN, DIRECTOR, PARTNER — scoped per workspace.' },
              { icon: '🔗', title: 'MCA CIN Lookup', desc: 'Import director details directly from the MCA database using the company\'s CIN. Pre-fill forms and maintain accuracy against the official registry.' },
              { icon: '🗃️', title: 'Resolution Archive', desc: 'Every resolution, circular, and meeting automatically archived with full metadata. Search, retrieve, and export for statutory audits or legal proceedings.' },
              { icon: '👥', title: 'Director Invitations', desc: 'Invite directors via email with secure token-based onboarding. Existing and new users both handled — zero friction for multi-director boards.' },
              { icon: '🛡️', title: 'Immutable Audit Trail', desc: 'Every action — creation, vote, signature, status change — permanently logged with user identity, timestamp, and IP. Tamper-evident by design.' },
            ].map((f) => (
              <div key={f.title} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Audience */}
          <section className="audience-section">
            <div className="section-tag">Who It's For</div>
            <h2 className="section-title">Built for every seat at the board table.</h2>
            <div className="audience-grid">
              {[
                { emoji: '⚖️', role: 'Company Secretary', desc: 'Prepare notices, draft agendas, seal minutes, and maintain the statutory minute book — entirely digital, fully SS-1 compliant.' },
                { emoji: '🏛️', role: 'Director', desc: 'Attend meetings, cast votes, sign circular resolutions, and access board papers — anytime, from anywhere, with a complete record.' },
                { emoji: '📊', role: 'Chartered Accountant', desc: 'Review board-level financial resolutions, track compliance timelines, and access a clean audit trail for annual filings.' },
                { emoji: '🏢', role: 'Promoter / Founder', desc: 'Run your company\'s governance the right way from day one — without a legal team on retainer for every board action.' },
              ].map((a) => (
                <div key={a.role} className="audience-card">
                  <span className="audience-emoji">{a.emoji}</span>
                  <div className="audience-role">{a.role}</div>
                  <div className="audience-desc">{a.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <footer className="footer">
            <div className="footer-left">© 2026 BoardOS · Compliant with MCA21 · Companies Act 2013 · ICSI Secretarial Standards</div>
            <div className="footer-right">
              <span>Privacy</span><span>Terms</span><span>Security</span>
            </div>
          </footer>
        </div>

        {/* ── RIGHT PANEL – LOGIN ── */}
        <div className="right-panel">
          <h2 className="login-headline">{isLogin ? 'Welcome back.' : 'Join BoardOS.'}</h2>
          <p className="login-sub">
            {isLogin
              ? 'Sign in to access your board workspace and compliance dashboard.'
              : 'Create your account and set up your first board workspace in minutes.'}
          </p>

          <div className="tab-row">
            <button className={`tab-btn${isLogin ? ' active' : ''}`} onClick={() => { setIsLogin(true); setError(''); }}>Sign In</button>
            <button className={`tab-btn${!isLogin ? ' active' : ''}`} onClick={() => { setIsLogin(false); setError(''); }}>Register</button>
          </div>

          <form onSubmit={handleAuth}>
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" placeholder="Rajesh Sharma" value={name} onChange={e => setName(e.target.value)} required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input type="email" className="form-input" placeholder="director@company.in" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Please wait…' : isLogin ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div className="divider"><span>or continue with</span></div>

          <button className="btn-google" onClick={handleGoogle}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="login-note">
            <strong>Secure & Compliant.</strong> BoardOS uses encrypted storage and DSC-linked identity verification. Your board data is protected under Indian data governance standards.
          </div>
        </div>
      </div>
    </>
  );
}
