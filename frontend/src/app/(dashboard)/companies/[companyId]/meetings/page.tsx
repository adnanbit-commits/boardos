'use client';
// app/(dashboard)/companies/[companyId]/meetings/page.tsx

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  meetings as meetingsApi,
  resolutions as resApi,
  meetingTemplates as templatesApi,
  companies as companiesApi,
  type Meeting,
  type MeetingTemplate,
} from '@/lib/api';
import {
  SYSTEM_TEMPLATES,
  filterAgendaForCompany,
  substituteTemplateVars,
  type TemplateAgendaItem,
} from '@/lib/meeting-templates';
import { getToken } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgendaDraft { id: string; title: string; goal: string; }
type CreateStep = 'pick' | 'form';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:              { label: 'Draft',           color: '#9CA3AF', bg: '#1F2937' },
  SCHEDULED:          { label: 'Scheduled',       color: '#60A5FA', bg: '#1E3A5F' },
  IN_PROGRESS:        { label: 'In Progress',     color: '#34D399', bg: '#064E3B' },
  VOTING:             { label: 'Voting',           color: '#FBBF24', bg: '#451A03' },
  MINUTES_DRAFT:      { label: 'Minutes Draft',   color: '#A78BFA', bg: '#2E1065' },
  MINUTES_CIRCULATED: { label: 'Minutes Circ.',   color: '#C4B5FD', bg: '#2E1065' },
  SIGNED:             { label: 'Signed',           color: '#6EE7B7', bg: '#022C22' },
  LOCKED:             { label: 'Locked',           color: '#F87171', bg: '#450A0A' },
};

const CAT_COLOR: Record<string, string> = {
  BOARD: '#60A5FA', AGM: '#34D399', EGM: '#FBBF24', COMMITTEE: '#A78BFA',
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#9CA3AF', bg: '#1F2937' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: cfg.color, background: cfg.bg, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
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
  const [customTpls,   setCustomTpls]   = useState<MeetingTemplate[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // Modal step
  const [createStep,     setCreateStep]     = useState<CreateStep>('pick');
  const [selectedTplId,  setSelectedTplId]  = useState<string | null>(null);

  // Create form
  const [title,       setTitle]       = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [agendaItems, setAgendaItems] = useState<AgendaDraft[]>([{ id: uid(), title: '', goal: '' }]);
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState('');

  // Company context — needed to filter template items (first meeting done, FY state)
  const [companyData,  setCompanyData]  = useState<any>(null);
  const [memberList,   setMemberList]   = useState<any[]>([]);
  // First-meeting checkbox shown in step 2
  const [isFirstMtg,   setIsFirstMtg]   = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [mtgs, tpls, company, members] = await Promise.all([
        meetingsApi.list(companyId, token),
        templatesApi.list(companyId, token).catch(() => [] as MeetingTemplate[]),
        companiesApi.findOne(companyId, token).catch(() => null),
        companiesApi.listMembers(companyId, token).catch(() => []),
      ]);
      setMeetings(mtgs);
      setCustomTpls(tpls);
      setCompanyData(company);
      setMemberList(members);
      // Auto-detect first meeting: no locked first meeting on company record
      if (company && !(company as any).firstBoardMeetingLockedId) {
        setIsFirstMtg(true);
      }
    } catch { setError('Could not load meetings.'); }
    finally { setLoading(false); }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  // ── Template picker ─────────────────────────────────────────────────────────
  function applyTemplate(items: TemplateAgendaItem[] | { title: string; description?: string }[], tplId?: string) {
    // Rich TemplateAgendaItem[] from system templates — use title + legalBasis as goal
    if (items.length > 0 && 'itemType' in items[0]) {
      const richItems = items as TemplateAgendaItem[];
      setAgendaItems(richItems.map(a => ({
        id:    uid(),
        title: a.title,
        goal:  a.legalBasis ?? '',
      })));
    } else {
      // Flat items from custom templates
      setAgendaItems((items as { title: string; description?: string }[])
        .map(a => ({ id: uid(), title: a.title, goal: a.description ?? '' })));
    }
    setSelectedTplId(tplId ?? null);
    setCreateStep('form');
  }

  function applySystemTemplate(tpl: typeof SYSTEM_TEMPLATES[0]) {
    const isFirstMeetingDone = !!(companyData as any)?.firstBoardMeetingLockedId;
    // TODO: derive isFirstMeetingOfFY from last noted DIR-8/MBP-1 meeting
    const filtered = filterAgendaForCompany(tpl, {
      isFirstMeetingDone,
      isFirstMeetingOfFY: true, // conservative — always show at apply time, gate at meeting time
    });
    applyTemplate(filtered, tpl.id);
    // Auto-set first meeting flag if this is the first board meeting template
    if (tpl.id === 'sys_first_board' && !isFirstMeetingDone) {
      setIsFirstMtg(true);
    }
  }

  function startBlank() {
    setAgendaItems([{ id: uid(), title: '', goal: '' }]);
    setSelectedTplId(null);
    setCreateStep('form');
  }

  // ── Agenda helpers ──────────────────────────────────────────────────────────
  function addAgendaItem() { setAgendaItems(prev => [...prev, { id: uid(), title: '', goal: '' }]); }
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

      // Mark as first meeting if flagged
      if (isFirstMtg) {
        await meetingsApi.markAsFirstMeeting(companyId, meeting.id, token).catch(() => {});
      }

      // Find the matching system template for work item creation
      const sysTpl = selectedTplId?.startsWith('sys_')
        ? SYSTEM_TEMPLATES.find(t => t.id === selectedTplId)
        : null;

      // Template vars for substitution
      const templateVars: Record<string, string> = {
        company_name:      (companyData as any)?.name ?? '',
        cin:               (companyData as any)?.cin  ?? '',
        registered_address:(companyData as any)?.registeredAt ?? '',
        roc_city:          (companyData as any)?.registeredAt ?? '',
        date:              new Date(scheduledAt).toLocaleDateString('en-IN'),
      };

      const directors = memberList.filter((m: any) =>
        ['DIRECTOR', 'COMPANY_SECRETARY'].includes(m.role)
      );

      const validItems = agendaItems.filter(a => a.title.trim());
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];

        // Find matching template agenda item by order index
        const tplItem = sysTpl?.agendaItems.find(t => t.title === item.title);

        const agendaItem = await meetingsApi.addAgendaItem(companyId, meeting.id, {
          title:       item.title.trim(),
          description: item.goal.trim() || undefined,
          ...(tplItem ? {
            itemType:    tplItem.itemType,
            legalBasis:  tplItem.legalBasis,
            guidanceNote:tplItem.guidanceNote,
          } : {}),
        }, token);

        if (!tplItem || !tplItem.workItems.length) continue;

        // Create pre-filled resolutions/noting items for each work item
        for (const wi of tplItem.workItems) {
          if (wi.type === 'SYSTEM_ACTION') continue; // handled at runtime, not pre-created

          if (wi.isDynamic) {
            // One resolution per director
            for (const member of directors) {
              const vars = { ...templateVars, director_name: member.user?.name ?? member.name ?? '' };
              await resApi.create(companyId, meeting.id, {
                title:       substituteTemplateVars(wi.title, vars),
                text:        substituteTemplateVars(wi.textTemplate, vars),
                type:        'NOTING',
                agendaItemId:agendaItem.id,
              }, token).catch(() => {});
            }
          } else {
            // Single resolution for this work item
            const resType = wi.type === 'RESOLUTION_VOTING' ? 'MEETING' : 'NOTING';
            await resApi.create(companyId, meeting.id, {
              title:       substituteTemplateVars(wi.title, templateVars),
              text:        substituteTemplateVars(wi.textTemplate, templateVars),
              type:        resType as 'MEETING' | 'NOTING',
              agendaItemId:agendaItem.id,
            }, token).catch(() => {});
          }
        }
      }

      // Record template usage
      if (selectedTplId && !selectedTplId.startsWith('sys_')) {
        await templatesApi.recordUsage(companyId, selectedTplId, token).catch(() => {});
      }

      setMeetings(prev => [meeting, ...prev]);
      closeModal();
    } catch (err: any) {
      setCreateErr(err?.body?.message ?? 'Failed to create meeting.');
    } finally { setCreating(false); }
  }

  function closeModal() {
    setShowModal(false);
    setCreateStep('pick');
    setSelectedTplId(null);
    setTitle(''); setScheduledAt('');
    setAgendaItems([{ id: uid(), title: '', goal: '' }]);
    setCreateErr('');
  }

  function openModal() { setCreateStep('pick'); setShowModal(true); }

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
    } finally { setDeleting(false); }
  }

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
        .tpl-card:hover { border-color: #374151 !important; }
        .tpl-card-selected { border-color: #4F7FFF !important; background: rgba(79,127,255,0.08) !important; }
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
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href={`/companies/${companyId}/templates`}
            style={{ ...ghostBtnLink, fontSize: 13, fontWeight: 600 }}>
            ◈ Templates
          </Link>
          <button onClick={openModal} style={primaryBtn}>+ New Meeting</button>
        </div>
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
          <button onClick={openModal} style={{ ...primaryBtn, marginTop: 20 }}>+ New Meeting</button>
        </div>
      ) : (
        <>
          {active.length > 0   && <Section title="Active"    meetings={active}    companyId={companyId} onDelete={setDeleteTarget} />}
          {upcoming.length > 0 && <Section title="Upcoming"  meetings={upcoming}  companyId={companyId} onDelete={setDeleteTarget} />}
          {completed.length > 0 && <Section title="Completed" meetings={completed} companyId={companyId} onDelete={setDeleteTarget} />}
        </>
      )}

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {showModal && (
        <div onClick={closeModal} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#191D24', border: '1px solid #232830', borderRadius: 20,
            width: '100%',
            maxWidth: createStep === 'pick' ? 780 : 560,
            maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            transition: 'max-width 0.2s ease',
          }}>

            {/* Modal header */}
            <div style={{ padding: '24px 32px 18px', borderBottom: '1px solid #1a1e26', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {createStep === 'form' && (
                  <button onClick={() => setCreateStep('pick')}
                    style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 6, display: 'block' }}>
                    ← Back to templates
                  </button>
                )}
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F0F2F5', margin: '0 0 2px' }}>
                  {createStep === 'pick' ? 'Choose a Template' : 'Meeting Details'}
                </h2>
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                  {createStep === 'pick'
                    ? 'Start from a system template, a saved template, or a blank meeting.'
                    : 'Set the title, date, and finalise your agenda before scheduling.'}
                </p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px 24px' }}>

              {/* ── STEP 1: Template Picker ── */}
              {createStep === 'pick' && (
                <div>
                  {/* System templates */}
                  <p style={sectionLabelStyle}>System Templates</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                    {SYSTEM_TEMPLATES.map(tpl => (
                      <button key={tpl.id} className="tpl-card"
                        onClick={() => applySystemTemplate(tpl)}
                        style={{
                          background: '#13161B', border: '1px solid #232830', borderRadius: 12,
                          padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: CAT_COLOR[tpl.category] ?? '#9CA3AF',
                            background: `${CAT_COLOR[tpl.category]}18`, border: `1px solid ${CAT_COLOR[tpl.category]}40`,
                            padding: '1px 7px', borderRadius: 20 }}>
                            {tpl.category}
                          </span>
                          <span style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>{tpl.agendaItems.length} items</span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px' }}>{tpl.name}</p>
                        <p style={{ fontSize: 11, color: '#6B7280', margin: 0, lineHeight: 1.5,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {tpl.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Custom templates */}
                  {customTpls.length > 0 && (
                    <>
                      <p style={sectionLabelStyle}>Your Templates</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                        {customTpls.map(tpl => (
                          <button key={tpl.id} className="tpl-card"
                            onClick={() => applyTemplate(tpl.agendaItems as any[], tpl.id)}
                            style={{
                              background: '#13161B', border: '1px solid #232830', borderRadius: 12,
                              padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                color: CAT_COLOR[tpl.category] ?? '#F87171',
                                background: `${CAT_COLOR[tpl.category] ?? '#F87171'}18`,
                                border: `1px solid ${CAT_COLOR[tpl.category] ?? '#F87171'}40`,
                                padding: '1px 7px', borderRadius: 20 }}>
                                {tpl.category}
                              </span>
                              <span style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>
                                {(tpl.agendaItems as any[]).length} items
                              </span>
                              {tpl.usageCount > 0 && (
                                <span style={{ fontSize: 10, color: '#374151', marginLeft: 'auto' }}>Used {tpl.usageCount}×</span>
                              )}
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', margin: '0 0 4px' }}>{tpl.name}</p>
                            {tpl.description && (
                              <p style={{ fontSize: 11, color: '#6B7280', margin: 0, lineHeight: 1.5,
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {tpl.description}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Blank option */}
                  <button onClick={startBlank} style={{
                    width: '100%', background: 'transparent', border: '1px dashed #2A3040',
                    borderRadius: 12, padding: '14px 0', color: '#6B7280', fontSize: 13,
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#9CA3AF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A3040'; e.currentTarget.style.color = '#6B7280'; }}>
                    Start with a blank meeting →
                  </button>
                </div>
              )}

              {/* ── STEP 2: Meeting Details Form ── */}
              {createStep === 'form' && (
                <div>
                  {createErr && (
                    <div style={{ background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
                      {createErr}
                    </div>
                  )}

                  <label style={labelStyle}>Meeting Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Q1 2026 Board Meeting" style={inputStyle} autoFocus />

                  <label style={{ ...labelStyle, marginTop: 16 }}>Date & Time *</label>
                  <input type="datetime-local" value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)} style={inputStyle} />

                  {/* First meeting flag */}
                  {!companyData?.firstBoardMeetingLockedId && (
                    <div style={{ background: '#13161B', border: '1px solid #1B3A2A', borderRadius: 10, padding: '12px 16px', marginTop: 16 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isFirstMtg} onChange={e => setIsFirstMtg(e.target.checked)}
                          style={{ marginTop: 2, accentColor: '#34D399', width: 14, height: 14, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#34D399', margin: '0 0 2px' }}>
                            First board meeting after incorporation
                          </p>
                          <p style={{ fontSize: 11, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>
                            Enables COI / MOA / AOA noting, DIR-2, custodian appointment and all mandatory first-meeting items under SS-1 Annexure B. Must be within 30 days of incorporation.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Agenda Builder */}
                  <div style={{ marginTop: 28, marginBottom: 4 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
                      Agenda Items
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {agendaItems.map((item, idx) => (
                        <div key={item.id} className="agenda-card" style={{ background: '#13161B', border: '1px solid #232830', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ background: '#1a1e26', borderBottom: '1px solid #232830', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#4F7FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              Agenda {idx + 1}
                            </span>
                            {agendaItems.length > 1 && (
                              <button onClick={() => removeAgendaItem(item.id)}
                                style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
                                ×
                              </button>
                            )}
                          </div>
                          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input value={item.title} onChange={e => updateAgendaItem(item.id, 'title', e.target.value)}
                              placeholder="e.g. Financial Review (20 mins)"
                              style={{ ...inputStyle, fontSize: 14, fontWeight: 600, padding: '9px 12px' }} />
                            <textarea value={item.goal} onChange={e => updateAgendaItem(item.id, 'goal', e.target.value)}
                              placeholder="Goal / details (optional)"
                              rows={2}
                              style={{ ...inputStyle, fontSize: 12, color: '#9CA3AF', resize: 'vertical', padding: '8px 12px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={addAgendaItem}
                      style={{ marginTop: 10, background: 'none', border: '1px dashed #2A3040', borderRadius: 10, color: '#4F7FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '9px 0', width: '100%' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#4F7FFF')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A3040')}>
                      + Add Agenda Item
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer — only on form step */}
            {createStep === 'form' && (
              <div style={{ padding: '16px 32px 24px', borderTop: '1px solid #1a1e26', display: 'flex', gap: 10 }}>
                <button onClick={closeModal} style={ghostBtn}>Cancel</button>
                <button onClick={handleCreate} disabled={creating}
                  style={{ ...primaryBtn, flex: 2, opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating…' : 'Create Meeting'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#191D24', border: '1px solid #3B1A1A', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 400 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F0F2F5', margin: '0 0 8px' }}>Delete meeting?</h3>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 20px', lineHeight: 1.5 }}>
              <strong style={{ color: '#F0F2F5' }}>{deleteTarget.title}</strong> and all its agenda items will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={ghostBtn}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, background: deleting ? '#374151' : '#7F1D1D', color: '#FCA5A5', border: '1px solid #991B1B', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}>
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
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#232830')}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1A2540', border: '1px solid #2A3A6A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F7FFF', fontSize: 18, flexShrink: 0 }}>◈</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#F0F2F5', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</p>
                  <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0' }}>{fmt(m.scheduledAt)}</p>
                </div>
                <StatusPill status={m.status} />
                <span style={{ color: '#374151', fontSize: 16, flexShrink: 0 }}>›</span>
              </div>
            </Link>
            {canDelete(m) && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(m); }}
                title="Delete meeting"
                style={{ marginLeft: 8, flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid #232830', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#3B1A1A'; e.currentTarget.style.borderColor = '#7F1D1D'; e.currentTarget.style.color = '#FCA5A5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#232830'; e.currentTarget.style.color = '#4B5563'; }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase',
  letterSpacing: '0.08em', margin: '0 0 10px',
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

const ghostBtnLink: React.CSSProperties = {
  background: '#13161B', color: '#9CA3AF', border: '1px solid #232830', borderRadius: 10,
  padding: '9px 16px', textDecoration: 'none', display: 'inline-block',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
};
