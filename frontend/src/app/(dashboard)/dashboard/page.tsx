'use client';
// dashboard/page.tsx — workspace list, light/warm palette

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, type CompanyWithMeta } from '@/lib/api';

function greeting() { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }

function CompanyCard({ company, delay }: { company: CompanyWithMeta; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const hasPending = (company.pendingVotes??0)>0||(company.unsignedDocs??0)>0;
  const roleStyle: Record<string,{color:string;bg:string;border:string}> = {
    DIRECTOR:          {color:'#8B1A1A', bg:'#F5E6E6', border:'#ECC9C9'},
    COMPANY_SECRETARY: {color:'#9B7320', bg:'#FBF5E6', border:'#E8D499'},
    AUDITOR:           {color:'#166534', bg:'#DCFCE7', border:'#BBF7D0'},
    OBSERVER:          {color:'#5C5750', bg:'#EBE6DF', border:'#D6CFC6'},
  };
  const rs = roleStyle[company.myRole]??roleStyle.OBSERVER;
  return (
    <Link href={`/companies/${company.id}`} style={{ textDecoration:'none' }}>
      <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} style={{
        background:'#FDFCFB', borderRadius:14, padding:'22px',
        border:`1px solid ${hovered?'#C8C0B5':'#E0DAD2'}`,
        cursor:'pointer', transition:'border-color 0.2s,transform 0.15s,box-shadow 0.2s',
        transform:hovered?'translateY(-2px)':'translateY(0)',
        boxShadow:hovered?'0 8px 24px rgba(35,31,27,0.10)':'0 1px 3px rgba(35,31,27,0.06)',
        animation:`fadeUp 0.35s ease ${delay}ms both`, position:'relative',
      }}>
        {company.live && (
          <div style={{ position:'absolute', top:16, right:16, display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#166534', boxShadow:'0 0 5px rgba(22,101,52,0.4)' }} />
            <span style={{ fontSize:10, color:'#166534', fontWeight:600 }}>Live</span>
          </div>
        )}
        <div style={{ width:40, height:40, borderRadius:10, background:'#FBF5E6', border:'1px solid #E8D499', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#9B7320', marginBottom:14, fontFamily:"'Playfair Display',Georgia,serif" }}>
          {company.name[0].toUpperCase()}
        </div>
        <h3 style={{ fontSize:14, fontWeight:600, color:'#231F1B', margin:'0 0 3px', lineHeight:1.3 }}>{company.name}</h3>
        {company.cin && <p style={{ fontSize:10, color:'#96908A', margin:'0 0 12px', fontFamily:'monospace', letterSpacing:'0.02em' }}>{company.cin}</p>}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:hasPending?10:0 }}>
          <span style={{ background:rs.bg, color:rs.color, border:`1px solid ${rs.border}`, fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.06em' }}>{company.myRole}</span>
          {company.isWorkspaceAdmin && <span style={{ background:'#FBF5E6', color:'#9B7320', border:'1px solid #E8D499', fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.06em' }}>Admin</span>}
        </div>
        {hasPending && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {(company.pendingVotes??0)>0 && <span style={{ background:'#F5E6E6', color:'#8B1A1A', fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20 }}>{company.pendingVotes} vote{company.pendingVotes!==1?'s':''} pending</span>}
            {(company.unsignedDocs??0)>0 && <span style={{ background:'#FBF5E6', color:'#9B7320', fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20 }}>{company.unsignedDocs} to sign</span>}
          </div>
        )}
        <div style={{ position:'absolute', bottom:18, right:18, fontSize:14, color:hovered?'#8B1A1A':'#C8C0B5', transition:'color 0.2s,transform 0.2s', transform:hovered?'translateX(3px)':'translateX(0)' }}>→</div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, token } = useRequireAuth();
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [loading,   setLoading]   = useState(true);
  useEffect(() => { if(!token)return; companiesApi.list(token).then(setCompanies).catch(()=>{}).finally(()=>setLoading(false)); },[token]);
  const totalPending  = companies.reduce((s,c)=>s+(c.pendingVotes??0),0);
  const totalUnsigned = companies.reduce((s,c)=>s+(c.unsignedDocs??0),0);
  const directorCount = companies.filter(c=>c.myRole==='DIRECTOR').length;

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ width:22, height:22, border:'2px solid #E0DAD2', borderTopColor:'#8B1A1A', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding:'40px 44px', maxWidth:1060, fontFamily:"'Instrument Sans',system-ui,sans-serif", color:'#231F1B' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        .stat-card:hover{border-color:#C8C0B5!important;box-shadow:0 4px 12px rgba(35,31,27,0.08)!important}
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom:36, animation:'fadeUp 0.35s ease both' }}>
        <p style={{ fontSize:11, color:'#96908A', marginBottom:6, letterSpacing:'0.02em' }}>
          {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}
        </p>
        <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontWeight:600, color:'#231F1B', letterSpacing:'-0.02em', margin:'0 0 6px' }}>
          {greeting()}, {user?.name?.split(' ')[0]}.
        </h1>
        <p style={{ fontSize:13, color:'#5C5750', margin:0, lineHeight:1.5 }}>
          {companies.length===0 ? "Let's get your first workspace set up."
            : `${companies.length} workspace${companies.length!==1?'s':''}${totalPending>0?` · ${totalPending} vote${totalPending!==1?'s':''} pending`:''}`}
        </p>
      </div>

      {/* Stats */}
      {companies.length>0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:36, animation:'fadeUp 0.35s ease 60ms both' }}>
          {[
            { label:'Workspaces',    value:companies.length, color:'#9B7320',  bg:'#FBF5E6', border:'#E8D499' },
            { label:'As Director',   value:directorCount,    color:'#9B7320',  bg:'#FBF5E6', border:'#E8D499' },
            { label:'Pending Votes', value:totalPending,     color:'#8B1A1A',  bg:'#F5E6E6', border:'#ECC9C9' },
            { label:'Docs to Sign',  value:totalUnsigned,    color:'#8B1A1A',  bg:'#F5E6E6', border:'#ECC9C9' },
          ].map(s=>(
            <div key={s.label} className="stat-card" style={{ background:'#FDFCFB', border:`1px solid ${s.border}`, borderRadius:12, padding:'16px 18px', transition:'border-color 0.2s,box-shadow 0.2s', boxShadow:'0 1px 3px rgba(35,31,27,0.06)' }}>
              <p style={{ fontSize:26, fontWeight:600, color:s.color, fontFamily:"'Playfair Display',Georgia,serif", letterSpacing:'-0.03em', margin:'0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize:10, color:'#96908A', fontWeight:600, margin:0, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Section header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, animation:'fadeUp 0.35s ease 100ms both' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:14, height:2, background:'#8B1A1A', display:'inline-block', borderRadius:1 }} />
          <h2 style={{ fontSize:10, fontWeight:700, color:'#96908A', textTransform:'uppercase', letterSpacing:'0.1em', margin:0 }}>
            {companies.length>0?`Workspaces (${companies.length})`:'No workspaces yet'}
          </h2>
        </div>
        <Link href="/companies/new"
          style={{ background:'#8B1A1A', color:'#fff', padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none', letterSpacing:'0.01em', transition:'background 0.15s' }}
          onMouseEnter={e=>(e.currentTarget.style.background='#701515')}
          onMouseLeave={e=>(e.currentTarget.style.background='#8B1A1A')}>
          + New Workspace
        </Link>
      </div>

      {companies.length===0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, animation:'fadeUp 0.35s ease 120ms both' }}>
          <Link href="/companies/new" style={{ textDecoration:'none' }}>
            <div style={{ background:'#FDFCFB', border:'1px dashed #C8C0B5', borderRadius:14, padding:'28px 22px', cursor:'pointer', transition:'border-color 0.2s,box-shadow 0.2s', boxShadow:'0 1px 3px rgba(35,31,27,0.04)' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#8B1A1A';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#C8C0B5';}}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#F5E6E6', border:'1px solid #ECC9C9', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, color:'#8B1A1A' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p style={{ color:'#231F1B', fontWeight:600, fontSize:13, margin:'0 0 5px' }}>Create company workspace</p>
              <p style={{ color:'#5C5750', fontSize:12, lineHeight:1.6, margin:0 }}>Set up your company, import directors via CIN, and start managing board meetings.</p>
            </div>
          </Link>
          <div style={{ background:'#FDFCFB', border:'1px dashed #E0DAD2', borderRadius:14, padding:'28px 22px', opacity:0.6 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'#EBE6DF', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14, color:'#96908A' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M16 4H2M14 4V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M7 8v5M11 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <p style={{ color:'#231F1B', fontWeight:600, fontSize:13, margin:'0 0 5px' }}>Accept an invitation</p>
            <p style={{ color:'#5C5750', fontSize:12, lineHeight:1.6, margin:0 }}>Check your email for a board invitation from your company admin.</p>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:13 }}>
          {companies.map((c,i)=><CompanyCard key={c.id} company={c} delay={120+i*40} />)}
        </div>
      )}
    </div>
  );
}
