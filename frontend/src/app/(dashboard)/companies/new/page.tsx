'use client';
// app/(dashboard)/companies/new/page.tsx
// Three-step workspace creation:
//  1 — Company name + CIN input
//  2 — CIN lookup results: director list from MCA, admin adds emails
//  3 — Creating (workspace + bulk invites)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, invitations as invitationsApi, cinApi } from '@/lib/api';
import type { CinDirector, CinLookupResult } from '@/lib/api';

const S = {
  card: { width:'100%', maxWidth:560, background:'#191D24', border:'1px solid #232830', borderRadius:20, padding:'40px 36px' } as React.CSSProperties,
  label: { display:'block', fontSize:12, fontWeight:600, color:'#6B7280', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' } as React.CSSProperties,
  input: { width:'100%', background:'#13161B', border:'1px solid #232830', borderRadius:10, padding:'10px 14px', color:'#F0F2F5', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:"'DM Sans',system-ui,sans-serif" } as React.CSSProperties,
  primary: { flex:2, padding:'11px', background:'#4F7FFF', border:'none', borderRadius:10, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' } as React.CSSProperties,
  secondary: { flex:1, padding:'11px', background:'transparent', border:'1px solid #232830', borderRadius:10, color:'#6B7280', fontSize:14, cursor:'pointer' } as React.CSSProperties,
};

function DirectorRow({ d, email, selected, onToggle, onEmail }: {
  d: CinDirector; email: string; selected: boolean;
  onToggle: () => void; onEmail: (v: string) => void;
}) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', background:'#13161B', border:`1px solid ${selected?'#2A3A6A':'#232830'}`, borderRadius:12, marginBottom:8 }}>
      <button onClick={onToggle} style={{ width:20, height:20, borderRadius:6, flexShrink:0, marginTop:2, background:selected?'#4F7FFF':'transparent', border:`2px solid ${selected?'#4F7FFF':'#374151'}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700 }}>
        {selected && '✓'}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <p style={{ fontSize:14, fontWeight:600, color:'#F0F2F5', margin:0 }}>{d.name}</p>
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#1A2540', color:'#4F7FFF', border:'1px solid #2A3A6A', textTransform:'uppercase' }}>{d.designation}</span>
        </div>
        <p style={{ fontSize:11, color:'#4B5563', margin:'0 0 8px', fontFamily:'monospace' }}>DIN: {d.din}{d.appointedOn && ` · Appointed ${d.appointedOn}`}</p>
        {selected && (
          <input type="email" placeholder="director@company.com" value={email} onChange={e => onEmail(e.target.value)}
            style={{ ...S.input, fontSize:13, padding:'8px 12px' }} />
        )}
      </div>
    </div>
  );
}

export default function NewCompanyPage() {
  const router = useRouter();
  const { token } = useRequireAuth();

  const [name, setName] = useState('');
  const [cin, setCin] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form'|'results'|'manual'|'creating'>('form');
  const [cinLoading, setCinLoading] = useState(false);
  const [cinResult, setCinResult] = useState<CinLookupResult | null>(null);
  const [dirState, setDirState] = useState<Record<string, { selected: boolean; email: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  // Manual entry fallback — used when MCA is unavailable
  const [manualDirs, setManualDirs] = useState([{ name: '', din: '', designation: 'Director', email: '' }]);

  async function handleLookup() {
    if (!name.trim()) { setError('Company name is required.'); return; }
    if (!token) return;
    setError('');
    if (!cin.trim()) { await doCreate(null); return; }
    setCinLoading(true);
    try {
      const result = await cinApi.lookup(cin.trim(), token);
      setCinResult(result);
      if (result.companyName && !name.trim()) setName(result.companyName);
      const init: Record<string, { selected: boolean; email: string }> = {};
      result.directors.forEach(d => { init[d.din] = { selected: true, email: '' }; });
      setDirState(init);
      setStep('results');
    } catch (err: any) {
      // MCA unavailable — drop into manual entry with the CIN pre-filled
      setError('');
      setStep('manual');
    } finally {
      setCinLoading(false);
    }
  }

  async function doCreate(cinData: CinLookupResult | null) {
    if (!token) return;
    setSubmitting(true); setStep('creating'); setError('');
    try {
      const company = await companiesApi.create(
        {
          name: cinData?.companyName ?? name.trim(),
          ...(cin.trim() ? { cin: cin.trim().toUpperCase() } : {}),
          ...(cinData?.directors?.length ? { mcaDirectors: cinData.directors } : {}),
        },
        token,
      );
      if (cinData) {
        await Promise.all(
          cinData.directors
            .filter(d => dirState[d.din]?.selected && dirState[d.din]?.email?.trim())
            .map(d => invitationsApi.send(company.id, { email: dirState[d.din].email.trim(), role: 'DIRECTOR' }, token).catch(() => {}))
        );
      }
      router.push(`/companies/${company.id}`);
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to create workspace.');
      setStep(cinData ? 'results' : 'form');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedWithEmail = Object.values(dirState).filter(d => d.selected && d.email.trim()).length;

  async function doCreateManual() {
    if (!token || !name.trim()) return;
    setSubmitting(true); setStep('creating'); setError('');
    try {
      const company = await companiesApi.create(
        { name: name.trim(), ...(cin.trim() ? { cin: cin.trim().toUpperCase() } : {}) },
        token,
      );
      // Send invites to any manual directors who have email
      await Promise.all(
        manualDirs
          .filter(d => d.name.trim() && d.email.trim())
          .map(d => invitationsApi.send(company.id, { email: d.email.trim(), role: 'DIRECTOR' }, token).catch(() => {}))
      );
      router.push(`/companies/${company.id}`);
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to create workspace.');
      setStep('manual');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'creating') return (
    <div style={{ minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#6B7280' }}>
        <div style={{ width:32, height:32, border:'2px solid #232830', borderTop:'2px solid #4F7FFF', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p>Creating workspace and sending invites…</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100%', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'48px 24px', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'); input::placeholder{color:#374151} input:focus{border-color:#4F7FFF!important}`}</style>

      {step === 'form' && (
        <div style={S.card}>
          <div style={{ marginBottom:32 }}>
            <div style={{ width:44, height:44, background:'#1A2540', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#4F7FFF', marginBottom:16 }}>⬢</div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#F0F2F5', marginBottom:6 }}>Create company workspace</h1>
            <p style={{ fontSize:13, color:'#6B7280', lineHeight:1.6 }}>Enter your CIN to auto-import directors from MCA records, or create manually.</p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={S.label}>Company Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Private Limited"
                onKeyDown={e => e.key === 'Enter' && handleLookup()} style={S.input} autoFocus />
            </div>
            <div>
              <label style={S.label}>CIN <span style={{ color:'#374151', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional — imports directors from MCA)</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input type="text" value={cin} onChange={e => setCin(e.target.value.toUpperCase())} placeholder="U12345MH2024PTC000000"
                  onKeyDown={e => e.key === 'Enter' && handleLookup()} style={{ ...S.input, fontFamily:'monospace', flex:1 }} maxLength={21} />
                {cin.trim().length === 21 && (
                  <button onClick={handleLookup} disabled={cinLoading}
                    style={{ padding:'10px 16px', background:'#1A2540', border:'1px solid #2A3A6A', borderRadius:10, color:'#4F7FFF', fontSize:13, fontWeight:600, cursor:cinLoading?'wait':'pointer', whiteSpace:'nowrap' }}>
                    {cinLoading ? '…' : '⟳ Lookup'}
                  </button>
                )}
              </div>
              {cin.trim().length > 0 && cin.trim().length < 21 && (
                <p style={{ fontSize:11, color:'#4B5563', marginTop:4 }}>{21 - cin.trim().length} characters remaining</p>
              )}
            </div>
            {error && <div style={{ background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:8, padding:'10px 14px', color:'#FCA5A5', fontSize:13 }}>{error}</div>}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => router.back()} style={S.secondary}>Cancel</button>
              <button onClick={handleLookup} disabled={submitting || cinLoading}
                style={{ ...S.primary, opacity:submitting||cinLoading?0.6:1, cursor:submitting?'not-allowed':'pointer' }}>
                {cinLoading ? 'Looking up MCA…' : cin.trim().length === 21 ? 'Lookup & Continue →' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'results' && cinResult && (
        <div style={{ ...S.card, maxWidth:640 }}>
          {/* Company header */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:28, paddingBottom:24, borderBottom:'1px solid #232830' }}>
            <div style={{ width:48, height:48, background:'#1A2540', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'#4F7FFF', fontWeight:800, fontSize:20, flexShrink:0 }}>{cinResult.companyName[0]}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
                <h1 style={{ fontSize:18, fontWeight:700, color:'#F0F2F5', margin:0 }}>{cinResult.companyName}</h1>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:cinResult.status.toLowerCase()==='active'?'#052e16':'#2D1515', color:cinResult.status.toLowerCase()==='active'?'#22c55e':'#FCA5A5', border:`1px solid ${cinResult.status.toLowerCase()==='active'?'#166534':'#7F1D1D'}`, textTransform:'uppercase' }}>{cinResult.status}</span>
              </div>
              <p style={{ fontSize:12, color:'#4B5563', margin:'0 0 3px', fontFamily:'monospace' }}>{cinResult.cin}{cinResult.incorporatedOn && ` · Incorporated ${cinResult.incorporatedOn}`}</p>
              {cinResult.registeredAddress && <p style={{ fontSize:12, color:'#6B7280', margin:0 }}>{cinResult.registeredAddress}</p>}
            </div>
          </div>

          {/* Directors */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={{ fontSize:14, fontWeight:700, color:'#F0F2F5', margin:0 }}>Directors from MCA Records</h2>
                <p style={{ fontSize:12, color:'#6B7280', margin:'3px 0 0' }}>Select directors and add their email to send invite links</p>
              </div>
              <span style={{ fontSize:12, color:'#4F7FFF', fontWeight:600 }}>{cinResult.directors.length} found</span>
            </div>
            {cinResult.directors.length === 0
              ? <p style={{ fontSize:13, color:'#6B7280', textAlign:'center', padding:'24px 0' }}>No directors found. Invite them later from the workspace.</p>
              : cinResult.directors.map(d => (
                  <DirectorRow key={d.din} d={d}
                    email={dirState[d.din]?.email ?? ''} selected={dirState[d.din]?.selected ?? true}
                    onToggle={() => setDirState(p => ({ ...p, [d.din]: { ...p[d.din], selected: !p[d.din]?.selected } }))}
                    onEmail={v => setDirState(p => ({ ...p, [d.din]: { ...p[d.din], email: v } }))}
                  />
                ))
            }
          </div>

          <div style={{ background:'#1A2540', border:'1px solid #2A3A6A', borderRadius:10, padding:'12px 14px', marginBottom:20, fontSize:12, color:'#6B7280', lineHeight:1.6 }}>
            ℹ️ Personal emails are not in MCA records. Directors without emails will appear in Members tab and can be invited later.
          </div>

          {error && <div style={{ background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:8, padding:'10px 14px', color:'#FCA5A5', fontSize:13, marginBottom:16 }}>{error}</div>}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep('form')} style={S.secondary}>← Back</button>
            <button onClick={() => doCreate(cinResult)} disabled={submitting}
              style={{ ...S.primary, opacity:submitting?0.6:1, cursor:submitting?'not-allowed':'pointer' }}>
              {submitting ? 'Creating…' : selectedWithEmail > 0 ? `Create & Invite ${selectedWithEmail} Director${selectedWithEmail>1?'s':''}` : 'Create Workspace'}
            </button>
          </div>
        </div>
      )}

      {step === 'manual' && (
        <div style={{ ...S.card, maxWidth:640 }}>
          <div style={{ marginBottom:28, paddingBottom:24, borderBottom:'1px solid #232830' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:32, height:32, background:'#2D1515', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>⚠</div>
              <h1 style={{ fontSize:18, fontWeight:700, color:'#F0F2F5', margin:0 }}>MCA data temporarily unavailable</h1>
            </div>
            <p style={{ fontSize:13, color:'#6B7280', lineHeight:1.6, margin:0 }}>
              The MCA registry is currently unreachable. Enter your company details manually from your Certificate of Incorporation — you can re-sync from MCA later once it's back online.
            </p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:24 }}>
            <div>
              <label style={S.label}>Company Name *</label>
              <input type='text' value={name} onChange={e => setName(e.target.value)} placeholder='Acme Private Limited' style={S.input} />
            </div>
            {cin && (
              <div>
                <label style={S.label}>CIN</label>
                <input type='text' value={cin} readOnly style={{ ...S.input, color:'#6B7280' }} />
              </div>
            )}
          </div>

          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div>
                <h2 style={{ fontSize:14, fontWeight:700, color:'#F0F2F5', margin:0 }}>Directors</h2>
                <p style={{ fontSize:12, color:'#6B7280', margin:'3px 0 0' }}>Add from your Certificate of Incorporation. Email optional — can be added later.</p>
              </div>
              <button onClick={() => setManualDirs(d => [...d, { name:'', din:'', designation:'Director', email:'' }])}
                style={{ fontSize:12, fontWeight:600, color:'#4F7FFF', background:'transparent', border:'1px solid #2A3A6A', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>
                + Add Director
              </button>
            </div>
            {manualDirs.map((d, i) => (
              <div key={i} style={{ background:'#13161B', border:'1px solid #232830', borderRadius:12, padding:'14px 16px', marginBottom:8 }}>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <div style={{ flex:2 }}>
                    <label style={{ ...S.label, marginBottom:4 }}>Name *</label>
                    <input type='text' value={d.name} onChange={e => setManualDirs(dirs => dirs.map((x,j) => j===i?{...x,name:e.target.value}:x))}
                      placeholder='Director full name' style={{ ...S.input, fontSize:13, padding:'8px 12px' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ ...S.label, marginBottom:4 }}>DIN</label>
                    <input type='text' value={d.din} onChange={e => setManualDirs(dirs => dirs.map((x,j) => j===i?{...x,din:e.target.value}:x))}
                      placeholder='00000000' style={{ ...S.input, fontSize:13, padding:'8px 12px', fontFamily:'monospace' }} maxLength={8} />
                  </div>
                  {manualDirs.length > 1 && (
                    <button onClick={() => setManualDirs(dirs => dirs.filter((_,j) => j!==i))}
                      style={{ alignSelf:'flex-end', width:32, height:36, background:'transparent', border:'1px solid #374151', borderRadius:8, color:'#6B7280', cursor:'pointer', fontSize:16 }}>×</button>
                  )}
                </div>
                <div>
                  <label style={{ ...S.label, marginBottom:4 }}>Email <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'#374151' }}>(optional — to send invite)</span></label>
                  <input type='email' value={d.email} onChange={e => setManualDirs(dirs => dirs.map((x,j) => j===i?{...x,email:e.target.value}:x))}
                    placeholder='director@company.com' style={{ ...S.input, fontSize:13, padding:'8px 12px' }} />
                </div>
              </div>
            ))}
          </div>

          {error && <div style={{ background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:8, padding:'10px 14px', color:'#FCA5A5', fontSize:13, marginBottom:16 }}>{error}</div>}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep('form')} style={S.secondary}>← Back</button>
            <button onClick={doCreateManual} disabled={submitting || !name.trim()}
              style={{ ...S.primary, opacity:submitting||!name.trim()?0.6:1, cursor:submitting?'not-allowed':'pointer' }}>
              {submitting ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
