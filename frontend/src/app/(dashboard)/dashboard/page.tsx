'use client';
// app/(dashboard)/dashboard/page.tsx — workspace overview

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, type CompanyWithMeta } from '@/lib/api';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const ROLE_STYLE: Record<string, { color: string; bg: string }> = {
  DIRECTOR:          { color: '#3B82F6', bg: '#0F1E3D' },
  COMPANY_SECRETARY: { color: '#A78BFA', bg: '#1A1030' },
  AUDITOR:           { color: '#34D399', bg: '#0A2018' },
  OBSERVER:          { color: '#94A3B8', bg: '#1A1F2E' },
};

function CompanyCard({ company, delay }: { company: CompanyWithMeta; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const s = ROLE_STYLE[company.myRole] ?? ROLE_STYLE.OBSERVER;
  const hasPending = (company.pendingVotes ?? 0) > 0 || (company.unsignedDocs ?? 0) > 0;

  return (
    <Link href={`/companies/${company.id}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: '#191D24', borderRadius: 16, padding: '24px',
          border: `1px solid ${hovered ? '#4F7FFF60' : '#232830'}`,
          cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          animation: `fadeUp 0.4s ease ${delay}ms both`,
          position: 'relative',
        }}>

        {company.live && (
          <div style={{ position: 'absolute', top: 16, right: 16,
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
            <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>Live</span>
          </div>
        )}

        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#1A2540',
          border: '1px solid #2A3A6A', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 18, fontWeight: 800,
          color: '#4F7FFF', marginBottom: 16 }}>
          {company.name[0].toUpperCase()}
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F0F2F5',
          margin: '0 0 4px', lineHeight: 1.3 }}>
          {company.name}
        </h3>

        {company.cin && (
          <p style={{ fontSize: 11, color: '#374151', margin: '0 0 12px',
            fontFamily: 'monospace' }}>
            {company.cin}
          </p>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: hasPending ? 12 : 0 }}>
          <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700,
            padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase',
            letterSpacing: '0.06em' }}>
            {company.myRole}
          </span>
          {company.isWorkspaceAdmin && (
            <span style={{ background: '#261A05', color: '#F59E0B', fontSize: 10,
              fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Workspace Admin
            </span>
          )}
        </div>

        {hasPending && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(company.pendingVotes ?? 0) > 0 && (
              <span style={{ background: '#261A05', color: '#F59E0B',
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                {company.pendingVotes} vote{company.pendingVotes !== 1 ? 's' : ''} pending
              </span>
            )}
            {(company.unsignedDocs ?? 0) > 0 && (
              <span style={{ background: '#1A1030', color: '#A78BFA',
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                {company.unsignedDocs} to sign
              </span>
            )}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 20, right: 20, fontSize: 16,
          transition: 'color 0.2s, transform 0.2s',
          color: hovered ? '#4F7FFF' : '#374151',
          transform: hovered ? 'translateX(3px)' : 'translateX(0)' }}>
          →
        </div>
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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ width:24, height:24, border:'2px solid #232830',
        borderTopColor:'#4F7FFF', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding:'40px 48px', maxWidth:1100, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom:36, animation:'fadeUp 0.35s ease both' }}>
        <p style={{ color:'#6B7280', fontSize:12, marginBottom:6 }}>
          {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}
        </p>
        <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontWeight:700,
          color:'#F0F2F5', letterSpacing:'-0.02em', margin:'0 0 6px' }}>
          {greeting()}, {user?.name?.split(' ')[0]}.
        </h1>
        <p style={{ color:'#6B7280', fontSize:14, margin:0 }}>
          {companies.length === 0
            ? "Let's get your first workspace set up."
            : `${companies.length} workspace${companies.length !== 1 ? 's' : ''}${totalPending > 0 ? ` · ${totalPending} vote${totalPending !== 1 ? 's' : ''} pending` : ''}`}
        </p>
      </div>

      {/* Aggregate stats */}
      {companies.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12,
          marginBottom:36, animation:'fadeUp 0.4s ease 60ms both' }}>
          {[
            { label:'Workspaces',    value:companies.length, color:'#4F7FFF' },
            { label:'As Director',   value:directorCount,    color:'#22C55E' },
            { label:'Pending Votes', value:totalPending,     color:'#F59E0B' },
            { label:'Docs to Sign',  value:totalUnsigned,    color:'#A78BFA' },
          ].map(s => (
            <div key={s.label} style={{ background:'#191D24', border:'1px solid #232830',
              borderRadius:12, padding:'16px 20px' }}>
              <p style={{ fontSize:26, fontWeight:700, color:s.color, fontFamily:'monospace',
                letterSpacing:'-0.02em', margin:'0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize:11, color:'#6B7280', fontWeight:600, margin:0,
                textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Section header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:20, animation:'fadeUp 0.4s ease 100ms both' }}>
        <h2 style={{ fontSize:13, fontWeight:700, color:'#6B7280', textTransform:'uppercase',
          letterSpacing:'0.08em', margin:0 }}>
          {companies.length > 0 ? `Workspaces (${companies.length})` : 'No workspaces yet'}
        </h2>
        <Link href="/companies/new" style={{ background:'#4F7FFF', color:'#fff',
          padding:'8px 16px', borderRadius:10, fontSize:13, fontWeight:600,
          textDecoration:'none' }}>
          + New Workspace
        </Link>
      </div>

      {/* Cards or empty state */}
      {companies.length === 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16,
          animation:'fadeUp 0.4s ease 120ms both' }}>
          <Link href="/companies/new" style={{ textDecoration:'none' }}>
            <div style={{ background:'#191D24', border:'1px dashed #374151', borderRadius:16,
              padding:'32px 24px', cursor:'pointer' }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor='#4F7FFF'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor='#374151'}>
              <div style={{ width:44,height:44,borderRadius:12,background:'#1A2540',
                border:'1px solid #2A3A6A',display:'flex',alignItems:'center',
                justifyContent:'center',fontSize:22,marginBottom:16 }}>⬢</div>
              <p style={{ color:'#F0F2F5',fontWeight:600,fontSize:14,margin:'0 0 6px' }}>Create company workspace</p>
              <p style={{ color:'#6B7280',fontSize:12,lineHeight:1.6,margin:0 }}>
                Set up your company, import directors via CIN, and start managing board resolutions.
              </p>
            </div>
          </Link>
          <div style={{ background:'#191D24',border:'1px dashed #232830',borderRadius:16,
            padding:'32px 24px',opacity:0.5 }}>
            <div style={{ width:44,height:44,borderRadius:12,background:'#261A05',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:22,marginBottom:16 }}>✉</div>
            <p style={{ color:'#F0F2F5',fontWeight:600,fontSize:14,margin:'0 0 6px' }}>Accept an invitation</p>
            <p style={{ color:'#6B7280',fontSize:12,lineHeight:1.6,margin:0 }}>
              Check your email for a board invitation from your company admin.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid',
          gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {companies.map((c,i) => <CompanyCard key={c.id} company={c} delay={120+i*50} />)}
        </div>
      )}
    </div>
  );
}
