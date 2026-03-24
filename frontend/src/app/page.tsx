'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';

// ── Castle logo ───────────────────────────────────────────────────────────────
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
  { value: 'DIRECTOR',        label: 'Director',             desc: 'Board member / promoter' },
  { value: 'CS',              label: 'Company Secretary',    desc: 'Compliance officer / KMP' },
  { value: 'CA',              label: 'Chartered Accountant', desc: 'Auditor / financial advisor' },
];

export default function LandingPage() {
  const router = useRouter();

  // Auth state
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
  const [authVisible,   setAuthVisible]   = useState(false);

  const authRef = useRef<HTMLDivElement>(null);

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

  const scrollToAuth = () => {
    setAuthVisible(true);
    setTimeout(() => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const fonts = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Instrument+Sans:wght@400;500;600&family=Crimson+Pro:ital,wght@0,300;0,400;1,300&display=swap');`;

  return (
    <>
      <style>{`
        ${fonts}
        :root {
          --crimson:      #8B1A1A;
          --crimson-mid:  #A52020;
          --gold:         #C4973A;
          --gold-lt:      #D4AB6A;
          --stone:        #F5F2EE;
          --stone-mid:    #EBE6DF;
          --charcoal:     #1C1A18;
          --charcoal-mid: #252320;
          --ink:          #231F1B;
          --ink-mid:      #5C5750;
          --ink-mute:     #96908A;
          --rule:         #E0DAD2;
          --white:        #FDFCFB;
          --serif:        'Playfair Display', Georgia, serif;
          --body:         'Instrument Sans', system-ui, sans-serif;
          --reading:      'Crimson Pro', Georgia, serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: var(--stone); color: var(--ink); font-family: var(--body); font-size: 15px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
        a { color: inherit; text-decoration: none; }
        .wrap { max-width: 1100px; margin: 0 auto; padding: 0 48px; }

        /* Nav */
        .nav-bar { position: sticky; top: 0; z-index: 50; background: var(--charcoal); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 60px; }
        .wordmark { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .wordmark-div { width: 1px; height: 20px; background: rgba(255,255,255,0.16); }
        .wordmark-text { font-family: var(--body); font-size: 0.95rem; font-weight: 600; color: #fff; letter-spacing: 0.09em; text-transform: uppercase; }
        .nav-links { display: flex; align-items: center; gap: 2px; list-style: none; }
        .nav-links a { font-size: 0.81rem; font-weight: 500; color: rgba(255,255,255,0.45); padding: 6px 13px; border-radius: 4px; transition: color 0.15s; cursor: pointer; }
        .nav-links a:hover { color: rgba(255,255,255,0.85); }
        .nav-actions { display: flex; align-items: center; gap: 8px; }
        .btn-ghost-sm { font-size: 0.81rem; font-weight: 500; color: rgba(255,255,255,0.5); padding: 7px 16px; border: 1px solid rgba(255,255,255,0.13); border-radius: 5px; transition: all 0.15s; cursor: pointer; background: none; }
        .btn-ghost-sm:hover { color: #fff; border-color: rgba(255,255,255,0.28); }
        .btn-fill-sm { font-size: 0.81rem; font-weight: 600; color: #fff; padding: 7px 18px; background: var(--crimson); border-radius: 5px; border: none; transition: background 0.15s; cursor: pointer; }
        .btn-fill-sm:hover { background: var(--crimson-mid); }

        /* Hero */
        .hero { background: var(--charcoal); padding: 92px 0 84px; position: relative; overflow: hidden; }
        .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 60% 70% at 50% 55%, rgba(139,26,26,0.12) 0%, transparent 65%); pointer-events: none; }
        .hero-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 68px; align-items: center; }
        .eyebrow { display: inline-flex; align-items: center; gap: 9px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: var(--gold); margin-bottom: 20px; }
        .eyebrow::before { content: ''; width: 20px; height: 1px; background: var(--gold); }
        .hero h1 { font-family: var(--serif); font-size: 3.3rem; font-weight: 600; line-height: 1.08; color: var(--white); letter-spacing: -0.02em; margin-bottom: 20px; }
        .hero h1 em { font-style: italic; color: var(--gold-lt); }
        .hero-lead { font-family: var(--reading); font-size: 1.12rem; color: rgba(255,255,255,0.52); line-height: 1.76; margin-bottom: 36px; font-weight: 300; max-width: 450px; }
        .hero-actions { display: flex; align-items: center; gap: 18px; }
        .btn-hero { display: inline-flex; align-items: center; gap: 8px; background: var(--crimson); color: #fff; font-family: var(--body); font-size: 0.88rem; font-weight: 600; padding: 13px 28px; border-radius: 6px; border: none; cursor: pointer; transition: background 0.2s, transform 0.15s; }
        .btn-hero:hover { background: var(--crimson-mid); transform: translateY(-1px); }
        .btn-hero-ghost { display: inline-flex; align-items: center; gap: 7px; color: rgba(255,255,255,0.42); font-family: var(--body); font-size: 0.84rem; font-weight: 500; transition: color 0.2s; background: none; border: none; cursor: pointer; }
        .btn-hero-ghost:hover { color: rgba(255,255,255,0.75); }

        /* Demo card */
        .demo-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 24px 26px; }
        .demo-hd { display: flex; align-items: center; gap: 11px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .demo-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }
        .demo-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.78); }
        .demo-sub { font-size: 11px; color: rgba(255,255,255,0.28); margin-top: 1px; }
        .ag-row { display: flex; align-items: center; gap: 11px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .ag-row:last-child { border-bottom: none; }
        .ag-n { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; font-size: 0.67rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .ag-done   { background: rgba(74,222,128,0.14); color: #4ade80; }
        .ag-active { background: rgba(196,151,58,0.18); color: var(--gold); }
        .ag-idle   { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.28); }
        .ag-txt { font-size: 0.8rem; color: rgba(255,255,255,0.46); font-family: var(--body); }
        .ag-txt.on { color: rgba(255,255,255,0.9); font-weight: 500; }
        .ag-badge { margin-left: auto; font-size: 0.63rem; font-weight: 600; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 3px; background: rgba(196,151,58,0.13); color: var(--gold); border: 1px solid rgba(196,151,58,0.24); white-space: nowrap; }
        .demo-tagline { margin-top: 14px; text-align: center; font-family: var(--reading); font-size: 0.82rem; color: rgba(255,255,255,0.2); font-style: italic; }

        /* Trust strip */
        .strip { background: var(--charcoal-mid); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
        .strip-row { display: grid; grid-template-columns: repeat(4,1fr); }
        .strip-item { display: flex; align-items: center; gap: 9px; padding: 18px 28px; border-right: 1px solid rgba(255,255,255,0.06); }
        .strip-item:last-child { border-right: none; }
        .strip-txt { font-size: 0.76rem; color: rgba(255,255,255,0.32); font-weight: 500; }

        /* Sections shared */
        .sec-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: var(--crimson); margin-bottom: 14px; }
        .sec-eyebrow::before { content: ''; width: 16px; height: 2px; background: var(--crimson); }
        .sec-eyebrow.gold { color: var(--gold); }
        .sec-eyebrow.gold::before { background: var(--gold); }
        .sec-title { font-family: var(--serif); font-size: 2.2rem; font-weight: 600; line-height: 1.15; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 16px; }
        .sec-title.light { color: var(--white); }
        .sec-title em { font-style: italic; color: var(--crimson); }
        .sec-title.light em { color: var(--gold-lt); }
        .sec-lead { font-family: var(--reading); font-size: 1.08rem; color: var(--ink-mid); line-height: 1.72; }
        .sec-lead.light { color: rgba(255,255,255,0.47); }

        /* Features */
        .features-section { background: var(--white); padding: 88px 0; }
        .feat-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: start; margin-top: 56px; }
        .feat-sticky { position: sticky; top: 80px; }
        .feat-note { margin-top: 24px; padding: 15px 18px; background: rgba(139,26,26,0.05); border-left: 3px solid var(--crimson); border-radius: 0 6px 6px 0; }
        .feat-note p { font-family: var(--reading); font-size: 0.9rem; color: var(--ink-mid); line-height: 1.6; }
        .feat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
        .feat-card { background: var(--stone); border: 1px solid var(--rule); border-radius: 10px; padding: 20px 20px; transition: border-color 0.2s, box-shadow 0.2s; }
        .feat-card:hover { border-color: rgba(139,26,26,0.2); box-shadow: 0 3px 14px rgba(139,26,26,0.05); }
        .feat-icon { width: 32px; height: 32px; background: rgba(139,26,26,0.07); border-radius: 7px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; color: var(--crimson); }
        .feat-card h4 { font-size: 0.84rem; font-weight: 600; color: var(--ink); margin-bottom: 5px; }
        .feat-card p { font-family: var(--reading); font-size: 0.87rem; color: var(--ink-mute); line-height: 1.55; }

        /* Who */
        .who-section { background: var(--charcoal); padding: 88px 0; }
        .who-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-top: 48px; }
        .who-card { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 26px 24px; transition: border-color 0.2s; }
        .who-card:hover { border-color: rgba(196,151,58,0.18); }
        .who-icon { width: 40px; height: 40px; background: rgba(196,151,58,0.09); border: 1px solid rgba(196,151,58,0.17); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: var(--gold); }
        .who-card h3 { font-family: var(--serif); font-size: 1.02rem; font-weight: 600; color: var(--white); margin-bottom: 8px; }
        .who-card p { font-family: var(--reading); font-size: 0.88rem; color: rgba(255,255,255,0.42); line-height: 1.65; }

        /* How */
        .how-section { padding: 88px 0; background: var(--stone); }
        .how-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; }
        .step { display: grid; grid-template-columns: 42px 1fr; gap: 16px; align-items: start; padding: 20px 0; border-bottom: 1px solid var(--rule); }
        .step:first-child { border-top: 1px solid var(--rule); }
        .step-num { width: 42px; height: 42px; flex-shrink: 0; background: var(--stone-mid); border: 1px solid var(--rule); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 0.93rem; font-weight: 600; color: var(--crimson); }
        .step-body h4 { font-size: 0.88rem; font-weight: 600; color: var(--ink); margin-bottom: 4px; padding-top: 10px; }
        .step-body p { font-family: var(--reading); font-size: 0.88rem; color: var(--ink-mid); line-height: 1.6; }
        .step-tag { display: inline-block; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; background: rgba(196,151,58,0.08); color: var(--gold); border: 1px solid rgba(196,151,58,0.2); padding: 2px 8px; border-radius: 3px; margin-top: 6px; }

        /* Auth section */
        .auth-section { background: var(--charcoal); padding: 96px 0; }
        .auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .auth-left-lead { font-family: var(--reading); font-size: 1.08rem; color: rgba(255,255,255,0.47); line-height: 1.74; margin-bottom: 28px; }
        .auth-points { list-style: none; display: flex; flex-direction: column; gap: 11px; }
        .auth-points li { display: flex; align-items: flex-start; gap: 11px; font-family: var(--reading); font-size: 0.93rem; color: rgba(255,255,255,0.47); line-height: 1.55; }
        .auth-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); flex-shrink: 0; margin-top: 7px; }

        /* Auth card */
        .auth-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 34px 32px; }
        .auth-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 24px; }
        .auth-tab { flex: 1; text-align: center; padding: 10px 0; font-size: 0.84rem; font-weight: 600; color: rgba(255,255,255,0.32); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; font-family: var(--body); }
        .auth-tab.active { color: var(--white); border-bottom-color: var(--crimson); }
        .auth-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .auth-field label { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 0.04em; }
        .auth-field input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 7px; padding: 10px 14px; font-size: 0.88rem; color: var(--white); font-family: var(--body); outline: none; transition: border-color 0.2s; }
        .auth-field input:focus { border-color: rgba(196,151,58,0.4); }
        .auth-field input::placeholder { color: rgba(255,255,255,0.2); }
        .role-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; margin-bottom: 14px; }
        .role-chip { display: flex; flex-direction: column; padding: 9px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 7px; cursor: pointer; transition: all 0.15s; background: rgba(255,255,255,0.03); }
        .role-chip.sel { border-color: rgba(139,26,26,0.5); background: rgba(139,26,26,0.08); }
        .role-chip-label { font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.55); transition: color 0.15s; }
        .role-chip.sel .role-chip-label { color: var(--white); }
        .role-chip-desc { font-size: 0.68rem; color: rgba(255,255,255,0.25); margin-top: 2px; }
        .beta-check { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; cursor: pointer; }
        .beta-check-box { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; margin-top: 2px; border: 2px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .beta-check p { font-size: 0.78rem; color: rgba(255,255,255,0.35); line-height: 1.5; }
        .beta-check p a { color: rgba(255,255,255,0.55); text-decoration: underline; }
        .btn-auth { display: block; width: 100%; padding: 13px; background: var(--crimson); color: #fff; font-family: var(--body); font-size: 0.9rem; font-weight: 600; border-radius: 7px; border: none; cursor: pointer; transition: background 0.2s; }
        .btn-auth:hover:not(:disabled) { background: var(--crimson-mid); }
        .btn-auth:disabled { opacity: 0.45; cursor: not-allowed; }
        .divider-row { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
        .divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
        .divider-text { font-size: 0.73rem; color: rgba(255,255,255,0.25); font-weight: 500; }
        .btn-google { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; padding: 11px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 7px; color: rgba(255,255,255,0.65); font-family: var(--body); font-size: 0.86rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .btn-google:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); color: var(--white); }
        .auth-error { background: rgba(139,26,26,0.15); border: 1px solid rgba(139,26,26,0.3); border-radius: 6px; padding: 9px 13px; font-size: 0.82rem; color: #f87171; margin-bottom: 14px; }
        .auth-footer-note { margin-top: 14px; text-align: center; font-size: 0.73rem; color: rgba(255,255,255,0.2); line-height: 1.55; }
        .auth-footer-note a { color: rgba(255,255,255,0.38); text-decoration: underline; }

        /* Logged-in hero state */
        .logged-in-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; padding: 28px 28px; }
        .logged-in-card h3 { font-family: var(--serif); font-size: 1.3rem; font-weight: 600; color: var(--white); margin-bottom: 8px; }
        .logged-in-card p { font-family: var(--reading); font-size: 0.93rem; color: rgba(255,255,255,0.42); margin-bottom: 22px; }
        .btn-dash { display: block; text-align: center; background: var(--crimson); color: #fff; font-family: var(--body); font-size: 0.9rem; font-weight: 600; padding: 13px 28px; border-radius: 7px; border: none; cursor: pointer; transition: background 0.2s; }
        .btn-dash:hover { background: var(--crimson-mid); }

        /* Footer */
        footer { background: var(--charcoal); border-top: 1px solid rgba(255,255,255,0.06); padding: 36px 0; }
        .foot-inner { display: flex; align-items: center; justify-content: space-between; }
        .foot-brand { display: flex; align-items: center; gap: 10px; }
        .foot-copy { font-size: 0.74rem; color: rgba(255,255,255,0.22); }
        .foot-links { display: flex; gap: 22px; list-style: none; }
        .foot-links a { font-size: 0.76rem; color: rgba(255,255,255,0.28); transition: color 0.15s; }
        .foot-links a:hover { color: rgba(255,255,255,0.62); }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu { animation: fadeUp 0.6s ease both; }
        .d1 { animation-delay: 0.12s; }
        .d2 { animation-delay: 0.26s; }
        .d3 { animation-delay: 0.4s; }

        @media (max-width: 768px) {
          .wrap { padding: 0 20px; }
          .hero-grid, .feat-layout, .how-grid, .auth-grid { grid-template-columns: 1fr; gap: 40px; }
          .who-grid { grid-template-columns: 1fr; }
          .feat-grid { grid-template-columns: 1fr; }
          .strip-row { grid-template-columns: 1fr 1fr; }
          .hero h1 { font-size: 2.3rem; }
          .nav-links { display: none; }
        }
      `}</style>

      {/* ── NAV ── */}
      <header className="nav-bar">
        <div className="wrap">
          <nav className="nav-inner">
            <a className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <CastleLogo size={24} />
              <div className="wordmark-div" />
              <span className="wordmark-text">SafeMinutes</span>
            </a>
            <ul className="nav-links">
              <li><a onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</a></li>
              <li><a onClick={() => document.getElementById('who')?.scrollIntoView({ behavior: 'smooth' })}>Who it's for</a></li>
              <li><a onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</a></li>
            </ul>
            <div className="nav-actions">
              {isLoggedIn ? (
                <button className="btn-fill-sm" onClick={() => router.push('/dashboard')}>Go to dashboard →</button>
              ) : (
                <>
                  <button className="btn-ghost-sm" onClick={() => { setIsLogin(true); scrollToAuth(); }}>Sign in</button>
                  <button className="btn-fill-sm" onClick={() => { setIsLogin(false); scrollToAuth(); }}>Get started free</button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="fu">
              <div className="eyebrow">Board Governance for Indian Companies</div>
              <h1>Your board meetings,<br/><em>finally in order.</em></h1>
              <p className="hero-lead">
                SafeMinutes guides your board through every meeting — agenda, attendance, voting, and minutes — and produces the right documents at the end. No more Word files. No more chasing signatures.
              </p>
              <div className="hero-actions fu d2">
                {isLoggedIn ? (
                  <button className="btn-hero" onClick={() => router.push('/dashboard')}>Go to your dashboard →</button>
                ) : (
                  <>
                    <button className="btn-hero" onClick={() => { setIsLogin(false); scrollToAuth(); }}>Start your first meeting →</button>
                    <button className="btn-hero-ghost" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>See how it works</button>
                  </>
                )}
              </div>
            </div>

            {/* Demo card */}
            <div className="fu d3">
              <div className="demo-card">
                <div className="demo-hd">
                  <div className="demo-dot" />
                  <div>
                    <div className="demo-title">Q1 2026 Board Meeting</div>
                    <div className="demo-sub">Acme Ventures Private Limited · In progress</div>
                  </div>
                </div>
                <div className="ag-row">
                  <div className="ag-n ag-done">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="ag-txt">Quorum confirmed — 3 of 3 directors</div>
                </div>
                <div className="ag-row">
                  <div className="ag-n ag-done">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="ag-txt">Director declarations noted</div>
                </div>
                <div className="ag-row">
                  <div className="ag-n ag-active">3</div>
                  <div className="ag-txt on">Auditor appointment — voting open</div>
                  <div className="ag-badge">Live vote</div>
                </div>
                <div className="ag-row">
                  <div className="ag-n ag-idle">4</div>
                  <div className="ag-txt">Bank account authorisation</div>
                </div>
                <div className="ag-row">
                  <div className="ag-n ag-idle">5</div>
                  <div className="ag-txt">Any other business</div>
                </div>
              </div>
              <p className="demo-tagline">Minutes generated automatically when the meeting closes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ── */}
      <div className="strip">
        <div className="wrap">
          <div className="strip-row">
            {[
              { icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="white" strokeWidth="1.4"/><path d="M4 8h8M4 5h8M4 11h5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>, text: 'Companies Act 2013' },
              { icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 6h5L11 9.5l2 5L8 12l-5 2.5 2-5L1 6h5z" stroke="white" strokeWidth="1.3" strokeLinejoin="round"/></svg>, text: 'ICSI Secretarial Standard SS-1' },
              { icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 12V8a5 5 0 0 1 10 0v4" stroke="white" strokeWidth="1.4" strokeLinecap="round"/><rect x="1" y="11" width="14" height="4" rx="1.5" stroke="white" strokeWidth="1.4"/></svg>, text: 'MCA-ready minutes format' },
              { icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z" stroke="white" strokeWidth="1.4"/><path d="M8 5v4l2.5 1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>, text: 'Data stored in India' },
            ].map((item, i) => (
              <div className="strip-item" key={i}>
                <span style={{ opacity: 0.4, flexShrink: 0 }}>{item.icon}</span>
                <span className="strip-txt">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="features-section">
        <div className="wrap">
          <div className="feat-layout">
            <div className="feat-sticky">
              <div className="sec-eyebrow">What SafeMinutes does</div>
              <h2 className="sec-title">Everything a board meeting needs,<br/><em>nothing it does not.</em></h2>
              <p className="sec-lead">
                From the moment you schedule to the moment signed minutes are archived — every step is guided, every document generated automatically.
              </p>
              <div className="feat-note">
                <p>Most small companies keep board minutes in a Word doc passed over WhatsApp. SafeMinutes replaces that with a structured process that produces correct documents automatically.</p>
              </div>
            </div>
            <div className="feat-grid">
              {[
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><rect x="2" y="1" width="11" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 5h5M5 8h5M5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M13 11l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, title: 'SS-1 minutes, auto-generated', desc: 'Meeting data becomes properly formatted minutes — letterhead, DINs, serial numbers, quorum statement. One-click PDF.' },
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 9l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: 'Structured agenda', desc: 'First meeting, quarterly, AGM — templates include all mandatory items in the correct order with legal basis and guidance.' },
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9l2.5 2.5L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: 'Live voting', desc: 'Directors vote on resolutions in real time. Results recorded automatically with names, timestamps, and tally.' },
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M3 2h12v14H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>, title: 'Attendance register', desc: 'A separate statutory attendance register for every meeting — distinct from the minutes, as required under SS-1 Para 4.' },
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M3 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" stroke="currentColor" strokeWidth="1.5"/><path d="M7 2v3M11 2v3M3 8h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, title: 'Document Vault', desc: 'MOA, AOA, incorporation certificate, compliance forms — stored securely and accessible to your board at any time.' },
                { icon: <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><circle cx="5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="13" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="13" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M7.2 8l3.6-2M7.2 10l3.6 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>, title: 'Circular resolutions', desc: 'Pass resolutions without a meeting under Section 175. Collect FOR/OBJECT from all directors digitally with a deadline.' },
              ].map((f, i) => (
                <div className="feat-card" key={i}>
                  <div className="feat-icon">{f.icon}</div>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO ── */}
      <section id="who" className="who-section">
        <div className="wrap">
          <div className="sec-eyebrow gold">Who it is for</div>
          <h2 className="sec-title light">Three kinds of people use SafeMinutes.</h2>
          <p className="sec-lead light" style={{ maxWidth: 520 }}>Whether you are a founder running your own board or a CS managing a portfolio of companies, SafeMinutes adapts to how you work.</p>
          <div className="who-grid">
            {[
              { icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="10" width="16" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/></svg>, title: 'Founders and Directors', body: 'You have two or three directors and you need your board minutes to be right — for investors, banks, and your own peace of mind. SafeMinutes makes that straightforward without a CA on retainer.' },
              { icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 6v4c0 4 3.1 7.7 7 8.9C13.9 17.7 17 14 17 10V6l-7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: 'Company Secretaries', body: 'You handle 10 to 40 small companies. SafeMinutes replaces the Word template you have been copying for years. Produce compliant minutes and attendance registers in minutes, not hours.' },
              { icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 14l3-9h6l3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, title: 'Chartered Accountants', body: 'Your clients ask you to sort the board minutes. Now you can do it properly, with a clear audit trail and the right format, without turning your practice into a secretarial service.' },
            ].map((w, i) => (
              <div className="who-card" key={i}>
                <div className="who-icon">{w.icon}</div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW ── */}
      <section id="how" className="how-section">
        <div className="wrap">
          <div className="how-grid">
            <div>
              <div className="sec-eyebrow">How it works</div>
              <h2 className="sec-title">From notice to signed<br/><em>minutes in one session.</em></h2>
              <p className="sec-lead">SafeMinutes guides your board through every step — agenda, attendance, quorum, voting, and closure — and produces the documents at the end.</p>
            </div>
            <div>
              {[
                { n: '1', title: 'Schedule the meeting', desc: 'Set the date, time, venue, and agenda. Directors receive notice by email with the agenda and any uploaded papers.', tag: null },
                { n: '2', title: 'Open the meeting', desc: 'Directors join, the chairperson is elected, attendance is recorded, quorum is confirmed on record.', tag: 'Real-time sync' },
                { n: '3', title: 'Conduct business', desc: 'Work through the agenda item by item. Move motions, vote on resolutions, note compliance documents. Everything recorded as it happens.', tag: null },
                { n: '4', title: 'Minutes are generated', desc: 'When the meeting closes, SafeMinutes produces compliant minutes. Circulate for the SS-1 7-day review window, then sign.', tag: 'PDF download' },
                { n: '5', title: 'Archive and move on', desc: 'Signed minutes and the attendance register are stored in the Vault. Certified copies available whenever you need them.', tag: null },
              ].map((s, i) => (
                <div className="step" key={i}>
                  <div className="step-num">{s.n}</div>
                  <div className="step-body">
                    <h4>{s.title}</h4>
                    <p>{s.desc}</p>
                    {s.tag && <span className="step-tag">{s.tag}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── AUTH / CTA ── */}
      <section id="auth" className="auth-section" ref={authRef}>
        <div className="wrap">
          <div className="auth-grid">
            {/* Left */}
            <div>
              <div className="sec-eyebrow gold">Early Access</div>
              <h2 className="sec-title light">We are building this<br/><em>with early users.</em></h2>
              <p className="auth-left-lead">
                SafeMinutes is live and being used by real companies right now. We are in early access while we build out the product with direct input from founders, company secretaries, and CAs.
              </p>
              <ul className="auth-points">
                <li><span className="auth-dot"/><span>Free access for the duration of the beta period</span></li>
                <li><span className="auth-dot"/><span>Your feedback directly shapes what gets built next</span></li>
                <li><span className="auth-dot"/><span>30 days notice before any transition to paid plans</span></li>
                <li><span className="auth-dot"/><span>Export all your data at any time</span></li>
                <li><span className="auth-dot"/><span>Direct line to the team — not a support queue</span></li>
              </ul>
            </div>

            {/* Right — auth card or logged-in state */}
            <div>
              {isLoggedIn ? (
                <div className="logged-in-card">
                  <h3>Welcome back{userName ? `, ${userName.split(' ')[0]}` : ''}.</h3>
                  <p>You are signed in. Head to your dashboard to continue.</p>
                  <button className="btn-dash" onClick={() => router.push('/dashboard')}>Go to dashboard →</button>
                </div>
              ) : (
                <div className="auth-card">
                  <div className="auth-tabs">
                    <button className={`auth-tab${isLogin ? ' active' : ''}`} onClick={() => { setIsLogin(true); setError(''); }}>Sign in</button>
                    <button className={`auth-tab${!isLogin ? ' active' : ''}`} onClick={() => { setIsLogin(false); setError(''); }}>Create account</button>
                  </div>

                  {error && <div className="auth-error">{error}</div>}

                  <form onSubmit={handleAuth}>
                    {!isLogin && (
                      <div className="auth-field">
                        <label>Your name</label>
                        <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name"/>
                      </div>
                    )}
                    <div className="auth-field">
                      <label>Email address</label>
                      <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
                    </div>
                    <div className="auth-field">
                      <label>Password</label>
                      <input type="password" placeholder={isLogin ? 'Your password' : 'Choose a strong password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete={isLogin ? 'current-password' : 'new-password'}/>
                    </div>

                    {!isLogin && (
                      <>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', marginBottom: 8 }}>I am a (optional)</div>
                        <div className="role-grid">
                          {PLATFORM_ROLE_OPTIONS.map(opt => (
                            <div key={opt.value} className={`role-chip${platformRoles.includes(opt.value) ? ' sel' : ''}`} onClick={() => toggleRole(opt.value)}>
                              <span className="role-chip-label">{opt.label}</span>
                              <span className="role-chip-desc">{opt.desc}</span>
                            </div>
                          ))}
                        </div>

                        <div className="beta-check" onClick={() => setBetaAccepted(v => !v)}>
                          <div className="beta-check-box" style={{ background: betaAccepted ? '#8B1A1A' : 'transparent', borderColor: betaAccepted ? '#8B1A1A' : 'rgba(255,255,255,0.2)' }}>
                            {betaAccepted && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <p>I agree to the <a href="/beta-terms" onClick={e => e.stopPropagation()}>Early Access Beta Terms</a>. Your data is stored in India and never shared.</p>
                        </div>
                      </>
                    )}

                    <button type="submit" className="btn-auth" disabled={loading || (!isLogin && !betaAccepted)}>
                      {loading ? 'Please wait…' : isLogin ? 'Sign in →' : 'Create free account →'}
                    </button>
                  </form>

                  <div className="divider-row">
                    <div className="divider-line"/>
                    <span className="divider-text">or</span>
                    <div className="divider-line"/>
                  </div>

                  <button className="btn-google" onClick={handleGoogle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </button>

                  <p className="auth-footer-note">
                    By signing in you agree to our <a href="/beta-terms">Beta Terms</a> and <a href="/privacy">Privacy Policy</a>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="wrap">
          <div className="foot-inner">
            <div className="foot-brand">
              <CastleLogo size={20} />
              <span className="wordmark-text" style={{ fontSize: '0.84rem' }}>SafeMinutes</span>
              <span className="foot-copy" style={{ marginLeft: 6 }}>by Passhai Technologies Private Limited</span>
            </div>
            <ul className="foot-links">
              <li><a href="/beta-terms">Beta Terms</a></li>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/terms">Terms</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
