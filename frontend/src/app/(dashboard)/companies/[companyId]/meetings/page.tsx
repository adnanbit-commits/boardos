'use client';
// app/(dashboard)/companies/[companyId]/meetings/page.tsx

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { meetings as meetingsApi, type Meeting } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgendaDraft {
  id: string;
  title: string;
  goal: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:               { label: 'Draft',            color: '#9CA3AF', bg: '#1F2937' },
  SCHEDULED:           { label: 'Scheduled',        color: '#60A5FA', bg: '#1E3A5F' },
  IN_PROGRESS:         { label: 'In Progress',      color: '#34D399', bg: '#064E3B' },
  VOTING:              { label: 'Voting',            color: '#FBBF24', bg: '#451A03' },
  MINUTES_DRAFT:       { label: 'Minutes Draft',    color: '#A78BFA', bg: '#2E1065' },
  MINUTES_CIRCULATED:  { label: 'Minutes Circ.',    color: '#C4B5FD', bg: '#2E1065' },
  SIGNED:              { label: 'Signed',            color: '#6EE7B7', bg: '#022C22' },
  LOCKED:              { label: 'Locked',            color: '#F87171', bg: '#450A0A' },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#9CA3AF', bg: '#1F2937' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: cfg.color, background: cfg.bg, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
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

function uid() { return Math.random().toString(36).slice(2); }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = getToken();

  const [meetings,     setMeetings]     = useState<Meeting[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // Create form
  const [title,       setTitle]       = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [agendaItems, setAgendaItems] = useState<AgendaDraft[]>([{ id: uid(), title: '', goal: '' }]);
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setMeetings(await meetingsApi.list(companyId, token)); }
    catch { setError('Could not load meetings.'); }
    finally { setLoading(false); }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  // ── Agenda helpers ──────────────────────────────────────────────────────────
  function addAgendaItem() {
    setAgendaItems(prev => [...prev, { id: uid(), title: '', goal: '' }]);
  }
  function updateAgendaItem(id: string, field: 'title' | 'goal', value: string) {
    setAgendaItems(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }
  function removeAgendaItem(id: string) {
    setAgendaItems(prev => prev.length === 1 ? prev : prev.filter(a => a.id !== id));
  }

  // ── Create meeting ──────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!title.trim() || !scheduledAt) { setCreateErr('Meeting title and date are required.'); return; }
    if (!token) return;
    setCreating(true); setCreateErr('');
    try {
      const meeting = await meetingsApi.create(companyId, {
        title: title.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
      }, token);

      // Post each non-empty agenda item in order
      const validItems = agendaItems.filter(a => a.title.trim());
      for (const item of validItems) {
        await meetingsApi.addAgendaItem(companyId, meeting.id, {
          title: item.title.trim(),
          ...(item.goal.trim() ? { description: item.goal.trim() } : {}),
        }, token);
      }

      setMeetings(prev => [meeting, ...prev]);
      closeModal();
    } catch (err: any) {
      setCreateErr(err?.body?.message ?? 'Failed to create meeting.');
    } finally {
      setCreating(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    setTitle(''); setScheduledAt('');
    setAgendaItems([{ id: uid(), title: '', goal: '' }]);
    setCreateErr('');
  }

  // ── Delete meeting ──────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    try {
      await meetingsApi.remove(companyId, deleteTarget.id, token);
      setMeetings(prev => prev.filter(m => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to delete meeting.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // Group
  const upcoming  = meetings.filter(m => ['DRAFT','SCHEDULED'].includes(m.status));
  const active    = meetings.filter(m => ['IN_PROGRESS','VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED'].includes(m.status));
  const completed = meetings.filter(m => ['SIGNED','LOCKED'].includes(m.status));

  return (
    <div style={{ padding: '32px 36px', maxWidth: 960, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .agenda-card { animation: fadeIn 0.2s ease; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F2F5', margin: 0 }}>Meetings</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} in this workspace
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={primaryBtn}>+ New Meeting</button>
      </div>

      {error && (
        <div style={{ background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #232830', borderTop: '2px solid #4F7FFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : meetings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6B7280' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>◈</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#9CA3AF', marginBottom: 8 }}>No meetings yet</p>
          <p style={{ fontSize: 13 }}>Schedule your first board meeting to get started.</p>
          <button onClick={() => setShowModal(true)} style={{ ...primaryBtn, marginTop: 20 }}>+ New Meeting</button>
        </div>
      ) : (
        <>
          {active.length > 0 && <Section title="Active" meetings={active} companyId={companyId} onDelete={setDeleteTarget} />}
          {upcoming.length > 0 && <Section title="Upcoming" meetings={upcoming} companyId={companyId} onDelete={setDeleteTarget} />}
          {completed.length > 0 && <Section title="Completed" meetings={completed} companyId={companyId} onDelete={setDeleteTarget} />}
        </>
      )}

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {showModal && (
        <div onClick={closeModal} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#191D24', border: '1px solid #232830', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Modal header */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid #1a1e26' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px' }}>New Meeting</h2>
              <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>Schedule a board meeting and set the agenda.</p>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
              {createErr && (
                <div style={{ background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
                  {createErr}
                </div>
              )}

              {/* Meeting details */}
              <label style={labelStyle}>Meeting Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q1 2026 Board Meeting" style={inputStyle} autoFocus />

              <label style={{ ...labelStyle, marginTop: 16 }}>Date & Time *</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inputStyle} />

              {/* Agenda Builder */}
              <div style={{ marginTop: 28, marginBottom: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
                  Agenda Items
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {agendaItems.map((item, idx) => (
                    <div key={item.id} className="agenda-card" style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Card header bar */}
                      <div style={{ background: '#1a1e26', borderBottom: '1px solid #232830', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Agenda {idx + 1}
                        </span>
                        {agendaItems.length > 1 && (
                          <button
                            onClick={() => removeAgendaItem(item.id)}
                            style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                            title="Remove this item"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Card body */}
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={item.title}
                          onChange={e => updateAgendaItem(item.id, 'title', e.target.value)}
                          placeholder="e.g. Financial Review (20 mins)"
                          style={{ ...inputStyle, fontSize: 14, fontWeight: 600, padding: '9px 12px' }}
                        />
                        <textarea
                          value={item.goal}
                          onChange={e => updateAgendaItem(item.id, 'goal', e.target.value)}
                          placeholder="Goal / details (optional) — e.g. Discussion of budget vs. actuals and runway extension strategies."
                          rows={2}
                          style={{ ...inputStyle, fontSize: 12, color: '#9CA3AF', resize: 'vertical', padding: '8px 12px' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addAgendaItem}
                  style={{ marginTop: 10, background: 'none', border: '1px dashed #2A3040', borderRadius: 10, color: '#4F7FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '9px 0', width: '100%', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#4F7FFF')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A3040')}
                >
                  + Add Agenda Item
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '16px 32px 24px', borderTop: '1px solid #1a1e26', display: 'flex', gap: 10 }}>
              <button onClick={closeModal} style={ghostBtn}>Cancel</button>
              <button onClick={handleCreate} disabled={creating} style={{ ...primaryBtn, flex: 2, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating…' : 'Create Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#191D24', border: '1px solid #3B1A1A', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 400 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F0F2F5', margin: '0 0 8px' }}>Delete meeting?</h3>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 20px', lineHeight: 1.5 }}>
              <strong style={{ color: '#F0F2F5' }}>{deleteTarget.title}</strong> and all its agenda items will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={ghostBtn}>Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ flex: 1, background: deleting ? '#374151' : '#7F1D1D', color: '#FCA5A5', border: '1px solid #991B1B', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Delete Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, meetings, companyId, onDelete }: {
  title: string; meetings: Meeting[]; companyId: string; onDelete: (m: Meeting) => void;
}) {
  const canDelete = (m: Meeting) => ['DRAFT', 'SCHEDULED'].includes(m.status);
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meetings.map(m => (
          <div key={m.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Link href={`/companies/${companyId}/meetings/${m.id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
              <div
                style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1A2540', border: '1px solid #2A3A6A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F7FFF', fontSize: 18, flexShrink: 0 }}>◈</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#F0F2F5', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</p>
                  <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0' }}>{fmt(m.scheduledAt)}{(m as any).location && ` · ${(m as any).location}`}</p>
                </div>
                <StatusPill status={m.status} />
                <span style={{ color: '#374151', fontSize: 16, flexShrink: 0 }}>›</span>
              </div>
            </Link>

            {/* Delete button — only for DRAFT / SCHEDULED */}
            {canDelete(m) && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(m); }}
                title="Delete meeting"
                style={{ marginLeft: 8, flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid #232830', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#3B1A1A'; e.currentTarget.style.borderColor = '#7F1D1D'; e.currentTarget.style.color = '#FCA5A5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#232830'; e.currentTarget.style.color = '#4B5563'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0D0F12', border: '1px solid #232830', borderRadius: 10,
  padding: '10px 14px', fontSize: 13, color: '#F0F2F5', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const primaryBtn: React.CSSProperties = {
  background: '#4F7FFF', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  flex: 1, background: '#232830', color: '#9CA3AF', border: 'none', borderRadius: 10,
  padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
};
