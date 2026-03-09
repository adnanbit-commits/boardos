'use client';
// app/partner/page.tsx
// CA/CS partner view — manages governance across multiple client companies.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  companies  as companiesApi,
  meetings   as meetingsApi,
  resolutions as resApi,
  type CompanyWithMeta,
  type Meeting,
} from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface ClientCard extends CompanyWithMeta {
  nextMeeting:    Meeting | null;
  pendingVotes:   number;
  unsignedDocs:   number;
  live:           boolean;
}

function Spinner() { return <div className="w-5 h-5 border-2 border-zinc-700 border-t-purple-400 rounded-full animate-spin" />; }

function Metric({ label, value, accent, urgent=false }: { label:string; value:string; accent:string; urgent?:boolean }) {
  return (
    <div className={`rounded-xl p-2.5 ${urgent ? 'bg-amber-950/20 border border-amber-800/20' : 'bg-[#13161B]'}`}>
      <p className="text-zinc-600 text-[9px] uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className="text-sm font-bold" style={{color:accent,fontFamily:'monospace'}}>{value}</p>
    </div>
  );
}

function ClientTile({ co, onClick }: { co: ClientCard; onClick: (page: string) => void }) {
  return (
    <div className={`bg-[#191D24] border rounded-2xl overflow-hidden flex flex-col transition-colors hover:border-zinc-600/50 ${co.pendingVotes>0||co.unsignedDocs>0 ? 'border-amber-800/30' : 'border-[#232830]'}`}>
      <div className={`h-0.5 ${co.live ? 'bg-green-500' : co.pendingVotes>0 ? 'bg-amber-500' : 'bg-purple-600/50'}`} />
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-950 border border-purple-800/40 flex items-center justify-center text-purple-400 font-black text-base flex-shrink-0">{co.name[0]}</div>
            <div className="min-w-0">
              <p className="text-[#F0F2F5] font-semibold text-sm truncate leading-tight">{co.name}</p>
              {co.cin && <p className="text-zinc-600 text-[10px] font-mono mt-0.5 truncate">{co.cin}</p>}
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-purple-400 bg-purple-950 border border-purple-800/40 uppercase tracking-wide">Partner</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Metric label="Next" value={co.nextMeeting ? new Date(co.nextMeeting.scheduledAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'} accent={co.nextMeeting ? '#4F7FFF' : '#374151'} />
          <Metric label="Votes" value={String(co.pendingVotes)} accent={co.pendingVotes>0 ? '#F59E0B' : '#374151'} urgent={co.pendingVotes>0} />
          <Metric label="Unsigned" value={String(co.unsignedDocs)} accent={co.unsignedDocs>0 ? '#EF4444' : '#374151'} urgent={co.unsignedDocs>0} />
        </div>
        {co.nextMeeting && (
          <div className="flex items-center gap-2 bg-[#13161B] border border-[#232830] rounded-xl px-3 py-2">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${co.live ? 'bg-green-500 shadow-[0_0_6px_#22C55E]' : co.nextMeeting.status==='VOTING' ? 'bg-amber-500' : 'bg-zinc-600'}`} />
            <p className="text-zinc-400 text-xs truncate font-medium">{co.nextMeeting.title}</p>
            <span className="ml-auto text-[10px] text-zinc-600 flex-shrink-0">{co.nextMeeting.status.replace('_',' ')}</span>
          </div>
        )}
      </div>
      <div className="border-t border-[#232830] flex">
        {[['Workspace',`/companies/${co.id}`],['Meetings',`/companies/${co.id}/meetings`],['Archive',`/companies/${co.id}/archive`]].map(([label,href],i) => (
          <Link key={label} href={href}
            className={`flex-1 text-center text-xs font-semibold text-zinc-500 hover:text-blue-300 hover:bg-blue-950/10 transition-colors py-2.5 ${i<2 ? 'border-r border-[#232830]' : ''}`}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const jwt    = getToken();
  const me     = getUser();

  const [cards,   setCards]   = useState<ClientCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<'all'|'urgent'|'active'>('all');

  useEffect(() => { if (!jwt) router.replace('/login'); }, [jwt, router]);

  const load = useCallback(async () => {
    if (!jwt) return;
    const list = await companiesApi.list(jwt);
    const enriched = await Promise.all(list.map(async co => {
      try {
        const [mtgs, votingRes] = await Promise.all([
          meetingsApi.list(co.id, jwt),
          resApi.list(co.id, jwt, { status: 'VOTING' }),
        ]);
        const upcoming = mtgs.filter(m=>!['SIGNED','LOCKED'].includes(m.status))
          .sort((a,b)=>+new Date(a.scheduledAt)-+new Date(b.scheduledAt));
        return {
          ...co,
          nextMeeting:  upcoming[0] ?? null,
          pendingVotes: votingRes.length,
          unsignedDocs: mtgs.filter(m=>m.status==='MINUTES_DRAFT').length,
          live:         mtgs.some(m=>m.status==='IN_PROGRESS'),
        } satisfies ClientCard;
      } catch {
        return { ...co, nextMeeting:null, pendingVotes:0, unsignedDocs:0, live:false } satisfies ClientCard;
      }
    }));
    setCards(enriched);
    setLoading(false);
  }, [jwt]);

  useEffect(() => { load(); }, [load]);

  const visible = cards
    .filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()))
    .filter(c=>filter==='urgent'?(c.pendingVotes>0||c.unsignedDocs>0):filter==='active'?c.live:true);

  return (
    <div className="px-10 py-8 max-w-6xl" style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');`}</style>

      <div className="mb-7">
        <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-2">Partner Control Panel</p>
        <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1" style={{fontFamily:"'Playfair Display',serif",letterSpacing:'-0.02em'}}>Client Companies</h1>
        <p className="text-zinc-500 text-sm">{me?.name} · Managing {cards.length} client{cards.length!==1?'s':''}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {l:'Total Clients', v:cards.length,                                     a:'#A78BFA'},
          {l:'Live Now',      v:cards.filter(c=>c.live).length,                   a:'#22C55E'},
          {l:'Pending Votes', v:cards.reduce((s,c)=>s+c.pendingVotes,0),          a:'#F59E0B'},
          {l:'Unsigned Docs', v:cards.reduce((s,c)=>s+c.unsignedDocs,0),          a:'#EF4444'},
        ].map(s=>(
          <div key={s.l} className="bg-[#191D24] border border-[#232830] rounded-2xl px-5 py-4">
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-2">{s.l}</p>
            <p className="text-3xl font-bold" style={{color:s.a,fontFamily:'monospace'}}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
          className="flex-1 bg-[#191D24] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-[#F0F2F5] placeholder:text-zinc-600 focus:outline-none focus:border-purple-600/50 transition-colors" />
        <div className="flex bg-[#191D24] border border-[#232830] rounded-xl p-1 gap-1">
          {([['all','All'],['urgent','⚠ Urgent'],['active','▶ Live']] as const).map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f as any)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter===f ? 'bg-[#13161B] text-[#F0F2F5] border border-[#374151]' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-4 py-24"><Spinner /><p className="text-zinc-600 text-sm">Loading clients…</p></div>
      ) : visible.length===0 ? (
        <div className="text-center py-20 text-zinc-600">
          <p className="text-4xl mb-4 opacity-30">⬢</p>
          <p className="text-sm">{search ? 'No clients match.' : 'No client companies yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(co=><ClientTile key={co.id} co={co} onClick={()=>{}} />)}
        </div>
      )}
    </div>
  );
}
