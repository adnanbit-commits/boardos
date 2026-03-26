'use client';
// app/(dashboard)/companies/[companyId]/archive/page.tsx
//
// The statutory register of board meetings — the permanent record a company
// is required to maintain under the Companies Act 2013.
//
// Shows: attendance register · director declarations · resolutions + tally
// + signed minutes with SHA-256 integrity proof.
// All records are immutable once a meeting is LOCKED.

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { archive as archiveApi, minutesApi, resolveDownloadUrl, type ArchiveEntry } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function Spinner() {
  return <div className="w-5 h-5 border-2 border-[#E0DAD2] border-t-[#8B1A1A] rounded-full animate-spin" />;
}

const MODE_LABEL: Record<string, string> = {
  IN_PERSON:       'In Person',
  VIDEO:           'Video',
  PHONE:           'Phone',
  ABSENT:          'Absent',
  REQUESTED_VIDEO: 'Video (requested)',
  REQUESTED_PHONE: 'Phone (requested)',
};

// ── Archive entry card ────────────────────────────────────────────────────────

function ArchiveCard({
  meeting, companyId, jwt, isAdmin,
}: {
  meeting: any; companyId: string; jwt: string; isAdmin: boolean;
}) {
  const [open,      setOpen]      = useState(false);
  const [section,   setSection]   = useState<'attendance'|'declarations'|'resolutions'|'minutes'>('attendance');
  const [exporting, setExporting] = useState(false);
  const [locking,   setLocking]   = useState(false);
  const [certifying,setCertifying]= useState(false);
  const [certifyingId,setCertifyingId] = useState<string|null>(null);
  const [exportUrl, setExportUrl] = useState<string|null>(null);
  const d = new Date(meeting.scheduledAt);

  async function handleExport() {
    setExporting(true);
    try {
      const r = await minutesApi.exportPdf(companyId, meeting.id, jwt);
      const raw = (r as any).downloadUrl ?? (r as any).s3Url;
      const url = resolveDownloadUrl(raw, jwt);
      if (url) { setExportUrl(url); window.open(url, '_blank'); }
    } catch (err: any) {
      alert(err?.body?.message ?? 'PDF export failed. Please try again.');
    } finally { setExporting(false); }
  }

  async function handleLock() {
    if (!confirm('Lock this meeting? The record will be permanently immutable.')) return;
    setLocking(true);
    try { await archiveApi.lock(companyId, meeting.id, jwt); window.location.reload(); }
    catch (err: any) { alert(err?.body?.message ?? 'Could not lock meeting.'); }
    finally { setLocking(false); }
  }

  async function handleCertify() {
    setCertifying(true);
    try {
      const r = await archiveApi.certify(companyId, meeting.id, jwt);
      const raw = (r as any).downloadUrl ?? (r as any).s3Url;
      const url = resolveDownloadUrl(raw, jwt);
      if (url) window.open(url, '_blank');
      else alert('Certified copy issued.');
    }
    catch (err: any) { alert(err?.body?.message ?? 'Could not issue certified copy.'); }
    finally { setCertifying(false); }
  }

  async function handleCertifyResolution(resolutionId: string) {
    setCertifyingId(resolutionId);
    try {
      const r = await archiveApi.certifyResolution(companyId, resolutionId, jwt);
      const raw = (r as any).downloadUrl ?? (r as any).s3Url;
      const url = resolveDownloadUrl(raw, jwt);
      if (url && url !== '#') window.open(url, '_blank');
      else alert('Certified copy issued but download URL unavailable. Refresh and try again.');
    }
    catch (err: any) { alert(err?.body?.message ?? 'Could not issue certified copy.'); }
    finally { setCertifyingId(null); }
  }

  const sections = [
    { key: 'attendance',   label: 'Attendance Register' },
    { key: 'declarations', label: 'Director Declarations' },
    { key: 'resolutions',  label: `Resolutions (${meeting.resolutions?.length ?? 0})` },
    { key: 'minutes',      label: 'Minutes' },
  ] as const;

  return (
    <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl overflow-hidden">
      {/* Status bar */}
      <div className={`h-0.5 ${meeting.status === 'LOCKED' ? 'bg-zinc-600' : 'bg-green-600'}`} />

      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-[#1E2530] transition-colors"
      >
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex-shrink-0 w-12 text-center">
            <p className="text-[#5C5750] text-[10px] font-semibold uppercase tracking-wider">
              {d.toLocaleDateString('en-IN', { month: 'short' })}
            </p>
            <p className="text-[#F0F2F5] text-2xl font-bold leading-tight" style={{ fontFamily: 'monospace' }}>
              {d.getDate().toString().padStart(2, '0')}
            </p>
            <p className="text-[#96908A] text-[10px]">{d.getFullYear()}</p>
          </div>
          <div className="w-px h-10 bg-[#EBE6DF] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[#F0F2F5] font-semibold text-sm truncate" style={{ fontFamily: "'Playfair Display',serif" }}>
              {meeting.title}
            </p>
            <p className="text-[#5C5750] text-xs mt-0.5">
              {formatDate(meeting.scheduledAt)}
              {meeting.attendanceRegister && (
                <span className="ml-2 text-[#96908A]">
                  · {meeting.attendanceRegister.presentCount}/{meeting.attendanceRegister.totalCount} present
                  {meeting.attendanceRegister.quorumMet
                    ? <span className="text-green-600 ml-1">· Quorum ✓</span>
                    : <span className="text-red-600 ml-1">· Quorum not met</span>
                  }
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {meeting.status === 'LOCKED' ? (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide text-[#5C5750] bg-[#EBE6DF]">
              ⊗ Locked
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide text-green-400 bg-green-950">
              ✓ Signed
            </span>
          )}
          {meeting.signatureHash && (
            <span className="text-[#96908A] text-[10px] hidden sm:flex items-center gap-1 bg-[#FDFCFB] border border-[#E0DAD2] px-2.5 py-1 rounded-lg">
              ⛓ SHA-256
            </span>
          )}
          <span className="text-[#96908A] text-xs">{open ? '▴' : '▾'}</span>
        </div>
      </button>

      {/* Expanded register */}
      {open && (
        <div className="border-t border-[#E0DAD2]">
          {/* Section tabs */}
          <div className="flex gap-0 border-b border-[#E0DAD2] overflow-x-auto">
            {sections.map(s => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`px-5 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  section === s.key
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-[#5C5750] hover:text-[#231F1B]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="px-6 py-5">

            {/* ── Attendance Register ── */}
            {section === 'attendance' && (
              <div>
                <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-3">
                  Attendance Register — Sec. 173 &amp; SS-1
                </p>
                {meeting.attendanceRegister?.present?.length > 0 ? (
                  <div className="space-y-1.5 mb-4">
                    {meeting.attendanceRegister.present.map((a: any) => (
                      <div key={a.userId} className="flex items-center justify-between bg-[#FDFCFB] border border-[#E0DAD2] rounded-lg px-4 py-2.5">
                        <span className="text-[#231F1B] text-sm font-medium">{a.name}</span>
                        <span className="text-[10px] font-semibold text-green-400 bg-green-950/50 border border-green-800/30 px-2.5 py-0.5 rounded-full">
                          {MODE_LABEL[a.mode] ?? a.mode}
                        </span>
                      </div>
                    ))}
                    {meeting.attendanceRegister.absent?.map((a: any) => (
                      <div key={a.userId} className="flex items-center justify-between bg-[#FDFCFB] border border-[#E0DAD2] rounded-lg px-4 py-2.5 opacity-50">
                        <span className="text-[#5C5750] text-sm">{a.name}</span>
                        <span className="text-[10px] font-semibold text-[#5C5750] bg-[#EBE6DF]/50 border border-[#E0DAD2]/30 px-2.5 py-0.5 rounded-full">
                          Absent
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#96908A] text-sm py-4">No attendance recorded for this meeting.</p>
                )}
                {meeting.attendanceRegister && (
                  <div className={`rounded-lg px-4 py-2.5 text-xs font-medium border ${
                    meeting.attendanceRegister.quorumMet
                      ? 'bg-green-950/20 border-green-800/20 text-green-400'
                      : 'bg-red-950/20 border-red-800/20 text-red-400'
                  }`}>
                    {meeting.attendanceRegister.quorumMet
                      ? `✓ Quorum met — ${meeting.attendanceRegister.presentCount} of ${meeting.attendanceRegister.totalCount} directors present`
                      : `✕ Quorum not met — ${meeting.attendanceRegister.presentCount} of ${meeting.attendanceRegister.totalCount} directors present`
                    }
                  </div>
                )}
              </div>
            )}

            {/* ── Director Declarations ── */}
            {section === 'declarations' && (
              <div>
                <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-3">
                  Director Declarations — Sec. 152, 164, 184 CA2013
                </p>
                {meeting.declarations?.length > 0 ? (
                  <div className="space-y-3">
                    {meeting.declarations.map((dir: any) => (
                      <div key={dir.name} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-4">
                        <p className="text-[#231F1B] text-sm font-semibold mb-2">{dir.name}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {dir.forms.map((f: any) => (
                            <div key={f.formType} className={`rounded-lg p-2.5 border text-xs ${
                              f.received
                                ? 'bg-green-950/20 border-green-800/20'
                                : 'bg-[#F5F2EE] border-[#E0DAD2]'
                            }`}>
                              <p className="font-bold text-[#231F1B] mb-0.5">{f.formType.replace('_', '-')}</p>
                              <p className={f.received ? 'text-green-400' : 'text-[#96908A]'}>
                                {f.received ? '✓ Received' : '— Not received'}
                              </p>
                              {f.notes && <p className="text-[#96908A] mt-1 italic text-[10px]">{f.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#96908A] text-sm py-4">No declarations recorded for this meeting.</p>
                )}
              </div>
            )}

            {/* ── Resolutions ── */}
            {section === 'resolutions' && (
              <div>
                <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-3">
                  Resolutions Passed
                </p>
                {meeting.resolutions?.length > 0 ? (
                  <div className="space-y-3">
                    {meeting.resolutions.map((r: any, i: number) => (
                      <div key={r.id} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-[#231F1B] text-sm font-semibold">{i + 1}. {r.title}</p>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${
                            r.status === 'APPROVED' ? 'text-green-400 bg-green-950 border-green-800/40'
                            : r.status === 'REJECTED' ? 'text-red-400 bg-red-950 border-red-800/40'
                            : r.status === 'NOTED' ? 'text-[#5C5750] bg-[#EBE6DF] border-[#E0DAD2]/40'
                            : 'text-[#5C5750] bg-[#F5F2EE] border-[#E0DAD2]/40'
                          }`}>
                            {r.type === 'NOTING' ? 'On Record' : r.status}
                          </span>
                        </div>
                        {r.type !== 'NOTING' && (
                          <div className="flex items-center gap-4 text-xs text-[#5C5750] flex-wrap">
                            <span className="text-green-400">✓ {r.tally.APPROVE} For</span>
                            {r.tally.REJECT > 0 && <span className="text-red-400">✕ {r.tally.REJECT} Against</span>}
                            {r.tally.ABSTAIN > 0 && <span>◎ {r.tally.ABSTAIN} Abstain</span>}
                            {r.dissenters?.length > 0 && (
                              <span className="text-red-400/70">
                                Dissenting: {r.dissenters.join(', ')}
                              </span>
                            )}
                            {r.certifiedCopiesCount > 0 && (
                              <span className="text-[#1D4ED8]">
                                {r.certifiedCopiesCount} certified {r.certifiedCopiesCount === 1 ? 'copy' : 'copies'} issued
                              </span>
                            )}
                            {r.status === 'APPROVED' && isAdmin && (
                              <button
                                onClick={() => handleCertifyResolution(r.id)}
                                disabled={certifyingId === r.id}
                                className="ml-auto flex items-center gap-1.5 bg-blue-950/40 border border-blue-800/40 hover:border-blue-600 text-blue-300 text-[10px] font-semibold px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {certifyingId === r.id ? <Spinner /> : '⬡'}
                                {certifyingId === r.id ? 'Generating…' : 'Get Certified Copy'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#96908A] text-sm py-4">No resolutions recorded for this meeting.</p>
                )}
              </div>
            )}

            {/* ── Minutes ── */}
            {section === 'minutes' && (
              <div>
                <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-3">
                  Signed Minutes — Sec. 118 CA2013
                </p>
                {meeting.signatureHash ? (
                  <div className="bg-green-950/20 border border-green-800/20 rounded-xl p-4 mb-4 flex items-start gap-3">
                    <span className="text-green-400 text-base mt-0.5 flex-shrink-0">✓</span>
                    <div className="min-w-0">
                      <p className="text-green-400 text-xs font-semibold mb-1">
                        Minutes signed — {meeting.signedAt ? formatDate(meeting.signedAt) : 'date not recorded'}
                      </p>
                      <p className="text-[#96908A] text-[10px] font-mono break-all leading-relaxed">
                        sha256: {meeting.signatureHash}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-950/20 border border-amber-800/20 rounded-lg px-4 py-3 mb-4 text-amber-700 text-xs">
                    ⚠ Minutes not yet signed for this meeting.
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting || !meeting.signatureHash}
                    className="flex items-center gap-2 bg-[#FDFCFB] border border-[#E0DAD2] hover:border-zinc-500 text-[#231F1B] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {exporting ? <Spinner /> : '⬇'}
                    {exporting ? 'Generating…' : exportUrl ? '↗ Open PDF' : 'Download Minutes PDF'}
                  </button>



                  {isAdmin && meeting.status === 'SIGNED' && (
                    <button
                      onClick={handleLock}
                      disabled={locking}
                      className="flex items-center gap-2 bg-[#FDFCFB] border border-[#E0DAD2]/50 hover:border-zinc-500 text-[#5C5750] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 ml-auto"
                    >
                      {locking ? <Spinner /> : '⊗'}
                      {locking ? 'Locking…' : 'Lock Record'}
                    </button>
                  )}
                </div>

                {meeting.status === 'LOCKED' && (
                  <p className="text-[#96908A] text-[10px] mt-3">
                    This record is permanently locked and cannot be modified.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer link */}
          <div className="border-t border-[#E0DAD2] px-6 py-3 flex justify-end">
            <Link
              href={`/companies/${companyId}/meetings/${meeting.id}`}
              className="text-[#96908A] text-xs hover:text-[#5C5750] transition-colors"
            >
              View original meeting →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const jwt    = getToken()!;
  const me     = getUser();
  const [all,     setAll]     = useState<ArchiveEntry[]>([]);
  const [filter,  setFilter]  = useState<'all'|'signed'|'locked'>('all');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [archiveData, memberList] = await Promise.all([
        archiveApi.list(companyId, jwt),
        import('@/lib/api').then(a => a.companies.listMembers(companyId, jwt)),
      ]);
      setAll(archiveData as any[]);
      const me2 = memberList.find((m: any) => m.user?.id === me?.id);
      setIsAdmin(me2?.isWorkspaceAdmin === true);
    } finally {
      setLoading(false);
    }
  }, [companyId, jwt, me?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = all
    .filter(m => filter === 'all' || m.status.toLowerCase() === filter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="px-10 py-8 max-w-3xl" style={{ fontFamily: "'Instrument Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');`}</style>

      <div className="mb-8">
        <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-2">Statutory Register</p>
        <h1 className="text-[#F0F2F5] font-bold text-2xl mb-1" style={{ fontFamily: "'Playfair Display',serif", letterSpacing: '-0.02em' }}>
          Board Meeting Archive
        </h1>
        <p className="text-[#5C5750] text-sm leading-relaxed">
          The permanent statutory record of board meetings — attendance register, director declarations,
          resolutions, and signed minutes — maintained under Sec. 118 &amp; 173 of the Companies Act 2013.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search meetings…"
          className="flex-1 bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#F0F2F5] placeholder:text-[#96908A] focus:outline-none focus:border-zinc-500 transition-colors"
        />
        <div className="flex bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-1 gap-1">
          {(['all', 'signed', 'locked'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                filter === f ? 'bg-[#FDFCFB] text-[#F0F2F5] border border-[#E0DAD2]' : 'text-[#5C5750] hover:text-[#231F1B]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#96908A]">
          <p className="text-4xl mb-4 opacity-30">▤</p>
          <p className="text-sm font-medium">{search ? 'No meetings match.' : 'No archived meetings yet.'}</p>
          <p className="text-xs mt-2 text-[#96908A]">
            Meetings appear here once signed by the Chairperson.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <ArchiveCard
              key={m.id}
              meeting={m}
              companyId={companyId}
              jwt={jwt}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
