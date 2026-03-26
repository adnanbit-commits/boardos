'use client';
// app/(dashboard)/dashboard/page.tsx — workspace overview
// Palette aligned with landing: charcoal / crimson / gold

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, type CompanyWithMeta } from '@/lib/api';

const C = {
  charcoal:    '#1C1A18',
  charcoalMid: '#211F1C',
  charcoalLt:  '#2A2724',
  charcoalBdr: 'rgba(255,255,255,0.07)',
  stone:       'rgba(245,242,238,0.06)',
  crimson:     '#8B1A1A',
  crimsonBg:   'rgba(139,26,26,0.12)',
  crimsonText: 'rgba(232,160,160,0.9)',
  gold:        '#C4973A',
  goldBg:      'rgba(196,151,58,0.1)',
  goldBdr:     'rgba(196,151,58,0.18)',
  goldText:    'rgba(212,171,106,0.9)',
  textPrimary: '#EDE9E3',
  textSub:     'rgba(237,233,227,0.5)',
  textMuted:   'rgba(237,233,227,0.28)',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function CompanyCard({ company, delay }: { company: CompanyWithMeta; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const hasPending = (company.pendingVotes ?? 0) > 0 || (company.unsignedDocs ?? 0) > 0;

  const roleColor: Record<string, { color: string; bg: string }> = {
    DIRECTOR:          { color: C.crimsonText, bg: C.crimsonBg },
    COMPANY_SECRETARY: { color: C.goldText,    bg: C.goldBg },
    AUDITOR:           { color: 'rgba(134,239,172,0.85)', bg: 'rgba(20,83,45,0.3)' },
    OBSERVER:          { color: C.textSub,     bg: C.charcoalLt },
  };
  const rs = roleColor[company.myRole] ?? roleColor.OBSERVER;

  return (
    <Link href={`/companies/${company.id}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: C.charcoalMid, borderRadius: 14, padding: '22px',
          border: `1px solid ${hovered ? 'rgba(196,151,58,0.3)' : C.charcoalBdr}`,
          cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          animation: `fadeUp 0.35s ease ${delay}ms both`,
          position: 'relative',
        }}>

        {company.live && (
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px rgba(74,222,128,0.6)' }} />
            <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>Live</span>
          </div>
        )}

        {/* Company initial */}
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.goldBg, border: `1px solid ${C.goldBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: C.gold, marginBottom: 14, fontFamily: "'Playfair Display', Georgia, serif" }}>
          {company.name[0].toUpperCase()}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: '0 0 3px', lineHeight: 1.3 }}>
          {company.name}
        </h3>

        {company.cin && (
          <p style={{ fontSize: 10, color: C.textMuted, margin: '0 0 12px', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {company.cin}
          </p>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: hasPending ? 10 : 0 }}>
          <span style={{ background: rs.bg, color: rs.color, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {company.myRole}
          </span>
          {company.isWorkspaceAdmin && (
            <span style={{ background: C.goldBg, color: C.gold, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em', border: `1px solid ${C.goldBdr}` }}>
              Admin
            </span>
          )}
        </div>

        {hasPending && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {(company.pendingVotes ?? 0) > 0 && (
              <span style={{ background: C.crimsonBg, color: C.crimsonText, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }}>
                {company.pendingVotes} vote{company.pendingVotes !== 1 ? 's' : ''} pending
              </span>
            )}
            {(company.unsignedDocs ?? 0) > 0 && (
              <span style={{ background: C.goldBg, color: C.goldText, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }}>
                {company.unsignedDocs} to sign
              </span>
            )}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 18, right: 18, fontSize: 14, color: hovered ? C.gold : C.textMuted, transition: 'color 0.2s, transform 0.2s', transform: hovered ? 'translateX(3px)' : 'translateX(0)' }}>→</div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, token } = useRequireAuth();
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!token) return;
    companiesApi.list(token).then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const totalPending  = companies.reduce((s, c) => s + (c.pendingVotes ?? 0), 0);
  const totalUnsigned = companies.reduce((s, c) => s + (c.unsignedDocs  ?? 0), 0);
  const directorCount = companies.filter(c => c.myRole === 'DIRECTOR').length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 22, height: 22, border: `2px solid ${C.charcoalLt}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '40px 44px', maxWidth: 1060, fontFamily: "'Instrument Sans', system-ui, sans-serif", color: C.textPrimary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        .stat-card:hover{border-color:rgba(196,151,58,0.22)!important}
        .new-ws:hover{border-color:rgba(196,151,58,0.35)!important}
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom: 36, animation: 'fadeUp 0.35s ease both' }}>
        <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, letterSpacing: '0.02em' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 600, color: C.textPrimary, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
          {greeting()}, {user?.name?.split(' ')[0]}.
        </h1>
        <p style={{ fontSize: 13, color: C.textSub, margin: 0, lineHeight: 1.5 }}>
          {companies.length === 0
            ? "Let's get your first workspace set up."
            : `${companies.length} workspace${companies.length !== 1 ? 's' : ''}${totalPending > 0 ? ` · ${totalPending} vote${totalPending !== 1 ? 's' : ''} pending` : ''}`}
        </p>
      </div>

      {/* Stats */}
      {companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 36, animation: 'fadeUp 0.35s ease 60ms both' }}>
          {[
            { label: 'Workspaces',    value: companies.length, color: C.gold,        bg: C.goldBg        },
            { label: 'As Director',   value: directorCount,    color: C.gold,        bg: C.goldBg        },
            { label: 'Pending Votes', value: totalPending,     color: C.crimsonText, bg: C.crimsonBg     },
            { label: 'Docs to Sign',  value: totalUnsigned,    color: C.crimsonText, bg: C.crimsonBg     },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ background: C.charcoalMid, border: `1px solid ${C.charcoalBdr}`, borderRadius: 12, padding: '16px 18px', transition: 'border-color 0.2s' }}>
              <p style={{ fontSize: 26, fontWeight: 600, color: s.color, fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.03em', margin: '0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, animation: 'fadeUp 0.35s ease 100ms both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 2, background: C.gold, display: 'inline-block' }} />
          <h2 style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
            {companies.length > 0 ? `Workspaces (${companies.length})` : 'No workspaces yet'}
          </h2>
        </div>
        <Link href="/companies/new"
          style={{ background: C.crimson, color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.01em', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#A52020')}
          onMouseLeave={e => (e.currentTarget.style.background = C.crimson)}>
          + New Workspace
        </Link>
      </div>

      {/* Cards or empty state */}
      {companies.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, animation: 'fadeUp 0.35s ease 120ms both' }}>
          <Link href="/companies/new" style={{ textDecoration: 'none' }}>
            <div className="new-ws" style={{ background: C.charcoalMid, border: `1px dashed ${C.charcoalBdr}`, borderRadius: 14, padding: '28px 22px', cursor: 'pointer', transition: 'border-color 0.2s' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.goldBg, border: `1px solid ${C.goldBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: C.gold }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p style={{ color: C.textPrimary, fontWeight: 600, fontSize: 13, margin: '0 0 5px' }}>Create company workspace</p>
              <p style={{ color: C.textSub, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                Set up your company, import directors via CIN, and start managing board meetings.
              </p>
            </div>
          </Link>
          <div style={{ background: C.charcoalMid, border: `1px dashed ${C.charcoalBdr}`, borderRadius: 14, padding: '28px 22px', opacity: 0.5 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.charcoalLt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: C.textSub }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M16 4H2M14 4V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M7 8v5M11 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <p style={{ color: C.textPrimary, fontWeight: 600, fontSize: 13, margin: '0 0 5px' }}>Accept an invitation</p>
            <p style={{ color: C.textSub, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              Check your email for a board invitation from your company admin.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 13 }}>
          {companies.map((c, i) => <CompanyCard key={c.id} company={c} delay={120 + i * 40} />)}
        </div>
      )}
    </div>
  );
}
