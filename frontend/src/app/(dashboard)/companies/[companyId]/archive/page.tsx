'use client';
// app/(dashboard)/companies/[companyId]/archive/page.tsx
// Read-only vault: signed/locked meetings, SHA-256 proof, PDF download, certified copies.

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { meetings as meetingsApi, minutesApi, archive as archiveApi, type Meeting } from '@/lib/api';
import { getToken } from '@/lib/auth';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
function Spinner() {
  return <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />;
}

function ArchiveCard({ meeting, companyId, jwt }: { meeting: Meeting; companyId: string; jwt: string }) {
  const [open, setOpen]         = useState(false);
  const [exporting, setExp]     = useState(false);
  const [certifying, setCert]   = useState(false);
  const d = new Date(meeting.scheduledAt);

  async function exportPdf() {
    setExp(true);
    try { const r = await minutesApi.exportPdf(companyId, meeting.id, jwt); window.open(r.s3Url,'_blank'); }
    catch { alert('PDF export requires AWS S3 to be configured.'); }
    finally { setExp(false); }
  }

  async function certify() {
    setCert(true);
    try { await archiveApi.certify(companyId, meeting.id, jwt); alert('Certified copy issued successfully.'); }
    catch { alert('Certifying requires AWS S3 to be configured.'); }
    finally { setCert(false); }
  }

  return (
    <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden hover:border-zinc-600/40 transition-colors group">
      <div className={`h-0.5 ${meeting.status==='LOCKED' ? 'bg-zinc-600' : 'bg-green-600'}`} />
      <button onClick={() => setOpen(v=>!v)} className="w-full text-left px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex-shrink-0 w-12 text-center">
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">{d.toLocaleDateString('en-IN',{month:'short'})}</p>
            <p className="text-[#F0F2F5] text-2xl font-bold leading-tight" style={{fontFamily:'monospace'}}>{d.getDate().toString().padStart(2,'0')}</p>
            <p className="text-zinc-600 text-[10px]">{d.getFullYear()}</p>
          </div>
          <div className="w-px h-10 bg-[#232830] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[#F0F2F5] font-semibold text-sm truncate group-hover:text-green-300 transition-colors"
              style={{fontFamily:"'Playfair Display',serif"}}>{meeting.title}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{formatDate(meeting.scheduledAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${meeting.status==='LOCKED' ? 'text-zinc-400 bg-zinc-800' : 'text-green-400 bg-green-950'}`}>
            {meeting.status==='LOCKED' ? 'Locked' : 'Signed'}
          </span>
          <span className="text-zinc-600 text-[10px] hidden sm:flex items-center gap-1.5 bg-[#13161B] border border-[#232830] px-2.5 py-1 rounded-lg">⛓ SHA-256</span>
          <span className="text-zinc-600 text-xs">{open ? '▴' : '▾'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#232830] px-6 pb-6 pt-4 space-y-4">
          <div className="bg-green-950/20 border border-green-800/20 rounded-xl p-3.5 flex items-start gap-3">
            <span className="text-green-500 text-sm mt-0.5">✓</span>
            <div>
              <p className="text-green-400 text-xs font-semibold mb-1">Digitally signed by Chairman</p>
              <p className="text-zinc-600 text-[10px] font-mono break-all leading-relaxed">
                {(meeting as any).signatureHash
                  ? `sha256: ${(meeting as any).signatureHash}`
                  : 'Signature hash not available'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={exportPdf} disabled={exporting}
              className="flex items-center gap-2 bg-[#13161B] border border-[#232830] hover:border-zinc-500 text-zinc-300 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {exporting ? <Spinner /> : '⬇'}{exporting ? 'Generating…' : 'Download Minutes PDF'}
            </button>
            <button onClick={certify} disabled={certifying}
              className="flex items-center gap-2 bg-[#13161B] border border-[#232830] hover:border-zinc-500 text-zinc-300 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {certifying ? <Spinner /> : '⬡'}{certifying ? 'Generating…' : 'Issue Certified Copy'}
            </button>
            <Link href={`/companies/${companyId}/meetings/${meeting.id}`}
              className="ml-auto text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
              View meeting →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArchivePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const jwt = getToken()!;
  const [all,     setAll]     = useState<Meeting[]>([]);
  const [filter,  setFilter]  = useState<'all'|'signed'|'locked'>('all');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    meetingsApi.list(companyId, jwt)
      .then(list => setAll(list.filter(m=>['SIGNED','LOCKED'].includes(m.status))))
      .finally(() => setLoading(false));
  }, [companyId, jwt]);

  const filtered = all
    .filter(m => filter==='all' || m.status===filter.toUpperCase())
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));

  return (
    <div className="px-10 py-8 max-w-3xl" style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');`}</style>

      <div className="mb-8">
        <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-2">Governance Vault</p>
        <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1" style={{fontFamily:"'Playfair Display',serif",letterSpacing:'-0.02em'}}>
          Meeting Archive
        </h1>
        <p className="text-zinc-500 text-sm">Signed and locked meetings with certified minutes.{all.length > 0 && ` ${all.length} total.`}</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search meetings…"
          className="flex-1 bg-[#191D24] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-[#F0F2F5] placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
        <div className="flex bg-[#191D24] border border-[#232830] rounded-xl p-1 gap-1">
          {(['all','signed','locked'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter===f ? 'bg-[#13161B] text-[#F0F2F5] border border-[#374151]' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">
          <p className="text-4xl mb-4 opacity-30">▤</p>
          <p className="text-sm font-medium">{search ? 'No meetings match.' : 'No archived meetings yet.'}</p>
          <p className="text-xs mt-2 text-zinc-700">Meetings appear here once signed by the Chairman.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => <ArchiveCard key={m.id} meeting={m} companyId={companyId} jwt={jwt} />)}
        </div>
      )}
    </div>
  );
}
