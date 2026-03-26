'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, type CompanyWithMeta } from '@/lib/api';

const T = {
  stone: '#F5F2EE', stoneMid: '#EBE6DF', rule: '#E0DAD2', white: '#FDFCFB',
  ink: '#231F1B', inkMid: '#5C5750', inkMute: '#96908A',
  crimson: '#8B1A1A', crimsonMid: '#A52020', crimsonBg: 'rgba(139,26,26,0.07)', crimsonBdr: 'rgba(139,26,26,0.18)',
  gold: '#C4973A', goldBg: 'rgba(196,151,58,0.08)', goldBdr: 'rgba(196,151,58,0.2)', goldText: '#7A5C18',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function CompanyCard({ company, delay }: { company: CompanyWithMeta; delay: number }) {
  const [hov, setHov] = useState(false);
  const hasPending = (company.pendingVotes ?? 0) > 0 || (company.unsignedDocs ?? 0) > 0;
  const roleColor: Record<string, { color: string; bg: string; bdr: string }> = {
    DIRECTOR:          { color: T.crimson,  bg: T.crimsonBg, bdr: T.crimsonBdr },
    COMPANY_SECRETARY: { color: T.goldText, bg: T.goldBg,    bdr: T.goldBdr },
    AUDITOR:           { color: '#166534',  bg: '#F0FDF4',   bdr: '#86EFAC' },
    OBSERVER:          { color: T.inkMute,  bg: T.stoneMid,  bdr: T.rule },
  };
  const rs = roleColor[company.myRole] ?? roleColor.OBSERVER;

  return (
    <Link href={`/companies/${company.id}`} style={{ textDecoration: 'none' }}>
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ background: T.white, borderRadius: 12, padding: '20px', border: `1px solid ${hov ? T.rule : '#EBE6DF'}`, cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: hov ? '0 4px 16px rgba(35,31,27,0.08)' : '0 1px 4px rgba(35,31,27,0.04)', animation: `fadeUp 0.3s ease ${delay}ms both`, position: 'relative' }}>

        {company.live && (
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', boxShadow: '0 0 5px rgba(22,163,74,0.5)' }} />
            <span style={{ fontSize: 9, color: '#16A34A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live</span>
          </div>
        )}

        <div style={{ width: 38, height: 38, borderRadius: 9, background: T.goldBg, border: `1px solid ${T.goldBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: T.gold, marginBottom: 12, fontFamily: "'Playfair Display', Georgia, serif" }}>
          {company.name[0].toUpperCase()}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: '0 0 3px', lineHeight: 1.3 }}>{company.name}</h3>
        {company.cin && <p style={{ fontSize: 10, color: T.inkMute, margin: '0 0 10px', fontFamily: 'monospace', letterSpacing: '0.02em' }}>{company.cin}</p>}

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: hasPending ? 8 : 0 }}>
          <span style={{ background: rs.bg, color: rs.color, border: `1px solid ${rs.bdr}`, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{company.myRole.replace('_', ' ')}</span>
          {company.isWorkspaceAdmin && <span style={{ background: T.goldBg, color: T.goldText, border: `1px solid ${T.goldBdr}`, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin</span>}
        </div>

        {hasPending && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {(company.pendingVotes ?? 0) > 0 && <span style={{ background: T.crimsonBg, color: T.crimson, border: `1px solid ${T.crimsonBdr}`, fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{company.pendingVotes} vote{company.pendingVotes !== 1 ? 's' : ''} pending</span>}
            {(company.unsignedDocs ?? 0) > 0 && <span style={{ background: T.goldBg, color: T.goldText, border: `1px solid ${T.goldBdr}`, fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{company.unsignedDocs} to sign</span>}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 16, right: 16, fontSize: 14, color: hov ? T.crimson : T.rule, transition: 'color 0.2s, transform 0.2s', transform: hov ? 'translateX(2px)' : 'translateX(0)' }}>→</div>
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
      <div style={{ width: 20, height: 20, border: `2px solid ${T.rule}`, borderTopColor: T.crimson, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '40px 44px', maxWidth: 1040 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Greeting */}
      <div style={{ marginBottom: 32, animation: 'fadeUp 0.3s ease both' }}>
        <p style={{ fontSize: 11, color: T.inkMute, marginBottom: 5, letterSpacing: '0.02em' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 600, color: T.ink, letterSpacing: '-0.02em', margin: '0 0 5px' }}>
          {greeting()}, {user?.name?.split(' ')[0]}.
        </h1>
        <p style={{ fontSize: 13, color: T.inkMid, margin: 0 }}>
          {companies.length === 0 ? "Let's get your first workspace set up." : `${companies.length} workspace${companies.length !== 1 ? 's' : ''}${totalPending > 0 ? ` · ${totalPending} vote${totalPending !== 1 ? 's' : ''} pending` : ''}`}
        </p>
      </div>

      {/* Stats */}
      {companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 32, animation: 'fadeUp 0.3s ease 50ms both' }}>
          {[
            { label: 'Workspaces',    value: companies.length, color: T.ink,    bg: T.white },
            { label: 'As Director',   value: directorCount,    color: T.ink,    bg: T.white },
            { label: 'Pending Votes', value: totalPending,     color: T.crimson, bg: T.white },
            { label: 'Docs to Sign',  value: totalUnsigned,    color: T.goldText, bg: T.white },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${T.rule}`, borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 24, fontWeight: 600, color: s.color, fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.03em', margin: '0 0 3px' }}>{s.value}</p>
              <p style={{ fontSize: 10, color: T.inkMute, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, animation: 'fadeUp 0.3s ease 90ms both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 2, background: T.gold, display: 'inline-block' }} />
          <h2 style={{ fontSize: 10, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
            {companies.length > 0 ? `Workspaces (${companies.length})` : 'No workspaces yet'}
          </h2>
        </div>
        <Link href="/companies/new"
          style={{ background: T.crimson, color: '#fff', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.01em' }}
          onMouseEnter={e => (e.currentTarget.style.background = T.crimsonMid)}
          onMouseLeave={e => (e.currentTarget.style.background = T.crimson)}>
          + New Workspace
        </Link>
      </div>

      {/* Cards */}
      {companies.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, animation: 'fadeUp 0.3s ease 110ms both' }}>
          <Link href="/companies/new" style={{ textDecoration: 'none' }}>
            <div style={{ background: T.white, border: `1px dashed ${T.rule}`, borderRadius: 12, padding: '24px 20px', cursor: 'pointer', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = T.gold)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.rule)}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: T.goldBg, border: `1px solid ${T.goldBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: T.gold }}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p style={{ color: T.ink, fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>Create company workspace</p>
              <p style={{ color: T.inkMid, fontSize: 12, lineHeight: 1.6, margin: 0 }}>Set up your company, import directors via CIN, and start managing board meetings.</p>
            </div>
          </Link>
          <div style={{ background: T.white, border: `1px dashed ${T.rule}`, borderRadius: 12, padding: '24px 20px', opacity: 0.6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: T.stoneMid, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: T.inkMute }}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M9 1l2 6h6l-5 3.5 2 6L9 13l-5 3.5 2-6L1 7h6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            </div>
            <p style={{ color: T.ink, fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>Accept an invitation</p>
            <p style={{ color: T.inkMid, fontSize: 12, lineHeight: 1.6, margin: 0 }}>Check your email for a board invitation from your company admin.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {companies.map((c, i) => <CompanyCard key={c.id} company={c} delay={110 + i * 35} />)}
        </div>
      )}
    </div>
  );
}
