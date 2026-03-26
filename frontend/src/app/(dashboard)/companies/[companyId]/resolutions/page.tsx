'use client';
// app/(dashboard)/companies/[companyId]/resolutions/page.tsx
// Board meeting resolutions only (CIRCULAR type has its own dedicated page)

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { resolutions as resApi, type Resolution } from '@/lib/api';

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:         { label: 'Draft',     color: '#96908A', bg: '#1A1D23' },
  PROPOSED:      { label: 'Proposed',  color: '#8B1A1A', bg: '#EBE6DF' },
  VOTING:        { label: 'Voting',    color: '#F59E0B', bg: '#261A05' },
  APPROVED:      { label: 'Approved',  color: '#22C55E', bg: '#0D2318' },
  REJECTED:      { label: 'Rejected',  color: '#EF4444', bg: '#2D1515' },
  WITHDRAWN:     { label: 'Withdrawn', color: '#96908A', bg: '#1A1D23' },
};

export default function ResolutionsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { token } = useRequireAuth();
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!token || !companyId) return;
    resApi.list(companyId, token)
      .then(all => {
        // Only show board meeting resolutions — circular ones have their own page
        setResolutions(all.filter(r => r.type !== 'CIRCULAR' && r.meetingId != null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, companyId]);

  const filtered = filter === 'ALL' ? resolutions : resolutions.filter(r => r.status === filter);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #232830', borderTopColor: '#8B1A1A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: '36px 48px', maxWidth: 900, fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#231F1B', marginBottom: 4 }}>Board Resolutions</h1>
        <p style={{ fontSize: 13, color: '#96908A' }}>All resolutions passed at board meetings. For circular resolutions, see the Circular Resolutions section.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['ALL', 'VOTING', 'APPROVED', 'REJECTED', 'DRAFT'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid',
            background: filter === s ? '#EBE6DF' : 'transparent',
            borderColor: filter === s ? '#8B1A1A' : '#E0DAD2',
            color: filter === s ? '#8B1A1A' : '#96908A',
          }}>
            {s === 'ALL' ? 'All' : STATUS_STYLE[s]?.label ?? s}
            {s !== 'ALL' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>
                {resolutions.filter(r => r.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#E0DAD2' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>◇</p>
          <p style={{ fontSize: 14 }}>No resolutions{filter !== 'ALL' ? ` with status "${STATUS_STYLE[filter]?.label}"` : ''} yet.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>Resolutions are created within meetings.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT;
            const approve = r.tally?.APPROVE ?? 0;
            const reject  = r.tally?.REJECT  ?? 0;
            const abstain = r.tally?.ABSTAIN  ?? 0;
            const total   = approve + reject + abstain;
            // meetingId is guaranteed non-null here due to filter above
            return (
              <Link key={r.id} href={`/companies/${companyId}/meetings/${r.meetingId}`}
                style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#FDFCFB', border: '1px solid #232830', borderRadius: 14,
                  padding: '18px 20px', cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#E0DAD2'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#E0DAD2'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#231F1B', marginBottom: 4 }}>{r.title}</p>
                      <p style={{ fontSize: 12, color: '#96908A', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.motionText}</p>
                    </div>
                    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0 }}>
                      {s.label}
                    </span>
                  </div>
                  {total > 0 && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#96908A' }}>
                      <span style={{ color: '#22C55E' }}>✓ {approve} for</span>
                      <span style={{ color: '#EF4444' }}>✕ {reject} against</span>
                      {abstain > 0 && <span>~ {abstain} abstain</span>}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
