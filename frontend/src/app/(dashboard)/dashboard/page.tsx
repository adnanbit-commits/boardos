'use client';
// app/(dashboard)/dashboard/page.tsx
// The first thing a user sees after login.
//
// Layout:
//   ┌────────────────────────────────────────────────────────┐
//   │  Morning greeting + date                               │
//   ├──────────┬─────────────┬─────────────┬────────────────┤
//   │ Meetings │ Pending     │ Directors   │ Documents      │  ← stat cards
//   ├──────────┴─────────────┴─────────────┴────────────────┤
//   │  Upcoming meetings (left)  │  Action required (right) │
//   └────────────────────────────┴─────────────────────────-┘
//
// "Action required" = resolutions currently open for voting.
// Each one shows a live vote bar + "Vote Now" CTA.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { companies as companiesApi, fetchDashboardData, type CompanyWithMeta } from '@/lib/api';
import type { Meeting, Resolution } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const STATUS_STYLE: Record<string, { label: string; c: string; bg: string }> = {
  draft:         { label: 'Draft',       c: '#6B7280', bg: '#1A1D23' },
  scheduled:     { label: 'Scheduled',   c: '#4F7FFF', bg: '#1A2540' },
  in_progress:   { label: 'In Progress', c: '#22C55E', bg: '#0D2318' },
  voting:        { label: 'Voting',      c: '#F59E0B', bg: '#261A05' },
  minutes_draft: { label: 'Minutes',     c: '#A78BFA', bg: '#1A1030' },
  signed:        { label: 'Signed',      c: '#22C55E', bg: '#0D2318' },
  locked:        { label: 'Locked',      c: '#6B7280', bg: '#1A1D23' },
};

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, delta, accent, delay,
}: {
  label: string; value: string; delta: string;
  accent: string; delay: number;
}) {
  return (
    <div style={{
      background: '#191D24', border: '1px solid #232830', borderRadius: 14,
      padding: '22px 24px', animation: `fadeUp 0.4s ease ${delay}ms both`,
    }}>
      <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {label}
      </p>
      <p style={{ fontSize: 30, fontWeight: 700, color: accent, fontFamily: 'monospace', letterSpacing: '-0.02em', marginBottom: 6 }}>
        {value}
      </p>
      <p style={{ color: '#374151', fontSize: 12 }}>{delta}</p>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const s = STATUS_STYLE[status.toLowerCase()] ?? STATUS_STYLE.draft;
  return (
    <span style={{
      background: s.bg, color: s.c, padding: '2px 10px',
      borderRadius: 20, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      {s.label}
    </span>
  );
}

function MiniVoteBar({ approve, reject, abstain, total }: { approve: number; reject: number; abstain: number; total: number }) {
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 2, height: 4, borderRadius: 4, overflow: 'hidden', background: '#232830' }}>
        <div style={{ width: `${pct(approve)}%`, background: '#22C55E', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${pct(abstain)}%`, background: '#F59E0B' }} />
        <div style={{ width: `${pct(reject)}%`, background: '#EF4444' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 10, color: '#6B7280' }}>
        <span style={{ color: '#22C55E' }}>✓ {approve}</span>
        <span style={{ color: '#EF4444' }}>✕ {reject}</span>
        <span style={{ marginLeft: 'auto' }}>{total - approve - reject - abstain} pending</span>
      </div>
    </div>
  );
}

// ── Empty state when user has no companies ────────────────────────────────────

function EmptyState({ userName }: { userName: string }) {
  return (
    <div style={{ padding: '48px 52px', maxWidth: 700 }}>
      <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 8 }}>
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: '#F0F2F5', letterSpacing: '-0.02em', marginBottom: 6 }}>
        {greeting()}, {userName.split(' ')[0]}.
      </h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 40 }}>Let's get your first company workspace set up.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Link href="/companies/new" style={{
          display: 'block', background: '#191D24', border: '1px solid #232830',
          borderRadius: 16, padding: '28px 24px', textDecoration: 'none',
          transition: 'border-color 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#4F7FFF60'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#232830'}
        >
          <div style={{ width: 40, height: 40, background: '#1A2540', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#4F7FFF', marginBottom: 14 }}>⬢</div>
          <p style={{ color: '#F0F2F5', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Create company workspace</p>
          <p style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.6 }}>Set up your company, invite directors, and start managing board resolutions.</p>
        </Link>

        <div style={{ background: '#191D24', border: '1px solid #232830', borderRadius: 16, padding: '28px 24px', opacity: 0.6 }}>
          <div style={{ width: 40, height: 40, background: '#261A05', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#F59E0B', marginBottom: 14 }}>✉</div>
          <p style={{ color: '#F0F2F5', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Accept an invitation</p>
          <p style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.6 }}>Check your email for a board invitation link from your company admin.</p>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, token } = useRequireAuth();

  const [company,     setCompany]     = useState<CompanyWithMeta | null>(null);
  const [upcoming,    setUpcoming]    = useState<Meeting[]>([]);
  const [actionItems, setActionItems] = useState<Resolution[]>([]);
  const [stats,       setStats]       = useState({ meetings: 0, pending: 0, members: 0, docs: 0 });
  const [loading,     setLoading]     = useState(true);
  const [hasCompany,  setHasCompany]  = useState(true);

  useEffect(() => {
    if (!token) return;
    companiesApi.list(token).then(async list => {
      if (list.length === 0) { setHasCompany(false); setLoading(false); return; }
      const co = list[0];
      setCompany(co);

      const data = await fetchDashboardData(co.id, token);
      setUpcoming(data.upcoming);
      setActionItems(data.votingResolutions);
      setStats({
        meetings: data.totalMeetings,
        pending:  data.pendingVotes,
        members:  data.memberCount,
        docs:     data.documentCount,
      });
    }).finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #232830', borderTopColor: '#4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!hasCompany) return <EmptyState userName={user?.name ?? 'there'} />;

  return (
    <div style={{ padding: '40px 52px', maxWidth: 1100, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36, animation: 'fadeUp 0.35s ease both' }}>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' · '}{company?.name}
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: '#F0F2F5', letterSpacing: '-0.02em', marginBottom: 6 }}>
          {greeting()}, {user?.name?.split(' ')[0]}.
        </h1>
        {actionItems.length > 0 && (
          <p style={{ color: '#6B7280', fontSize: 14 }}>
            {actionItems.length} resolution{actionItems.length !== 1 ? 's' : ''} need your vote.
          </p>
        )}
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        <StatCard label="Meetings"       value={String(stats.meetings)} delta="Total this year"     accent="#4F7FFF" delay={0}   />
        <StatCard label="Pending Votes"  value={String(stats.pending)}  delta="Resolutions open"    accent="#F59E0B" delay={60}  />
        <StatCard label="Directors"      value={String(stats.members)}  delta="Board members"       accent="#22C55E" delay={120} />
        <StatCard label="Signed Docs"    value={String(stats.docs)}     delta="Certified & archived" accent="#A78BFA" delay={180} />
      </div>

      {/* ── Two-column section ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Upcoming meetings */}
        <div style={{
          background: '#191D24', border: '1px solid #232830', borderRadius: 16,
          padding: '22px 24px', animation: 'fadeUp 0.4s ease 240ms both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#F0F2F5' }}>Upcoming Meetings</h2>
            <Link href={`/companies/${company?.id}/meetings`}
              style={{ fontSize: 12, color: '#4F7FFF', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#374151', fontSize: 12 }}>No upcoming meetings.</p>
              <Link href={`/companies/${company?.id}/meetings`}
                style={{ color: '#4F7FFF', fontSize: 12, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                + Schedule one →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map(m => (
                <Link key={m.id}
                  href={`/companies/${company?.id}/meetings/${m.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', background: '#13161B',
                    borderRadius: 10, border: '1px solid #232830',
                    transition: 'border-color 0.2s',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#4F7FFF40'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#232830'}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#F0F2F5', marginBottom: 3 }}>{m.title}</p>
                      <p style={{ fontSize: 11, color: '#6B7280' }}>{formatDate(m.scheduledAt)}</p>
                    </div>
                    <Badge status={m.status.toLowerCase()} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Action required — resolutions open for voting */}
        <div style={{
          background: '#191D24', border: '1px solid #232830', borderRadius: 16,
          padding: '22px 24px', animation: 'fadeUp 0.4s ease 300ms both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#F0F2F5' }}>Action Required</h2>
            {actionItems.length > 0 && (
              <span style={{
                background: '#261A05', color: '#F59E0B', fontSize: 11,
                fontWeight: 700, padding: '2px 10px', borderRadius: 10,
              }}>
                {actionItems.length} pending
              </span>
            )}
          </div>

          {actionItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 20, marginBottom: 8 }}>✓</p>
              <p style={{ color: '#374151', fontSize: 12 }}>You're all caught up.</p>
              <p style={{ color: '#374151', fontSize: 11, marginTop: 4 }}>No resolutions need your vote right now.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {actionItems.map(r => (
                <div key={r.id} style={{
                  padding: '14px 16px',
                  background: '#261A05', border: '1px solid #F59E0B20',
                  borderRadius: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#F0F2F5', marginBottom: 2, lineHeight: 1.4 }}>{r.title}</p>
                    </div>
                    <Link href={`/companies/${company?.id}/meetings/${r.meetingId}`}
                      style={{
                        flexShrink: 0, background: '#F59E0B', color: '#000',
                        padding: '5px 12px', borderRadius: 8,
                        fontSize: 11, fontWeight: 700, textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}>
                      Vote Now
                    </Link>
                  </div>
                  <MiniVoteBar
                    approve={r.tally?.APPROVE ?? 0}
                    reject={r.tally?.REJECT  ?? 0}
                    abstain={r.tally?.ABSTAIN ?? 0}
                    total={r.directorCount ?? 5}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
