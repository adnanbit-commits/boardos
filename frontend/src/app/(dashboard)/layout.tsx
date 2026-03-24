'use client';
// app/(dashboard)/layout.tsx
// Shell layout — sidebar + top navbar — wraps every page inside the dashboard.
// All child pages (dashboard, meetings, resolutions, documents, archive)
// render inside the <main> slot without re-mounting this layout.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, notifications as notifApi, type CompanyWithMeta, type AppNotification } from '@/lib/api';

// NAV items — company-scoped ones use a key so we can build the href dynamically
const NAV_STATIC = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬡' },
];
const NAV_COMPANY = [
  { key: '',            label: 'People & Access',   icon: '◎' },
  { key: 'meetings',    label: 'Meetings',    icon: '◈' },
  { key: 'resolutions', label: 'Resolutions', icon: '◇' },
  { key: 'circular-resolutions', label: 'Circular Resolutions', icon: '↻' },
  { key: 'archive',     label: 'Archive',     icon: '▤' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname             = usePathname();
  const router               = useRouter();
  const { user, token, logout, isLoading } = useRequireAuth();
  const [company,  setCompany]  = useState<CompanyWithMeta | null>(null);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifs,       setNotifs]       = useState<AppNotification[]>([]);
  const [bellOpen,     setBellOpen]     = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifs.filter(n => !n.sentAt).length;

  // Load notifications + refresh every 30s
  useEffect(() => {
    if (!token) return;
    const load = () => notifApi.list(token).then(setNotifs).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [token]);

  // Close bell on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load the user's companies
  useEffect(() => {
    if (!token) return;
    companiesApi.list(token).then(list => {
      setCompanies(list);
    }).catch(() => {});
  }, [token]);

  // Sync active company with URL — picks the company whose id appears in the pathname
  useEffect(() => {
    if (companies.length === 0) return;
    const match = pathname.match(/\/companies\/([^/]+)/);
    if (match) {
      const found = companies.find(c => c.id === match[1]);
      if (found) { setCompany(found); return; }
    }
    // Not on a company route — always default to first company so sidebar shows
    setCompany(companies[0]);
  }, [pathname, companies]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1C1A18] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#2A2724] border-t-[#C4973A] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#1C1A18] overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: '#F0F2F5' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2A2724; border-radius: 10px; }
      `}</style>

      {/* ── Top Navbar ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-[52px] bg-[#1E1C1A] border-b border-[#2A2724]
        flex items-center justify-between px-5 relative z-30">

        <div className="flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mr-1 hover:opacity-80 transition-opacity">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <rect x="2"  y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
                <rect x="8"  y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
                <rect x="14" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
                <rect x="20" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
                <rect x="2" y="6" width="22" height="2" fill="#C4973A"/>
                <rect x="2" y="8" width="22" height="16" fill="none" stroke="#C4973A" strokeWidth="2"/>
                <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke="#C4973A" strokeWidth="1.5" fill="none"/>
                <rect x="5"  y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
                <rect x="17" y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
              </svg>
              <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
              <span className="font-semibold text-[13px] text-white tracking-[0.08em] uppercase">SafeMinutes</span>
          </Link>

          <div className="w-px h-5 bg-[#2A2724]" />

          {/* Breadcrumb — show active company when inside a company route */}
          {company && (
            <Link href="/dashboard"
              className="flex items-center gap-2 text-xs text-[#6B7280] hover:text-[#F0F2F5] transition-colors">
              <span>⬡</span>
              <span className="font-medium">{company.name}</span>
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">

          {/* Notification bell */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={async () => {
                setBellOpen(o => !o);
                if (!bellOpen && unreadCount > 0 && token) {
                  await notifApi.markAllRead(token).catch(() => {});
                  setNotifs(prev => prev.map(n => ({ ...n, sentAt: n.sentAt ?? new Date().toISOString() })));
                }
              }}
              className="relative w-8 h-8 rounded-full bg-[#252220] border border-[#2A2724]
                flex items-center justify-center text-[#6B7280] hover:text-[#F0F2F5]
                hover:border-[#3A4050] transition-colors"
              title="Notifications"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#8B1A1A] rounded-full
                  text-[9px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-80 bg-[#252220] border border-[#2A2724]
                rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#2A2724] flex items-center justify-between">
                  <p className="text-[#F0F2F5] text-sm font-semibold">Notifications</p>
                  {notifs.length > 0 && (
                    <span className="text-[#6B7280] text-[10px]">{notifs.length} total</span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[#6B7280] text-xs">
                      No notifications yet
                    </div>
                  ) : notifs.map(n => (
                    <div key={n.id}
                      className={`px-4 py-3 border-b border-[#2A2724]/50 last:border-0
                        ${!n.sentAt ? 'bg-[#8B1A1A]/10' : ''}`}>
                      <p className="text-[#F0F2F5] text-xs font-medium leading-snug">{n.subject}</p>
                      <p className="text-[#6B7280] text-[11px] mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                      <p className="text-[#4B5563] text-[10px] mt-1">
                        {new Date(n.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                        {!n.sentAt && <span className="ml-2 text-[#C4973A] font-semibold">● new</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              title={user?.name ?? 'Account'}
              className="w-8 h-8 rounded-full bg-[#2A2318] border border-[#C4973A]/30
                flex items-center justify-center text-[#C4973A] text-[11px] font-bold
                hover:bg-[#2A2724] transition-colors"
            >
              {user?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '?'}
            </button>

            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-56 bg-[#252220] border border-[#2A2724]
                rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-[#2A2724]">
                  <p className="text-[#F0F2F5] text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-[#6B7280] text-xs truncate mt-0.5">{user?.email}</p>
                  {company && (
                    <p className="text-[#C4973A] text-[10px] font-semibold uppercase tracking-wide mt-1.5">
                      {company.myRole}{company.isWorkspaceAdmin ? ' · Admin' : ''}
                    </p>
                  )}
                </div>
                {/* Menu items */}
                {company && (
                  <Link
                    href={`/companies/${company.id}`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[#D4D8E0] text-xs
                      hover:bg-[#2A2724] transition-colors"
                  >
                    <span className="text-base">⬢</span> Company Settings
                  </Link>
                )}
                <Link
                  href="/companies/new"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[#D4D8E0] text-xs
                    hover:bg-[#2A2724] transition-colors"
                >
                  <span className="text-base">+</span> New Workspace
                </Link>
                <div className="border-t border-[#2A2724]" />
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-red-400 text-xs
                    hover:bg-red-950/20 transition-colors"
                >
                  <span className="text-base">→</span> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
        <aside className="w-[210px] flex-shrink-0 bg-[#1E1C1A] border-r border-[#2A2724]
          flex flex-col py-4 px-3 overflow-y-auto">

          <nav className="flex flex-col gap-0.5">
            {/* Static links */}
            {NAV_STATIC.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13px]
                    transition-all duration-150
                    ${active
                      ? 'bg-[#3A1010] text-[#E8A0A0] font-semibold'
                      : 'text-[#6B6560] hover:bg-[#252220] hover:text-[#D4CEC5] font-normal'
                    }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}

            {/* Company-scoped links — only show when a company is selected */}
            {company && (
              <>
                <div style={{ height: 1, background: '#2A2724', margin: '6px 4px' }} />
                {/* Company switcher in sidebar */}
                <div style={{ padding: '2px 4px 4px' }}>
                  <p style={{ fontSize:9, fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4, paddingLeft:2 }}>
                    Your Workspaces
                  </p>
                  <select
                    value={company.id}
                    onChange={e => {
                      const c = companies.find(x => x.id === e.target.value);
                      if (c) { setCompany(c); router.push(`/companies/${c.id}`); }
                    }}
                    style={{ width: '100%', background: '#1E1C1A', border: '1px solid #2A2724',
                      borderRadius: 8, padding: '6px 10px', color: '#F0F2F5', fontSize: 12,
                      fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {NAV_COMPANY.map(item => {
                  const href = item.key
                    ? `/companies/${company.id}/${item.key}`
                    : `/companies/${company.id}`;
                  const active = item.key
                    ? pathname.startsWith(`/companies/${company.id}/${item.key}`)
                    : pathname === `/companies/${company.id}`;
                  return (
                    <Link key={item.key || 'workspace'} href={href}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13px]
                        transition-all duration-150
                        ${active
                          ? 'bg-[#3A1010] text-[#E8A0A0] font-semibold'
                          : 'text-[#6B6560] hover:bg-[#252220] hover:text-[#D4CEC5] font-normal'
                        }`}
                    >
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}

            {/* No company yet */}
            {!company && (
              <Link href="/companies/new"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13px]
                  text-[#C4973A] hover:bg-[#252220] font-medium transition-all duration-150"
              >
                <span className="text-sm">+</span>
                Create workspace
              </Link>
            )}
          </nav>

          {/* User card at bottom */}
          <div className="mt-auto pt-3 border-t border-[#2A2724] px-1">
            <div className="text-[10px] text-[#5C5550] font-semibold uppercase tracking-widest mb-1.5">
              Signed in as
            </div>
            <div className="text-[13px] text-[#F0F2F5] font-semibold truncate">{user?.name}</div>
            <div className="text-[11px] text-[#C4973A] mt-0.5">
              {company
                ? (company.isWorkspaceAdmin ? company.myRole + ' · Admin' : company.myRole)
                : '—'}
            </div>
          </div>
        </aside>

        {/* ── Page content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>

    </div>
  );
}
