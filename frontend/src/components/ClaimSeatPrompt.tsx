'use client';
import { useState } from 'react';
import { companies as companiesApi } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface McaDirector {
  din: string; name: string; designation: string; appointedOn: string | null;
}
interface Props {
  companyId: string; currentUserName: string;
  mcaDirectors: McaDirector[] | null;
  onClaimed: () => void; onDismiss: () => void;
}

function likelyMatch(userName: string, directorName: string): boolean {
  if (!userName || !directorName) return false;
  const userWords = userName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const dirWords  = directorName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const matches   = userWords.filter(w => dirWords.some(d => d.includes(w) || w.includes(d)));
  return matches.length >= Math.min(2, userWords.length);
}

export default function ClaimSeatPrompt({ companyId, currentUserName, mcaDirectors, onClaimed, onDismiss }: Props) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError]       = useState('');

  async function handleClaim(din: string) {
    const jwt = getToken();
    if (!jwt) return;
    setClaiming(din); setError('');
    try {
      await companiesApi.claimSeat(companyId, din, jwt);
      onClaimed();
    } catch (err: any) {
      setError(err?.body?.message ?? 'Could not claim seat. Please try again.');
      setClaiming(null);
    }
  }

  return (
    <div style={{ background:'#FDFCFB', border:'1px solid #2A3A6A', borderRadius:16, padding:'24px 28px', marginBottom:24, fontFamily:"'Instrument Sans',system-ui,sans-serif" }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:20 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:20 }}>⬢</span>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#231F1B', margin:0 }}>Claim your director seat</h2>
          </div>
          <p style={{ fontSize:13, color:'#96908A', margin:0, lineHeight:1.6 }}>
            {mcaDirectors?.length
              ? 'Select which director you are from the MCA records. This links your account to your official DIN.'
              : 'Your company was created without MCA data. Ask your workspace admin to assign your role from the Members panel.'}
          </p>
        </div>
        <button onClick={onDismiss} style={{ background:'transparent', border:'none', color:'#5C5750', fontSize:18, cursor:'pointer', lineHeight:1, padding:'0 4px', flexShrink:0 }}>×</button>
      </div>
      {mcaDirectors?.length ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {mcaDirectors.map(d => {
            const isMatch = likelyMatch(currentUserName, d.name);
            const isBusy  = claiming === d.din;
            return (
              <div key={d.din} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:isMatch?'#0F2A1A':'#FDFCFB', border:`1px solid ${isMatch?'#166534':'#E0DAD2'}`, borderRadius:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
                    <span style={{ fontSize:14, fontWeight:600, color:'#231F1B' }}>{d.name}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#EBE6DF', color:'#8B1A1A', border:'1px solid #2A3A6A', textTransform:'uppercase' as const }}>{d.designation}</span>
                    {isMatch && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#052e16', color:'#22c55e', border:'1px solid #166534', textTransform:'uppercase' as const }}>Likely you</span>}
                  </div>
                  <span style={{ fontSize:11, color:'#5C5750', fontFamily:'monospace' }}>DIN: {d.din}{d.appointedOn ? ` · Appointed ${d.appointedOn}` : ''}</span>
                </div>
                <button onClick={() => handleClaim(d.din)} disabled={!!claiming}
                  style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:claiming?'wait':'pointer', background:isMatch?'#166534':'transparent', border:`1px solid ${isMatch?'#16a34a':'#E0DAD2'}`, color:isMatch?'#FFFFFF':'#96908A', opacity:claiming&&!isBusy?0.5:1, whiteSpace:'nowrap' as const, flexShrink:0 }}>
                  {isBusy ? 'Claiming…' : 'This is me'}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {error && <div style={{ marginTop:12, background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:8, padding:'10px 14px', color:'#FCA5A5', fontSize:13 }}>{error}</div>}
      <p style={{ marginTop:14, fontSize:11, color:'#E0DAD2', margin:'14px 0 0' }}>Don't see your name? Your name in the app may differ from MCA records. Contact your workspace admin to update your role manually.</p>
    </div>
  );
}
