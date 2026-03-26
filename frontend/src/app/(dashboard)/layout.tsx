'use client';
// app/(dashboard)/layout.tsx
// Shell: dark sidebar/header anchor + warm-light main content area

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, notifications as notifApi, type CompanyWithMeta, type AppNotification } from '@/lib/api';

const NAV_STATIC = [
  { href: '/dashboard', label: 'Dashboard', icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
  )},
];
const NAV_COMPANY = [
  { key: '',                     label: 'People & Access', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M14 14c0-2.5-1-3.8-3-4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'meetings',             label: 'Meetings',        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1v3M11 1v3M1 7h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { key: 'resolutions',          label: 'Resolutions',     icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5h4M5 8h4M5 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'circular-resolutions', label: 'Circulars',       icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5.8 7.2l4.4-2M5.8 8.8l4.4 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'vault',                label: 'Vault',           icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 3V2M11 3V2M2 8h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="8" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
  { key: 'archive',              label: 'Archive',         icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1H1V4z" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
];

const D = {
  // sidebar/header (stays dark — the intentional anchor)
  bg:      '#1C1A18',
  bgMid:   '#211F1C',
  bgLt:    '#2A2724',
  bdr:     'rgba(255,255,255,0.08)',
  txt:     'rgba(237,233,227,0.9)',
  txtSub:  'rgba(237,233,227,0.45)',
  txtMute: 'rgba(237,233,227,0.25)',
  gold:    '#C4973A',
  goldBg:  'rgba(196,151,58,0.12)',
  goldBdr: 'rgba(196,151,58,0.2)',
  crimson: '#8B1A1A',
  crimBg:  'rgba(139,26,26,0.14)',
  crimTxt: 'rgba(224,160,160,0.9)',
  // main content (light warm)
  pageB:   '#F5F2EE',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, token, logout, isLoading } = useRequireAuth();
  const [company,   setCompany]   = useState<CompanyWithMeta | null>(null);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifs,   setNotifs]   = useState<AppNotification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifs.filter(n => !n.sentAt).length;

  useEffect(() => {
    if (!token) return;
    const load = () => notifApi.list(token).then(setNotifs).catch(() => {});
    load(); const id = setInterval(load, 30_000); return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!token) return;
    companiesApi.list(token).then(setCompanies).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (companies.length === 0) return;
    const match = pathname.match(/\/companies\/([^/]+)/);
    if (match) { const f = companies.find(c => c.id === match[1]); if (f) { setCompany(f); return; } }
    setCompany(companies[0]);
  }, [pathname, companies]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: `2px solid ${D.bgLt}`, borderTopColor: D.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const navItem = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? D.crimTxt : D.txtSub, textDecoration: 'none', background: active ? D.crimBg : 'transparent', transition: 'all 0.12s' }}
      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = D.bgLt; (e.currentTarget as HTMLElement).style.color = D.txt; }}}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = D.txtSub; }}}>
      <span style={{ opacity: active ? 1 : 0.65, flexShrink: 0 }}>{icon}</span>
      {label}
    </Link>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: D.pageB, overflow: 'hidden', fontFamily: "'Instrument Sans', system-ui, sans-serif", color: '#231F1B' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#E0DAD2;border-radius:4px}
        ::-webkit-scrollbar-track{background:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input:focus,textarea:focus,select:focus{outline:none;border-color:rgba(139,26,26,0.4)!important;box-shadow:0 0 0 3px rgba(139,26,26,0.07)!important}
        input[type="datetime-local"]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:0.5}
        ::placeholder{color:#96908A}
      `}</style>

      {/* ── Top Navbar — dark ── */}
      <header style={{ flexShrink: 0, height: 50, background: D.bg, borderBottom: `1px solid ${D.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <svg width="19" height="19" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/><rect x="8" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="14" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/><rect x="20" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="2" y="6" width="22" height="2" fill="#C4973A"/>
              <rect x="2" y="8" width="22" height="16" fill="none" stroke="#C4973A" strokeWidth="2"/>
              <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke="#C4973A" strokeWidth="1.5" fill="none"/>
              <rect x="5" y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
              <rect x="17" y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
            </svg>
            <div style={{ width: 1, height: 16, background: D.bdr }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', letterSpacing: '0.09em', textTransform: 'uppercase' }}>SafeMinutes</span>
          </Link>
          {company && (
            <>
              <span style={{ color: D.bdr, fontSize: 12 }}>/</span>
              <Link href="/dashboard" style={{ fontSize: 12, color: D.txtSub, textDecoration: 'none', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.color = D.txt)}
                onMouseLeave={e => (e.currentTarget.style.color = D.txtSub)}>
                {company.name}
              </Link>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Bell */}
          <div style={{ position: 'relative' }} ref={bellRef}>
            <button onClick={async () => {
              setBellOpen(o => !o);
              if (!bellOpen && unreadCount > 0 && token) {
                await notifApi.markAllRead(token).catch(() => {});
                setNotifs(prev => prev.map(n => ({ ...n, sentAt: n.sentAt ?? new Date().toISOString() })));
              }
            }} style={{ width: 30, height: 30, borderRadius: '50%', background: D.bgLt, border: `1px solid ${D.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.txtSub, cursor: 'pointer', position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 15, height: 15, background: D.crimson, borderRadius: '50%', fontSize: 8, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {bellOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 296, background: '#fff', border: '1px solid #E0DAD2', borderRadius: 12, boxShadow: '0 8px 32px rgba(35,31,27,0.12)', zIndex: 50, overflow: 'hidden' }}>
                <div style={{ padding: '11px 14px', borderBottom: '1px solid #E0DAD2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#231F1B', margin: 0 }}>Notifications</p>
                  {notifs.length > 0 && <span style={{ fontSize: 10, color: '#96908A' }}>{notifs.length} total</span>}
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {notifs.length === 0
                    ? <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: '#96908A' }}>No notifications yet</div>
                    : notifs.map(n => (
                      <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid #F5F2EE', background: !n.sentAt ? 'rgba(139,26,26,0.04)' : 'transparent' }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#231F1B', margin: '0 0 2px', lineHeight: 1.4 }}>{n.subject}</p>
                        <p style={{ fontSize: 11, color: '#5C5750', margin: '0 0 3px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{n.body}</p>
                        <p style={{ fontSize: 10, color: '#96908A', margin: 0 }}>
                          {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {!n.sentAt && <span style={{ marginLeft: 6, color: '#C4973A', fontWeight: 600 }}>● new</span>}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button onClick={() => setUserMenuOpen(o => !o)}
              style={{ width: 30, height: 30, borderRadius: '50%', background: D.goldBg, border: `1px solid ${D.goldBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: D.gold, cursor: 'pointer' }}>
              {user?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '?'}
            </button>
            {userMenuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 210, background: '#fff', border: '1px solid #E0DAD2', borderRadius: 12, boxShadow: '0 8px 32px rgba(35,31,27,0.12)', zIndex: 50, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F5F2EE' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#231F1B', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
                  <p style={{ fontSize: 11, color: '#5C5750', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
                  {company && <p style={{ fontSize: 10, fontWeight: 600, color: '#C4973A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '5px 0 0' }}>{company.myRole}{company.isWorkspaceAdmin ? ' · Admin' : ''}</p>}
                </div>
                {[
                  company && { href: `/companies/${company.id}`, label: 'Company Settings' },
                  { href: '/companies/new', label: 'New Workspace' },
                ].filter(Boolean).map((item: any) => (
                  <Link key={item.href} href={item.href} onClick={() => setUserMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', fontSize: 12, color: '#5C5750', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F2EE')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {item.label}
                  </Link>
                ))}
                <div style={{ height: 1, background: '#F5F2EE' }} />
                <button onClick={() => { setUserMenuOpen(false); logout(); }}
                  style={{ width: '100%', display: 'flex', padding: '9px 14px', fontSize: 12, color: '#8B1A1A', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,26,26,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Sidebar — dark ── */}
        <aside style={{ width: 192, flexShrink: 0, background: D.bgMid, borderRight: `1px solid ${D.bdr}`, display: 'flex', flexDirection: 'column', padding: '10px 8px', overflowY: 'auto' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_STATIC.map(item => {
              const active = pathname === item.href;
              return navItem(item.href, item.label, item.icon, active);
            })}

            {company && (
              <>
                <div style={{ height: 1, background: D.bdr, margin: '6px 2px' }} />
                <div style={{ padding: '2px 2px 8px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: D.txtMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, paddingLeft: 8 }}>Workspace</p>
                  <select value={company.id} onChange={e => {
                    const c = companies.find(x => x.id === e.target.value);
                    if (c) { setCompany(c); router.push(`/companies/${c.id}`); }
                  }} style={{ width: '100%', background: D.bgLt, border: `1px solid ${D.bdr}`, borderRadius: 7, padding: '6px 10px', color: D.txt, fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer', fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {NAV_COMPANY.map(item => {
                  const href = item.key ? `/companies/${company.id}/${item.key}` : `/companies/${company.id}`;
                  const active = item.key ? pathname.startsWith(`/companies/${company.id}/${item.key}`) : pathname === `/companies/${company.id}`;
                  return navItem(href, item.label, item.icon, active);
                })}
              </>
            )}

            {!company && navItem('/companies/new', 'Create workspace',
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
              false)}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${D.bdr}` }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: D.txtMute, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, paddingLeft: 2 }}>Signed in</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: D.txt, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 2 }}>{user?.name}</p>
            {company && <p style={{ fontSize: 10, color: D.gold, margin: 0, paddingLeft: 2 }}>{company.isWorkspaceAdmin ? company.myRole + ' · Admin' : company.myRole}</p>}
          </div>
        </aside>

        {/* ── Page content — warm light ── */}
        <main style={{ flex: 1, overflowY: 'auto', background: D.pageB }}>
          {children}
        </main>
      </div>
    </div>
  );
}
