'use client';
// app/(dashboard)/layout.tsx — SafeMinutes shell
// Sidebar stays charcoal (dark); header + main shift to warm off-white.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, notifications as notifApi, type CompanyWithMeta, type AppNotification } from '@/lib/api';

const NAV_STATIC = [
  { href: '/dashboard', label: 'Dashboard', icon: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
  )},
];
const NAV_COMPANY = [
  { key: '',                     label: 'People & Access',     icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M14 14c0-2.5-1-3.8-3-4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'meetings',             label: 'Meetings',            icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1v3M11 1v3M1 7h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { key: 'resolutions',          label: 'Resolutions',         icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5h4M5 8h4M5 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'circular-resolutions', label: 'Circulars',           icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5.8 7.2l4.4-2M5.8 8.8l4.4 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { key: 'archive',              label: 'Archive',             icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1H1V4z" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
];

const D = { bg:'#1C1A18', mid:'#211F1C', lt:'#2A2724', bdr:'rgba(255,255,255,0.07)', text:'#EDE9E3', textSub:'rgba(237,233,227,0.55)', textMute:'rgba(237,233,227,0.3)', crimson:'#8B1A1A', crimsonBg:'rgba(139,26,26,0.14)', crimsonText:'rgba(232,160,160,0.9)', gold:'#C4973A', goldBg:'rgba(196,151,58,0.1)', goldBdr:'rgba(196,151,58,0.18)' };

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
    function h(e: MouseEvent) { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false); }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { if (!token) return; companiesApi.list(token).then(setCompanies).catch(() => {}); }, [token]);

  useEffect(() => {
    if (companies.length === 0) return;
    const match = pathname.match(/\/companies\/([^/]+)/);
    if (match) { const f = companies.find(c => c.id === match[1]); if (f) { setCompany(f); return; } }
    setCompany(companies[0]);
  }, [pathname, companies]);

  useEffect(() => {
    function h(e: MouseEvent) { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false); }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  if (isLoading) return (
    <div style={{ minHeight:'100vh', background:'#F5F2EE', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:22, height:22, border:'2px solid #E0DAD2', borderTopColor:'#8B1A1A', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#F5F2EE', overflow:'hidden', fontFamily:"'Instrument Sans',system-ui,sans-serif", color:'#231F1B' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#E0DAD2;border-radius:10px}
        .nav-item{transition:background 0.15s,color 0.15s}
        .nav-item:hover{background:${D.lt}!important;color:${D.text}!important}
        .nav-item.active{background:${D.crimsonBg}!important;color:${D.crimsonText}!important}
        .hdr-btn:hover{background:#EBE6DF!important}
        .menu-item:hover{background:#F5F2EE!important}
        .notif-item:hover{background:#F5F2EE!important}
      `}</style>

      {/* ── Top header — light ── */}
      <header style={{ flexShrink:0, height:'52px', background:'#FDFCFB', borderBottom:'1px solid #E0DAD2', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', zIndex:30, boxShadow:'0 1px 3px rgba(35,31,27,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <Link href="/" style={{ display:'flex', alignItems:'center', gap:'8px', textDecoration:'none' }}>
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <rect x="2"  y="2" width="4" height="4" rx="0.5" fill="#8B1A1A"/><rect x="8"  y="2" width="4" height="4" rx="0.5" fill="#8B1A1A"/>
              <rect x="14" y="2" width="4" height="4" rx="0.5" fill="#8B1A1A"/><rect x="20" y="2" width="4" height="4" rx="0.5" fill="#8B1A1A"/>
              <rect x="2" y="6" width="22" height="2" fill="#8B1A1A"/>
              <rect x="2" y="8" width="22" height="16" fill="none" stroke="#8B1A1A" strokeWidth="2"/>
              <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke="#8B1A1A" strokeWidth="1.5" fill="none"/>
              <rect x="5" y="12" width="4" height="4" stroke="#8B1A1A" strokeWidth="1.2" fill="none"/>
              <rect x="17" y="12" width="4" height="4" stroke="#8B1A1A" strokeWidth="1.2" fill="none"/>
            </svg>
            <div style={{ width:1, height:16, background:'#E0DAD2', margin:'0 2px' }} />
            <span style={{ fontSize:'12px', fontWeight:600, color:'#231F1B', letterSpacing:'0.09em', textTransform:'uppercase' }}>SafeMinutes</span>
          </Link>
          {company && (<>
            <span style={{ color:'#E0DAD2', fontSize:'14px' }}>/</span>
            <Link href="/dashboard" style={{ fontSize:'12px', color:'#5C5750', textDecoration:'none', fontWeight:500, transition:'color 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.color='#231F1B')} onMouseLeave={e=>(e.currentTarget.style.color='#5C5750')}>
              {company.name}
            </Link>
          </>)}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {/* Bell */}
          <div style={{ position:'relative' }} ref={bellRef}>
            <button className="hdr-btn" onClick={async () => {
              setBellOpen(o=>!o);
              if (!bellOpen && unreadCount>0 && token) { await notifApi.markAllRead(token).catch(()=>{}); setNotifs(p=>p.map(n=>({...n,sentAt:n.sentAt??new Date().toISOString()}))); }
            }} style={{ position:'relative', width:32, height:32, borderRadius:'50%', background:'transparent', border:'1px solid #E0DAD2', display:'flex', alignItems:'center', justifyContent:'center', color:'#96908A', cursor:'pointer', transition:'background 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {unreadCount>0 && <span style={{ position:'absolute', top:-2, right:-2, width:16, height:16, background:'#8B1A1A', borderRadius:'50%', fontSize:'9px', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>{unreadCount>9?'9+':unreadCount}</span>}
            </button>
            {bellOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:300, background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:'12px', boxShadow:'0 16px 40px rgba(35,31,27,0.14)', zIndex:50, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #E0DAD2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ fontSize:'13px', fontWeight:600, color:'#231F1B', margin:0 }}>Notifications</p>
                  {notifs.length>0 && <span style={{ fontSize:'10px', color:'#96908A' }}>{notifs.length} total</span>}
                </div>
                <div style={{ maxHeight:'300px', overflowY:'auto' }}>
                  {notifs.length===0 ? <div style={{ padding:'32px 16px', textAlign:'center', fontSize:'12px', color:'#96908A' }}>No notifications yet</div>
                  : notifs.map(n=>(
                    <div key={n.id} className="notif-item" style={{ padding:'12px 16px', borderBottom:'1px solid #EBE6DF', background:!n.sentAt?'#FEF9F0':'transparent', transition:'background 0.15s' }}>
                      <p style={{ fontSize:'12px', fontWeight:500, color:'#231F1B', margin:'0 0 2px', lineHeight:1.4 }}>{n.subject}</p>
                      <p style={{ fontSize:'11px', color:'#5C5750', margin:'0 0 4px', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>{n.body}</p>
                      <p style={{ fontSize:'10px', color:'#96908A', margin:0 }}>
                        {new Date(n.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                        {!n.sentAt && <span style={{ marginLeft:8, color:'#C4973A', fontWeight:600 }}>● new</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div style={{ position:'relative' }} ref={userMenuRef}>
            <button onClick={()=>setUserMenuOpen(o=>!o)} style={{ width:32, height:32, borderRadius:'50%', background:'#F5E6E6', border:'1px solid #ECC9C9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, color:'#8B1A1A', cursor:'pointer', transition:'background 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='#EDD5D5')} onMouseLeave={e=>(e.currentTarget.style.background='#F5E6E6')}>
              {user?.name?.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()?? '?'}
            </button>
            {userMenuOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:220, background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:'12px', boxShadow:'0 16px 40px rgba(35,31,27,0.14)', zIndex:50, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #E0DAD2' }}>
                  <p style={{ fontSize:'13px', fontWeight:600, color:'#231F1B', margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</p>
                  <p style={{ fontSize:'11px', color:'#5C5750', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</p>
                  {company && <p style={{ fontSize:'10px', fontWeight:600, color:'#8B1A1A', textTransform:'uppercase', letterSpacing:'0.06em', margin:'6px 0 0' }}>{company.myRole}{company.isWorkspaceAdmin?' · Admin':''}</p>}
                </div>
                {company && <Link href={`/companies/${company.id}`} onClick={()=>setUserMenuOpen(false)} className="menu-item" style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', fontSize:'12px', color:'#5C5750', textDecoration:'none', transition:'background 0.15s' }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>Workspace Settings
                </Link>}
                <Link href="/companies/new" onClick={()=>setUserMenuOpen(false)} className="menu-item" style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', fontSize:'12px', color:'#5C5750', textDecoration:'none', transition:'background 0.15s' }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>New Workspace
                </Link>
                <div style={{ height:1, background:'#E0DAD2' }} />
                <button onClick={()=>{setUserMenuOpen(false);logout();}} className="menu-item" style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', fontSize:'12px', color:'#8B1A1A', background:'transparent', border:'none', cursor:'pointer', textAlign:'left', transition:'background 0.15s' }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 8H2M12 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* ── Sidebar — charcoal ── */}
        <aside style={{ width:'200px', flexShrink:0, background:D.mid, borderRight:`1px solid ${D.bdr}`, display:'flex', flexDirection:'column', padding:'12px 8px', overflowY:'auto' }}>
          <nav style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
            {NAV_STATIC.map(item => {
              const active = pathname===item.href || pathname.startsWith(item.href+'/');
              return (
                <Link key={item.href} href={item.href} className={`nav-item${active?' active':''}`}
                  style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', fontSize:'13px', fontWeight:active?600:400, color:active?D.crimsonText:D.textSub, textDecoration:'none', background:active?D.crimsonBg:'transparent' }}>
                  <span style={{ opacity:active?1:0.7 }}>{item.icon}</span>{item.label}
                </Link>
              );
            })}
            {company && (<>
              <div style={{ height:1, background:D.bdr, margin:'6px 2px' }} />
              <div style={{ padding:'2px 2px 6px' }}>
                <p style={{ fontSize:'9px', fontWeight:700, color:D.textMute, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'5px', paddingLeft:'8px' }}>Workspace</p>
                <select value={company.id} onChange={e=>{const c=companies.find(x=>x.id===e.target.value);if(c){setCompany(c);router.push(`/companies/${c.id}`);}}}
                  style={{ width:'100%', background:D.lt, border:`1px solid ${D.bdr}`, borderRadius:'7px', padding:'7px 10px', color:D.text, fontSize:'12px', fontWeight:600, outline:'none', cursor:'pointer', fontFamily:"'Instrument Sans',system-ui,sans-serif" }}>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {NAV_COMPANY.map(item=>{
                const href = item.key?`/companies/${company.id}/${item.key}`:`/companies/${company.id}`;
                const active = item.key?pathname.startsWith(`/companies/${company.id}/${item.key}`):pathname===`/companies/${company.id}`;
                return (
                  <Link key={item.key||'workspace'} href={href} className={`nav-item${active?' active':''}`}
                    style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', fontSize:'13px', fontWeight:active?600:400, color:active?D.crimsonText:D.textSub, textDecoration:'none', background:active?D.crimsonBg:'transparent' }}>
                    <span style={{ opacity:active?1:0.7 }}>{item.icon}</span>{item.label}
                  </Link>
                );
              })}
            </>)}
            {!company && (
              <Link href="/companies/new" className="nav-item" style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 10px', borderRadius:'8px', fontSize:'13px', fontWeight:500, color:D.gold, textDecoration:'none', background:'transparent' }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>Create workspace
              </Link>
            )}
          </nav>
          <div style={{ marginTop:'auto', borderTop:`1px solid ${D.bdr}`, padding:'12px 10px 4px' }}>
            <p style={{ fontSize:'9px', fontWeight:700, color:D.textMute, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'4px' }}>Signed in as</p>
            <p style={{ fontSize:'12px', fontWeight:600, color:D.text, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</p>
            {company && <p style={{ fontSize:'11px', color:D.gold, margin:0, fontWeight:500 }}>{company.isWorkspaceAdmin?company.myRole+' · Admin':company.myRole}</p>}
          </div>
        </aside>

        {/* ── Main — warm off-white ── */}
        <main style={{ flex:1, overflowY:'auto', background:'#F5F2EE' }}>{children}</main>
      </div>
    </div>
  );
}
