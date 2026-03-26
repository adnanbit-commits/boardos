'use client';
// app/(dashboard)/companies/[companyId]/circular-resolutions/page.tsx
// Section 175 Companies Act 2013 — Resolutions by Circulation

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { circular as circularApi, type CircularResolution } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:    { bg: '#EBE6DF', text: '#96908A', label: 'Draft' },
  PROPOSED: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Open for Signatures' },
  APPROVED: { bg: '#F0FDF4', text: '#166534', label: 'Approved' },
  REJECTED: { bg: 'rgba(139,26,26,0.07)', text: '#EF4444', label: 'Rejected' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 700,
      padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {s.label}
    </span>
  );
}

function daysLeft(deadline: string | null): string {
  if (!deadline) return '';
  const d = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (d < 0) return 'Deadline passed';
  if (d === 0) return 'Due today';
  return `${d} day${d !== 1 ? 's' : ''} left`;
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateModal({ companyId, onClose, onCreated }: {
  companyId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle]           = useState('');
  const [text, setText]             = useState('');
  const [note, setNote]             = useState('');
  const [deadline, setDeadline]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const token = getToken()!;

  // Default deadline 7 days from today
  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  async function handleSubmit() {
    if (!title.trim() || !text.trim()) { setError('Title and resolution text are required.'); return; }
    if (!note.trim()) { setError('A covering note is required before the resolution can be circulated — SS-1 compliance.'); return; }
    setSubmitting(true); setError('');
    try {
      await circularApi.create(companyId, {
        title: title.trim(),
        text: text.trim(),
        circulationNote: note.trim() || undefined,
        deadline: deadline || defaultDeadline,
      }, token);
      onCreated();
    } catch (err: any) {
      setError(err?.body?.message ?? 'Failed to create resolution.');
    } finally { setSubmitting(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(35,31,27,0.45)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:50, padding:24 }}>
      <div style={{ width:'100%', maxWidth:600, background:'#FDFCFB', border:'1px solid #E0DAD2',
        borderRadius:20, padding:'36px', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h2 style={{ fontSize:18, fontWeight:700, color:'#231F1B', margin:0 }}>
            New Circular Resolution
          </h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#96908A', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
              Resolution Title *
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Appointment of Additional Director"
              style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:10,
                padding:'10px 14px', color:'#231F1B', fontSize:14, outline:'none', boxSizing:'border-box' }} />
          </div>

          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
              Resolution Text * <span style={{ color:'#96908A', textTransform:'none', fontWeight:400 }}>(legal text)</span>
            </label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
              placeholder="RESOLVED THAT pursuant to the provisions of Section 161 of the Companies Act, 2013..."
              style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:10,
                padding:'10px 14px', color:'#231F1B', fontSize:13, outline:'none', boxSizing:'border-box',
                resize:'vertical', fontFamily:'monospace', lineHeight:1.6 }} />
          </div>

          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
              Covering Note * <span style={{ color:'#EF4444', textTransform:'none', fontWeight:400 }}>(required — SS-1 compliance)</span>
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Please find attached a resolution by circulation for your consideration..."
              style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:10,
                padding:'10px 14px', color:'#231F1B', fontSize:13, outline:'none', boxSizing:'border-box', resize:'vertical' }} />
          </div>

          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
              Deadline <span style={{ color:'#F59E0B', textTransform:'none', fontWeight:400 }}>(max 7 days — SS-1)</span>
            </label>
            <input type="date" value={deadline || defaultDeadline}
              onChange={e => setDeadline(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              style={{ background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:10,
                padding:'10px 14px', color:'#231F1B', fontSize:14, outline:'none' }} />
          </div>

          {error && <p style={{ color:'#EF4444', fontSize:13, background:'rgba(139,26,26,0.07)', padding:'10px 14px', borderRadius:8 }}>{error}</p>}

          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid #E0DAD2',
                borderRadius:10, color:'#96908A', fontSize:14, cursor:'pointer' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ flex:2, padding:'11px', background:'#8B1A1A', border:'none', borderRadius:10,
                color:'#fff', fontSize:14, fontWeight:600, cursor:submitting?'not-allowed':'pointer',
                opacity:submitting?0.6:1 }}>
              {submitting ? 'Creating…' : 'Save as Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resolution Card ───────────────────────────────────────────────────────────

function ResolutionCard({ res, companyId, currentUserId, onRefresh }: {
  res: CircularResolution; companyId: string; currentUserId: string; onRefresh: () => void;
}) {
  const token      = getToken()!;
  const [expanded, setExpanded]   = useState(false);
  const [signing,  setSigning]    = useState(false);
  const [editing,  setEditing]    = useState(false);
  const [remarks,  setRemarks]    = useState('');
  const [loading,  setLoading]    = useState(false);
  const [editTitle, setEditTitle] = useState(res.title);
  const [editText,  setEditText]  = useState(res.motionText);
  const [editNote,  setEditNote]  = useState(res.circulationNote ?? '');

  const mySignature   = res.signatures.find(s => s.userId === currentUserId);
  const forCount      = res.signatures.filter(s => s.value === 'FOR').length;
  const objectCount   = res.signatures.filter(s => s.value === 'OBJECT').length;
  const totalSigned   = res.signatures.length;
  const canSign       = res.status === 'PROPOSED' && (!res.deadline || new Date(res.deadline) > new Date());

  async function handleSign(value: 'FOR' | 'OBJECT') {
    setLoading(true);
    try {
      await circularApi.sign(companyId, res.id, { value, remarks: remarks.trim() || undefined }, token);
      onRefresh();
      setSigning(false);
    } catch {}
    setLoading(false);
  }

  async function handleCirculate() {
    setLoading(true);
    try {
      await circularApi.circulate(companyId, res.id, token);
      onRefresh();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to circulate resolution.');
    }
    setLoading(false);
  }

  async function handleRequestMeeting() {
    setLoading(true);
    try {
      const result = await circularApi.requestMeeting(companyId, res.id, token);
      alert(result.message);
      onRefresh();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to submit meeting request.');
    }
    setLoading(false);
  }

  async function handleSaveEdit() {
    if (!editTitle.trim() || !editText.trim() || !editNote.trim()) {
      alert('Title, resolution text, and covering note are all required.');
      return;
    }
    setLoading(true);
    try {
      await circularApi.update(companyId, res.id, {
        title: editTitle.trim(),
        text: editText.trim(),
        circulationNote: editNote.trim(),
      }, token);
      onRefresh();
      setEditing(false);
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to save changes.');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${res.title}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await circularApi.remove(companyId, res.id, token);
      onRefresh();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to delete resolution.');
    }
    setLoading(false);
  }

  return (
    <div style={{ background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:16, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'20px 24px', cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
              <StatusBadge status={res.status} />
              {res.serialNumber && (
                <span style={{ fontSize:11, color:'#96908A', fontWeight:600, fontFamily:'monospace' }}>
                  {res.serialNumber}
                </span>
              )}
              {res.deadline && res.status === 'PROPOSED' && (
                <span style={{ fontSize:11, color: new Date(res.deadline) < new Date() ? '#EF4444' : '#F59E0B',
                  fontWeight:600 }}>
                  {daysLeft(res.deadline)}
                </span>
              )}
              {res.status === 'APPROVED' && !res.notedAtMeetingId && (
                <span style={{ fontSize:11, color:'#F59E0B', fontWeight:600, background:'rgba(245,158,11,0.1)',
                  padding:'2px 8px', borderRadius:4 }}>
                  Pending noting at next board meeting
                </span>
              )}
              {res.status === 'APPROVED' && res.notedAtMeetingId && (
                <span style={{ fontSize:11, color:'#166534', fontWeight:600 }}>
                  Noted at meeting
                </span>
              )}
            </div>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#231F1B', margin:'0 0 4px' }}>{res.title}</h3>
            {res.circulationNote && (
              <p style={{ fontSize:12, color:'#96908A', margin:0, lineHeight:1.5 }}
                className="line-clamp-2">{res.circulationNote}</p>
            )}
          </div>
          <span style={{ color:'#96908A', fontSize:18, marginTop:2 }}>{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Signature progress */}
        {totalSigned > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:12 }}>
            <div style={{ flex:1, height:4, background:'#E0DAD2', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(forCount / Math.max(totalSigned, 1)) * 100}%`,
                background:'#22C55E', borderRadius:4, transition:'width 0.3s' }} />
            </div>
            <span style={{ fontSize:12, color:'#96908A', whiteSpace:'nowrap' }}>
              {forCount} For · {objectCount} Object · {totalSigned} signed
            </span>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop:'1px solid #E0DAD2', padding:'20px 24px' }}>
          {/* Resolution text */}
          <div style={{ background:'#FDFCFB', borderRadius:10, padding:'16px', marginBottom:20 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase',
              letterSpacing:'0.06em', marginBottom:8 }}>Resolution Text</p>
            <p style={{ fontSize:13, color:'#231F1B', lineHeight:1.8, margin:0, fontFamily:'monospace',
              whiteSpace:'pre-wrap' }}>{res.resolutionText || res.motionText}</p>
          </div>

          {/* Signatures */}
          {res.signatures.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:'#96908A', textTransform:'uppercase',
                letterSpacing:'0.06em', marginBottom:12 }}>Signatures ({res.signatures.length})</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {res.signatures.map(sig => (
                  <div key={sig.id} style={{ display:'flex', alignItems:'center', gap:12,
                    padding:'10px 14px', background:'#FDFCFB', borderRadius:10,
                    border:`1px solid ${sig.value === 'FOR' ? '#166534' : '#7F1D1D'}` }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'#EBE6DF',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight:700, color:'#8B1A1A', flexShrink:0 }}>
                      {sig.user.name[0]}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:600, color:'#231F1B', margin:0 }}>{sig.user.name}</p>
                      {sig.remarks && <p style={{ fontSize:11, color:'#96908A', margin:'2px 0 0' }}>{sig.remarks}</p>}
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                      background: sig.value === 'FOR' ? '#052e16' : 'rgba(139,26,26,0.07)',
                      color: sig.value === 'FOR' ? '#22C55E' : '#EF4444',
                      textTransform:'uppercase' }}>
                      {sig.value}
                    </span>
                    <span style={{ fontSize:11, color:'#96908A' }}>
                      {new Date(sig.signedAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {res.status === 'DRAFT' && (
              <button onClick={handleCirculate} disabled={loading}
                style={{ padding:'9px 18px', background:'#8B1A1A', border:'none', borderRadius:10,
                  color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {loading ? '…' : '📨 Circulate to Directors'}
              </button>
            )}
            {res.status === 'DRAFT' && (
              <button onClick={() => { setEditing(e => !e); setExpanded(true); }}
                style={{ padding:'9px 18px', background:'transparent', border:'1px solid #374151',
                  borderRadius:10, color:'#96908A', fontSize:13, cursor:'pointer' }}>
                ✏️ Edit
              </button>
            )}
            {res.status === 'DRAFT' && (
              <button onClick={handleDelete} disabled={loading}
                style={{ padding:'9px 18px', background:'transparent', border:'1px solid #7F1D1D',
                  borderRadius:10, color:'#EF4444', fontSize:13, cursor:'pointer' }}>
                Delete
              </button>
            )}

            {canSign && !signing && (
              <button onClick={() => setSigning(true)}
                style={{ padding:'9px 18px', background:'#EBE6DF', border:'1px solid #2A3A6A',
                  borderRadius:10, color:'#1D4ED8', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                ✍️ {mySignature ? 'Change Signature' : 'Sign / Object'}
              </button>
            )}

            {canSign && (
              <button onClick={handleRequestMeeting} disabled={loading}
                style={{ padding:'9px 18px', background:'transparent', border:'1px solid #374151',
                  borderRadius:10, color:'#96908A', fontSize:13, cursor:'pointer' }}>
                Request Meeting
              </button>
            )}
          </div>

          {/* Sign panel */}
          {signing && canSign && (
            <div style={{ marginTop:16, background:'#FDFCFB', border:'1px solid #E0DAD2',
              borderRadius:12, padding:'20px' }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#231F1B', marginBottom:12 }}>
                Your signature {mySignature ? `(currently: ${mySignature.value})` : ''}
              </p>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                placeholder="Remarks (optional)" rows={2}
                style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:8,
                  padding:'8px 12px', color:'#231F1B', fontSize:13, outline:'none',
                  boxSizing:'border-box', resize:'none', marginBottom:12 }} />
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => handleSign('FOR')} disabled={loading}
                  style={{ flex:1, padding:'10px', background:'#F0FDF4', border:'1px solid #166534',
                    borderRadius:10, color:'#166534', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  ✓ Sign For
                </button>
                <button onClick={() => handleSign('OBJECT')} disabled={loading}
                  style={{ flex:1, padding:'10px', background:'rgba(139,26,26,0.07)', border:'1px solid #7F1D1D',
                    borderRadius:10, color:'#EF4444', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  ✗ Object
                </button>
                <button onClick={() => setSigning(false)}
                  style={{ padding:'10px 16px', background:'transparent', border:'1px solid #E0DAD2',
                    borderRadius:10, color:'#96908A', fontSize:13, cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {/* Edit form — DRAFT only */}
          {editing && res.status === 'DRAFT' && (
            <div style={{ marginTop:16, background:'#FDFCFB', border:'1px solid #374151',
              borderRadius:12, padding:'20px' }}>
              <p style={{ fontSize:13, fontWeight:600, color:'#231F1B', marginBottom:16 }}>Edit Draft</p>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A',
                    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Title *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:8,
                      padding:'8px 12px', color:'#231F1B', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A',
                    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Resolution Text *</label>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={5}
                    style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:8,
                      padding:'8px 12px', color:'#231F1B', fontSize:13, outline:'none',
                      boxSizing:'border-box', resize:'vertical', fontFamily:'monospace' }} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#96908A',
                    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Covering Note *</label>
                  <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
                    style={{ width:'100%', background:'#FDFCFB', border:'1px solid #E0DAD2', borderRadius:8,
                      padding:'8px 12px', color:'#231F1B', fontSize:13, outline:'none',
                      boxSizing:'border-box', resize:'vertical' }} />
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={handleSaveEdit} disabled={loading}
                    style={{ padding:'9px 20px', background:'#8B1A1A', border:'none', borderRadius:8,
                      color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    {loading ? '…' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(false)}
                    style={{ padding:'9px 16px', background:'transparent', border:'1px solid #E0DAD2',
                      borderRadius:8, color:'#96908A', fontSize:13, cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CircularResolutionsPage() {
  const params     = useParams();
  const companyId  = params.companyId as string;
  const token      = getToken();
  const user       = getUser();

  const [resolutions, setResolutions] = useState<CircularResolution[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await circularApi.list(companyId, token);
      setResolutions(data);
    } catch {}
    setLoading(false);
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  const draft    = resolutions.filter(r => r.status === 'DRAFT');
  const open     = resolutions.filter(r => r.status === 'PROPOSED');
  const closed   = resolutions.filter(r => ['APPROVED', 'REJECTED'].includes(r.status));

  return (
    <div style={{ padding:'32px 40px', fontFamily:"'Instrument Sans',system-ui,sans-serif", maxWidth:900 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap');
        textarea::placeholder,input::placeholder{color:#96908A} textarea:focus,input:focus{border-color:#8B1A1A!important}`}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:32 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#231F1B', margin:'0 0 6px' }}>
            Circular Resolutions
          </h1>
          <p style={{ fontSize:13, color:'#96908A', margin:0 }}>
            Section 175, Companies Act 2013 — Resolutions passed without a board meeting
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ padding:'10px 20px', background:'#8B1A1A', border:'none', borderRadius:10,
            color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
          + New Resolution
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background:'#EBE6DF', border:'1px solid #2A3A6A', borderRadius:12,
        padding:'14px 18px', marginBottom:32, fontSize:13, color:'#93C5FD', lineHeight:1.6 }}>
        ℹ️ A resolution by circulation is passed when a majority of directors entitled to vote give their
        consent in writing. Once circulated, directors have until the deadline to sign. Any director may
        request the matter be taken up at a board meeting instead.
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#96908A' }}>
          <div style={{ width:28, height:28, border:'2px solid #E0DAD2', borderTop:'2px solid #8B1A1A',
            borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          Loading…
        </div>
      ) : resolutions.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 0', color:'#96908A' }}>
          <p style={{ fontSize:48, margin:'0 0 16px' }}>📋</p>
          <p style={{ fontSize:16, fontWeight:600, color:'#96908A', margin:'0 0 8px' }}>No circular resolutions yet</p>
          <p style={{ fontSize:13, margin:'0 0 24px' }}>Create one to pass resolutions without calling a board meeting</p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding:'10px 24px', background:'#8B1A1A', border:'none', borderRadius:10,
              color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Create First Resolution
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
          {open.length > 0 && (
            <div>
              <h2 style={{ fontSize:13, fontWeight:700, color:'#1D4ED8', textTransform:'uppercase',
                letterSpacing:'0.08em', marginBottom:12 }}>Open for Signatures ({open.length})</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {open.map(r => <ResolutionCard key={r.id} res={r} companyId={companyId}
                  currentUserId={user?.id ?? ''} onRefresh={load} />)}
              </div>
            </div>
          )}
          {draft.length > 0 && (
            <div>
              <h2 style={{ fontSize:13, fontWeight:700, color:'#96908A', textTransform:'uppercase',
                letterSpacing:'0.08em', marginBottom:12 }}>Drafts ({draft.length})</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {draft.map(r => <ResolutionCard key={r.id} res={r} companyId={companyId}
                  currentUserId={user?.id ?? ''} onRefresh={load} />)}
              </div>
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <h2 style={{ fontSize:13, fontWeight:700, color:'#96908A', textTransform:'uppercase',
                letterSpacing:'0.08em', marginBottom:12 }}>Closed ({closed.length})</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {closed.map(r => <ResolutionCard key={r.id} res={r} companyId={companyId}
                  currentUserId={user?.id ?? ''} onRefresh={load} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal companyId={companyId} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
