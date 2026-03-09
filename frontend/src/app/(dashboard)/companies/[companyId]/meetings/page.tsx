'use client';
// app/(dashboard)/companies/[companyId]/meetings/page.tsx
// Meetings list + create new meeting modal

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { meetings as meetingsApi, type Meeting, type MeetingStatus } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:          { label: 'Draft',          color: '#9CA3AF', bg: '#1F2937' },
  SCHEDULED:      { label: 'Scheduled',      color: '#60A5FA', bg: '#1E3A5F' },
  IN_PROGRESS:    { label: 'In Progress',    color: '#34D399', bg: '#064E3B' },
  VOTING:         { label: 'Voting',         color: '#FBBF24', bg: '#451A03' },
  MINUTES_DRAFT:  { label: 'Minutes Draft',  color: '#A78BFA', bg: '#2E1065' },
  SIGNED:         { label: 'Signed',         color: '#6EE7B7', bg: '#022C22' },
  LOCKED:         { label: 'Locked',         color: '#F87171', bg: '#450A0A' },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#9CA3AF', bg: '#1F2937' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: cfg.color, background: cfg.bg, padding: '3px 10px', borderRadius: 20,
    }}>
      {cfg.label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = getToken();

  const [meetings,  setMeetings]  = useState<Meeting[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showModal, setShowModal] = useState(false);

  // Create form state
  const [title,       setTitle]       = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [description, setDescription] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await meetingsApi.list(companyId, token);
      setMeetings(list);
    } catch {
      setError('Could not load meetings.');
    } finally {
      setLoading(false);
    }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!title.trim() || !scheduledAt) { setCreateErr('Title and date are required.'); return; }
    if (!token) return;
    setCreating(true);
    setCreateErr('');
    try {
      const meeting = await meetingsApi.create(companyId, {
        title: title.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }, token);
      setMeetings(prev => [meeting, ...prev]);
      setShowModal(false);
      setTitle(''); setScheduledAt(''); setDescription('');
    } catch (err: any) {
      setCreateErr(err?.body?.message ?? 'Failed to create meeting.');
    } finally {
      setCreating(false);
    }
  }

  // Group by status bucket
  const upcoming  = meetings.filter(m => ['DRAFT','SCHEDULED'].includes(m.status));
  const active    = meetings.filter(m => ['IN_PROGRESS','VOTING','MINUTES_DRAFT'].includes(m.status));
  const completed = meetings.filter(m => ['SIGNED','LOCKED'].includes(m.status));

  return (
    <div style={{ padding: '32px 36px', maxWidth: 960, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F2F5', margin: 0 }}>Meetings</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} in this workspace
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + New Meeting
        </button>
      </div>

      {error && (
        <div style={{ background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : meetings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6B7280' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>◈</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#9CA3AF', marginBottom: 8 }}>No meetings yet</p>
          <p style={{ fontSize: 13 }}>Schedule your first board meeting to get started.</p>
          <button
            onClick={() => setShowModal(true)}
            style={{ marginTop: 20, background: '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + New Meeting
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <Section title="Active" meetings={active} companyId={companyId} />
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming" meetings={upcoming} companyId={companyId} />
          )}
          {completed.length > 0 && (
            <Section title="Completed" meetings={completed} companyId={companyId} />
          )}
        </>
      )}

      {/* Create Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#191D24', border: '1px solid #232830', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 480 }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F0F2F5', margin: '0 0 6px' }}>New Meeting</h2>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 28px' }}>Schedule a board meeting for this workspace.</p>

            {createErr && (
              <div style={{ background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
                {createErr}
              </div>
            )}

            <label style={labelStyle}>Meeting Title *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Board Meeting"
              style={inputStyle}
              autoFocus
            />

            <label style={labelStyle}>Date & Time *</label>
            <input
              type="datetime-local"
              value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={inputStyle}
            />

            <label style={labelStyle}>Description (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Agenda overview or notes..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, background: '#232830', color: '#9CA3AF', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{ flex: 2, background: creating ? '#374151' : '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: creating ? 'default' : 'pointer' }}
              >
                {creating ? 'Creating…' : 'Create Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section component ─────────────────────────────────────────────────────────

function Section({ title, meetings, companyId }: { title: string; meetings: Meeting[]; companyId: string }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meetings.map(m => (
          <Link
            key={m.id}
            href={`/companies/${companyId}/meetings/${m.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              background: '#13161B', border: '1px solid #232830', borderRadius: 14,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
              transition: 'border-color 0.15s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1A2540', border: '1px solid #2A3A6A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F7FFF', fontSize: 18, flexShrink: 0 }}>
                ◈
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#F0F2F5', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.title}
                </p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0' }}>
                  {fmt(m.scheduledAt)}
                  {m.location && ` · ${m.location}`}
                </p>
              </div>
              <StatusPill status={m.status} />
              <span style={{ color: '#374151', fontSize: 16, flexShrink: 0 }}>›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF',
  marginBottom: 6, marginTop: 16,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#13161B', border: '1px solid #232830', borderRadius: 10,
  padding: '10px 14px', fontSize: 13, color: '#F0F2F5', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};
