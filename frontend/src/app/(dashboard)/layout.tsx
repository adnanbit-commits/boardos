'use client';
// app/(dashboard)/layout.tsx
// Shell layout — sidebar + top navbar — wraps every page inside the dashboard.
// All child pages (dashboard, meetings, resolutions, documents, archive)
// render inside the <main> slot without re-mounting this layout.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, type CompanyWithMeta } from '@/lib/api';

// NAV items — company-scoped ones use a key so we can build the href dynamically
const NAV_STATIC = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬡' },
];
const NAV_COMPANY = [
  { key: 'meetings',    label: 'Meetings',    icon: '◈' },
  { key: 'resolutions', label: 'Resolutions', icon: '◇' },
  { key: 'archive',     label: 'Archive',     icon: '▤' },
  { key: '',            label: 'Members & Invites', icon: '◎' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname             = usePathname();
  const router               = useRouter();
  const { user, token, logout, isLoading } = useRequireAuth();
  const [company,  setCompany]  = useState<CompanyWithMeta | null>(null);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Load the user's companies and pick the first as active
  useEffect(() => {
    if (!token) return;
    companiesApi.list(token).then(list => {
      setCompanies(list);
      if (list.length > 0) setCompany(list[0]);
    }).catch(() => {});
  }, [token]);

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
      <div className="min-h-screen bg-[#0D0F12] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#232830] border-t-[#4F7FFF] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0D0F12] overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: '#F0F2F5' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2A303A; border-radius: 10px; }
      `}</style>

      {/* ── Top Navbar ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-[52px] bg-[#13161B] border-b border-[#232830]
        flex items-center justify-between px-5 z-10">

        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-1">
            <div className="w-[26px] h-[26px] bg-[#4F7FFF] rounded-[6px] flex items-center justify-center
              text-white font-black text-sm">B</div>
            <span className="font-bold text-[15px] text-[#F0F2F5] tracking-tight">BoardOS</span>
          </div>

          <div className="w-px h-5 bg-[#232830]" />

          {/* Company switcher */}
          <div className="relative">
            <button
              onClick={() => setSwitcherOpen(o => !o)}
              className="flex items-center gap-2 bg-[#191D24] border border-[#232830]
                px-3 py-1.5 rounded-lg text-sm text-[#F0F2F5] font-medium
                hover:border-[#374151] transition-colors"
            >
              <span className="text-xs">{company?.name ?? 'Select company'}</span>
              <span className="text-[#6B7280] text-[10px]">▾</span>
            </button>

              {/* Dropdown */}
              {switcherOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#191D24] border border-[#232830]
                  rounded-xl shadow-2xl z-50 overflow-hidden">
                  {companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCompany(c);
                        setSwitcherOpen(false);
                        router.push(`/companies/${c.id}`);
                      }}
                      className="w-full text-left flex items-center gap-3 px-4 py-3
                        hover:bg-[#232830] transition-colors border-b border-[#232830] last:border-0"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#1A2540] border border-[#2A3A6A]
                        flex items-center justify-center text-[#4F7FFF] font-bold text-xs">
                        {c.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[#F0F2F5] text-xs font-semibold truncate">{c.name}</p>
                        <p className="text-[#6B7280] text-[10px]">{c.myRole}</p>
                      </div>
                      {company?.id === c.id && <span className="ml-auto text-[#4F7FFF] text-xs">✓</span>}
                    </button>
                  ))}
                  <Link
                    href="/companies/new"
                    onClick={() => setSwitcherOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-[#4F7FFF] text-xs
                      font-medium hover:bg-[#232830] transition-colors"
                  >
                    <span>+</span> New company workspace
                  </Link>
                </div>
              )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Pending indicator */}
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]" />
            <span className="text-[#6B7280] text-xs">Pending actions</span>
          </div>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              title={user?.name ?? 'Account'}
              className="w-8 h-8 rounded-full bg-[#1A2540] border border-[#2A3A6A]
                flex items-center justify-center text-[#4F7FFF] text-[11px] font-bold
                hover:bg-[#232830] transition-colors"
            >
              {user?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '?'}
            </button>

            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-56 bg-[#191D24] border border-[#232830]
                rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-[#232830]">
                  <p className="text-[#F0F2F5] text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-[#6B7280] text-xs truncate mt-0.5">{user?.email}</p>
                  {company && (
                    <p className="text-[#4F7FFF] text-[10px] font-semibold uppercase tracking-wide mt-1.5">
                      {company.myRole}{company.isChairman ? ' · Chairman' : ''}
                    </p>
                  )}
                </div>
                {/* Menu items */}
                {company && (
                  <Link
                    href={`/companies/${company.id}`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[#D4D8E0] text-xs
                      hover:bg-[#232830] transition-colors"
                  >
                    <span className="text-base">⬢</span> Company Settings
                  </Link>
                )}
                <Link
                  href="/companies/new"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[#D4D8E0] text-xs
                    hover:bg-[#232830] transition-colors"
                >
                  <span className="text-base">+</span> New Workspace
                </Link>
                <div className="border-t border-[#232830]" />
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
        <aside className="w-[210px] flex-shrink-0 bg-[#13161B] border-r border-[#232830]
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
                      ? 'bg-[#1A2540] text-[#4F7FFF] font-semibold'
                      : 'text-[#6B7280] hover:bg-[#191D24] hover:text-[#D4D8E0] font-normal'
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
                <div style={{ height: 1, background: '#232830', margin: '6px 4px' }} />
                <p style={{ fontSize: 10, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 12px 4px' }}>
                  {company.name.split(' ')[0]}
                </p>
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
                          ? 'bg-[#1A2540] text-[#4F7FFF] font-semibold'
                          : 'text-[#6B7280] hover:bg-[#191D24] hover:text-[#D4D8E0] font-normal'
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
                  text-[#4F7FFF] hover:bg-[#191D24] font-medium transition-all duration-150"
              >
                <span className="text-sm">+</span>
                Create workspace
              </Link>
            )}
          </nav>

          {/* User card at bottom */}
          <div className="mt-auto pt-3 border-t border-[#232830] px-1">
            <div className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-widest mb-1.5">
              Signed in as
            </div>
            <div className="text-[13px] text-[#F0F2F5] font-semibold truncate">{user?.name}</div>
            <div className="text-[11px] text-[#4F7FFF] mt-0.5">
              {company
                ? (company.myRole === 'ADMIN' && company.isChairman ? 'Admin · Chairman' : company.myRole)
                : '—'}
            </div>
          </div>
        </aside>

        {/* ── Page content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>

      {/* Overlay to close switcher */}
      {switcherOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
      )}
    </div>
  );
}
