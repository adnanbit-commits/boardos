'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  meetings as meetingsApi, resolutions as resApi,
  meetingTemplates as templatesApi, companies as companiesApi,
  type Meeting, type MeetingTemplate,
} from '@/lib/api';
import { SYSTEM_TEMPLATES, filterAgendaForCompany, substituteTemplateVars, type TemplateAgendaItem } from '@/lib/meeting-templates';
import { getToken } from '@/lib/auth';

const T = {
  stone: '#F5F2EE', stoneMid: '#EBE6DF', rule: '#E0DAD2', white: '#FDFCFB',
  ink: '#231F1B', inkMid: '#5C5750', inkMute: '#96908A',
  crimson: '#8B1A1A', crimsonMid: '#A52020', crimsonBg: 'rgba(139,26,26,0.07)',
  crimsonBdr: 'rgba(139,26,26,0.18)', crimsonText: '#8B1A1A',
  gold: '#C4973A', goldBg: 'rgba(196,151,58,0.08)', goldBdr: 'rgba(196,151,58,0.2)', goldText: '#7A5C18',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; bdr: string }> = {
  DRAFT:              { label: 'Draft',         color: T.inkMute,  bg: T.stoneMid, bdr: T.rule },
  SCHEDULED:          { label: 'Scheduled',     color: '#1D4ED8',  bg: '#EFF6FF',  bdr: '#BFDBFE' },
  IN_PROGRESS:        { label: 'In Progress',   color: '#166534',  bg: '#F0FDF4',  bdr: '#86EFAC' },
  VOTING:             { label: 'Voting',         color: '#92400E',  bg: '#FFFBEB',  bdr: '#FCD34D' },
  MINUTES_DRAFT:      { label: 'Minutes Draft', color: '#6B21A8',  bg: '#FAF5FF',  bdr: '#D8B4FE' },
  MINUTES_CIRCULATED: { label: 'Circulated',    color: '#6B21A8',  bg: '#FAF5FF',  bdr: '#D8B4FE' },
  SIGNED:             { label: 'Signed',         color: '#166534',  bg: '#F0FDF4',  bdr: '#86EFAC' },
  LOCKED:             { label: 'Locked',         color: T.inkMid,   bg: T.stoneMid, bdr: T.rule },
};
const CAT_COLOR: Record<string, string> = { BOARD: '#1D4ED8', AGM: '#166534', EGM: '#92400E', COMMITTEE: '#6B21A8' };

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.color, background: c.bg, border: `1px solid ${c.bdr}`, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>{c.label}</span>;
}
function fmt(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function uid() { return Math.random().toString(36).slice(2); }

const inputSt: React.CSSProperties = { width: '100%', background: T.white, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: T.ink, outline: 'none', fontFamily: "'Instrument Sans', system-ui, sans-serif" };
const labelSt: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 };
const primaryBtn: React.CSSProperties = { background: T.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Instrument Sans', system-ui, sans-serif" };
const ghostBtn: React.CSSProperties = { flex: 1, background: 'transparent', color: T.inkMid, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Instrument Sans', system-ui, sans-serif" };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(35,31,27,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };

interface AgendaDraft { id: string; title: string; goal: string; itemType?: string; workItems?: any[]; }
type CreateStep = 'pick' | 'form';

export default function MeetingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = getToken();

  const [meetings,       setMeetings]       = useState<Meeting[]>([]);
  const [customTpls,     setCustomTpls]     = useState<MeetingTemplate[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [showModal,      setShowModal]      = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<Meeting | null>(null);
  const [deleting,       setDeleting]       = useState(false);
  const [createStep,     setCreateStep]     = useState<CreateStep>('pick');
  const [selectedTplId,  setSelectedTplId]  = useState<string | null>(null);
  const [selectedTplItems, setSelectedTplItems] = useState<any[]>([]);
  const [title,          setTitle]          = useState('');
  const [scheduledAt,    setScheduledAt]    = useState('');
  const [deemedVenue,    setDeemedVenue]    = useState('');
  const [agendaItems,    setAgendaItems]    = useState<AgendaDraft[]>([{ id: uid(), title: '', goal: '' }]);
  const [creating,       setCreating]       = useState(false);
  const [createErr,      setCreateErr]      = useState('');
  const [companyData,    setCompanyData]    = useState<any>(null);
  const [memberList,     setMemberList]     = useState<any[]>([]);
  const [vaultDocList,   setVaultDocList]   = useState<any[]>([]);
  const [isFirstMtg,     setIsFirstMtg]     = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [mtgs, tpls, company, members, vDocs] = await Promise.all([
        meetingsApi.list(companyId, token),
        templatesApi.list(companyId, token).catch(() => [] as MeetingTemplate[]),
        companiesApi.findOne(companyId, token).catch(() => null),
        companiesApi.listMembers(companyId, token).catch(() => []),
        import('@/lib/api').then(a => a.vault.list(companyId, token).catch(() => [])),
      ]);
      setMeetings(mtgs); setCustomTpls(tpls); setCompanyData(company); setMemberList(members); setVaultDocList(vDocs ?? []);
      if (company?.registeredAt && !deemedVenue) setDeemedVenue(company.registeredAt);
      if (company && !(company as any).firstBoardMeetingLockedId) setIsFirstMtg(true);
    } catch { setError('Could not load meetings.'); }
    finally { setLoading(false); }
  }, [companyId, token]);

  useEffect(() => { load(); }, [load]);

  function applyTemplate(items: any[], tplId?: string) {
    const isSystem = items.length > 0 && 'legalBasis' in items[0];
    if (isSystem) {
      const rich = items as TemplateAgendaItem[];
      setSelectedTplItems(rich);
      setAgendaItems(rich.map(a => ({ id: uid(), title: a.title, goal: a.legalBasis ?? '', itemType: a.itemType, workItems: a.workItems ?? [] })));
    } else {
      setAgendaItems((items as any[]).map(a => ({ id: uid(), title: a.title, goal: a.description ?? '', itemType: a.itemType, workItems: a.workItems ?? [] })));
    }
    setSelectedTplId(tplId ?? null); setCreateStep('form');
  }

  function applySystemTemplate(tpl: typeof SYSTEM_TEMPLATES[0]) {
    const isFirstDone = !!(companyData as any)?.firstBoardMeetingLockedId;
    const filtered = filterAgendaForCompany(tpl, { isFirstMeeting: !isFirstDone, isFyFirstMeeting: true });
    applyTemplate(filtered, tpl.id);
    if (tpl.id === 'sys_first_board' && !isFirstDone) setIsFirstMtg(true);
  }

  function startBlank() { setAgendaItems([{ id: uid(), title: '', goal: '' }]); setSelectedTplId(null); setSelectedTplItems([]); setCreateStep('form'); }
  function addAgendaItem() { setAgendaItems(p => [...p, { id: uid(), title: '', goal: '' }]); }
  function updateAgendaItem(id: string, field: 'title' | 'goal', value: string) { setAgendaItems(p => p.map(a => a.id === id ? { ...a, [field]: value } : a)); }
  function removeAgendaItem(id: string) { setAgendaItems(p => p.length === 1 ? p : p.filter(a => a.id !== id)); }

  async function handleCreate() {
    if (!title.trim() || !scheduledAt) { setCreateErr('Meeting title and date are required.'); return; }
    if (!token) return;
    setCreating(true); setCreateErr('');
    try {
      const meeting = await meetingsApi.create(companyId, { title: title.trim(), scheduledAt: new Date(scheduledAt).toISOString(), deemedVenue: deemedVenue.trim() || undefined }, token);
      if (isFirstMtg) await meetingsApi.markAsFirstMeeting(companyId, meeting.id, token).catch(() => {});
      const sysTpl = selectedTplId?.startsWith('sys_') ? SYSTEM_TEMPLATES.find(t => t.id === selectedTplId) : null;
      const tplItemsForCreate = selectedTplItems.length > 0 ? selectedTplItems : sysTpl?.agendaItems ?? [];
      const templateVars: Record<string, string> = { company_name: (companyData as any)?.name ?? '', cin: (companyData as any)?.cin ?? '', registered_address: (companyData as any)?.registeredAt ?? '', date: new Date(scheduledAt).toLocaleDateString('en-IN') };
      const directors = memberList.filter((m: any) => ['DIRECTOR', 'COMPANY_SECRETARY'].includes(m.role));
      const validItems = agendaItems.filter(a => a.title.trim());
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]; const tplItem = tplItemsForCreate[i] ?? null;
        const agendaItem = await meetingsApi.addAgendaItem(companyId, meeting.id, { title: item.title.trim(), description: item.goal.trim() || undefined, itemType: tplItem?.itemType ?? item.itemType, legalBasis: tplItem?.legalBasis, guidanceNote: tplItem?.guidanceNote }, token);
        const sourceWorkItems: any[] = tplItem?.workItems?.length ? tplItem.workItems : item.workItems?.length ? item.workItems : [];
        if (!sourceWorkItems.length) continue;
        for (const wi of sourceWorkItems) {
          if (wi.type === 'SYSTEM_ACTION') continue;
          const rawMotion = wi.textTemplate ?? wi.motionText ?? ''; const rawRes = wi.resolutionTextTemplate ?? wi.resolutionText;
          const motionText = substituteTemplateVars(rawMotion, templateVars);
          if (!motionText || motionText.trim().length < 5) continue;
          const resolutionText = rawRes ? substituteTemplateVars(rawRes, templateVars) : undefined;
          if (wi.isDynamic) {
            for (const member of directors) {
              const vars = { ...templateVars, director_name: member.user?.name ?? member.name ?? '' };
              try { await resApi.create(companyId, meeting.id, { title: substituteTemplateVars(wi.title, vars), motionText: substituteTemplateVars(rawMotion, vars) || 'Form noted.', resolutionText: rawRes ? substituteTemplateVars(rawRes, vars) : undefined, type: 'NOTING', agendaItemId: agendaItem.id }, token); } catch {}
            }
          } else {
            const resType = wi.type === 'RESOLUTION_VOTING' ? 'MEETING' : 'NOTING';
            let vaultDocId; if ((wi.type === 'DOCUMENT_NOTING' || wi.type === 'NOTING_VAULT_DOC') && wi.vaultDocType) { const m = vaultDocList.find((d: any) => d.docType === wi.vaultDocType && d.fileUrl); if (m) vaultDocId = m.id; }
            try { await resApi.create(companyId, meeting.id, { title: substituteTemplateVars(wi.title, templateVars), motionText, resolutionText, type: resType as any, agendaItemId: agendaItem.id, ...(vaultDocId ? { vaultDocId } : {}) }, token); } catch {}
          }
        }
      }
      if (selectedTplId && !selectedTplId.startsWith('sys_')) await templatesApi.recordUsage(companyId, selectedTplId, token).catch(() => {});
      setMeetings(p => [meeting, ...p]); closeModal();
    } catch (err: any) { setCreateErr(err?.body?.message ?? 'Failed to create meeting.'); }
    finally { setCreating(false); }
  }

  function closeModal() { setShowModal(false); setCreateStep('pick'); setSelectedTplId(null); setSelectedTplItems([]); setTitle(''); setScheduledAt(''); setDeemedVenue(companyData?.registeredAt ?? ''); setAgendaItems([{ id: uid(), title: '', goal: '' }]); setCreateErr(''); }

  async function handleDelete() {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    try { await meetingsApi.remove(companyId, deleteTarget.id, token); setMeetings(p => p.filter(m => m.id !== deleteTarget.id)); setDeleteTarget(null); }
    catch (err: any) { setError(err?.body?.message ?? 'Failed to delete meeting.'); setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  const upcoming  = meetings.filter(m => ['DRAFT','SCHEDULED'].includes(m.status));
  const active    = meetings.filter(m => ['IN_PROGRESS','VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED'].includes(m.status));
  const completed = meetings.filter(m => ['SIGNED','LOCKED'].includes(m.status));

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900, fontFamily: "'Instrument Sans', system-ui, sans-serif", color: T.ink }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.mtg-row:hover .mtg-row-inner{border-color:${T.rule}!important;box-shadow:0 2px 8px rgba(35,31,27,0.06)!important}.tpl-card:hover{border-color:${T.rule}!important}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: T.ink, margin: 0, fontFamily: "'Playfair Display', Georgia, serif" }}>Meetings</h1>
          <p style={{ fontSize: 12, color: T.inkMid, marginTop: 3, margin: '3px 0 0' }}>{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} in this workspace</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/companies/${companyId}/templates`} style={{ background: T.white, color: T.inkMid, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Templates</Link>
          <button onClick={() => setShowModal(true)} style={primaryBtn}>+ New Meeting</button>
        </div>
      </div>

      {error && <div style={{ background: 'rgba(139,26,26,0.07)', border: `1px solid ${T.crimsonBdr}`, borderRadius: 8, padding: '11px 14px', color: T.crimson, fontSize: 12, marginBottom: 18 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 72 }}>
          <div style={{ width: 24, height: 24, border: `2px solid ${T.rule}`, borderTopColor: T.crimson, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : meetings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 20px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: T.stoneMid, border: `1px solid ${T.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: T.inkMute }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 6 }}>No meetings yet</p>
          <p style={{ fontSize: 12, color: T.inkMid, marginBottom: 20 }}>Schedule your first board meeting to get started.</p>
          <button onClick={() => setShowModal(true)} style={primaryBtn}>+ New Meeting</button>
        </div>
      ) : (
        <>
          {active.length    > 0 && <MtgSection title="Active"    meetings={active}    companyId={companyId} onDelete={setDeleteTarget} />}
          {upcoming.length  > 0 && <MtgSection title="Upcoming"  meetings={upcoming}  companyId={companyId} onDelete={setDeleteTarget} />}
          {completed.length > 0 && <MtgSection title="Completed" meetings={completed} companyId={companyId} onDelete={setDeleteTarget} />}
        </>
      )}

      {/* ── Create Modal ── */}
      {showModal && (
        <div onClick={closeModal} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.stone, border: `1px solid ${T.rule}`, borderRadius: 16, width: '100%', maxWidth: createStep === 'pick' ? 760 : 540, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(35,31,27,0.2)' }}>

            {/* Modal header */}
            <div style={{ padding: '20px 28px 16px', borderBottom: `1px solid ${T.rule}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: T.white }}>
              <div>
                {createStep === 'form' && <button onClick={() => setCreateStep('pick')} style={{ background: 'none', border: 'none', color: T.inkMute, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 4, display: 'block' }}>← Back to templates</button>}
                <h2 style={{ fontSize: 15, fontWeight: 600, color: T.ink, margin: '0 0 2px' }}>{createStep === 'pick' ? 'Choose a Template' : 'Meeting Details'}</h2>
                <p style={{ fontSize: 11, color: T.inkMid, margin: 0 }}>{createStep === 'pick' ? 'Start from a system template, a saved template, or a blank meeting.' : 'Set the title, date, and finalise your agenda.'}</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: T.inkMute, fontSize: 18, cursor: 'pointer', lineHeight: 1, marginLeft: 12 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 22px' }}>

              {/* Step 1: picker */}
              {createStep === 'pick' && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>System Templates</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                    {SYSTEM_TEMPLATES.map(tpl => {
                      const cc = CAT_COLOR[tpl.category] ?? T.inkMid;
                      return (
                        <button key={tpl.id} className="tpl-card" onClick={() => applySystemTemplate(tpl)}
                          style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: 10, padding: '13px 14px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(35,31,27,0.06)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cc, background: `${cc}14`, border: `1px solid ${cc}30`, padding: '1px 6px', borderRadius: 20 }}>{tpl.category}</span>
                            <span style={{ fontSize: 10, color: T.inkMute }}>{tpl.agendaItems.length} items</span>
                          </div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: T.ink, margin: '0 0 3px' }}>{tpl.name}</p>
                          <p style={{ fontSize: 11, color: T.inkMid, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{tpl.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  {customTpls.length > 0 && (
                    <>
                      <p style={{ fontSize: 9, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>Your Templates</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                        {customTpls.map(tpl => (
                          <button key={tpl.id} className="tpl-card" onClick={() => applyTemplate(tpl.agendaItems as any[], tpl.id)}
                            style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: 10, padding: '13px 14px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: T.ink, margin: '0 0 3px' }}>{tpl.name}</p>
                            <p style={{ fontSize: 11, color: T.inkMid, margin: 0 }}>{(tpl.agendaItems as any[]).length} items{tpl.usageCount > 0 ? ` · Used ${tpl.usageCount}×` : ''}</p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <button onClick={startBlank}
                    style={{ width: '100%', background: 'transparent', border: `1px dashed ${T.rule}`, borderRadius: 9, padding: '12px 0', color: T.inkMid, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.inkMute; (e.currentTarget as HTMLElement).style.color = T.inkMid; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.rule; }}>
                    Start with a blank meeting →
                  </button>
                </div>
              )}

              {/* Step 2: form */}
              {createStep === 'form' && (
                <div>
                  {createErr && <div style={{ background: T.crimsonBg, border: `1px solid ${T.crimsonBdr}`, borderRadius: 7, padding: '9px 12px', color: T.crimson, fontSize: 12, marginBottom: 14 }}>{createErr}</div>}

                  <label style={labelSt}>Meeting Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q1 2026 Board Meeting" style={{ ...inputSt, marginBottom: 14 }} autoFocus />

                  <label style={labelSt}>Date & Time *</label>
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{ ...inputSt, marginBottom: 14 }} />

                  <label style={labelSt}>Deemed Venue *
                    <span style={{ fontSize: 9, color: T.inkMute, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>SS-1 official meeting venue</span>
                  </label>
                  <input value={deemedVenue} onChange={e => setDeemedVenue(e.target.value)} placeholder="e.g. Registered Office — 123 MG Road, Mumbai 400001" style={{ ...inputSt, marginBottom: !deemedVenue.trim() ? 4 : 14 }} />
                  {!deemedVenue.trim() && <p style={{ fontSize: 10, color: '#92400E', margin: '0 0 14px' }}>Required by SS-1 Rule 3. Pre-filled from your registered address.</p>}

                  {!companyData?.firstBoardMeetingLockedId && (
                    <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 9, padding: '11px 14px', marginBottom: 18 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isFirstMtg} onChange={e => setIsFirstMtg(e.target.checked)} style={{ marginTop: 2, accentColor: '#166534', width: 13, height: 13, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>First board meeting after incorporation</p>
                          <p style={{ fontSize: 11, color: '#16A34A', margin: 0, lineHeight: 1.5 }}>Enables COI / MOA / AOA noting, DIR-2, custodian appointment and all mandatory first-meeting items. Must be within 30 days of incorporation.</p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Agenda */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 12, height: 2, background: T.gold, display: 'inline-block' }} />
                      <p style={{ fontSize: 9, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Agenda Items</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {agendaItems.map((item, idx) => {
                      const srcItem = selectedTplItems[idx];
                      const workItems = (srcItem?.workItems ?? (item as any).workItems ?? []) as any[];
                      const itemType = (srcItem?.itemType ?? (item as any).itemType ?? 'STANDARD') as string;
                      const isFromTpl = !!srcItem || workItems.length > 0 || itemType !== 'STANDARD';
                      const motionCount = workItems.filter((w: any) => w.type === 'RESOLUTION_VOTING').length;
                      const notingCount = workItems.filter((w: any) => w.type === 'DOCUMENT_NOTING' || w.type === 'NOTING_VAULT_DOC').length;
                      const compCount   = workItems.filter((w: any) => w.type === 'NOTING_COMPLIANCE_FORM').length;
                      return (
                        <div key={item.id} style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: 9, overflow: 'hidden', animation: 'fadeIn 0.2s ease' }}>
                          {isFromTpl && <div style={{ height: 2, background: T.gold, opacity: 0.6 }} />}
                          <div style={{ background: T.stoneMid, borderBottom: `1px solid ${T.rule}`, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: T.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agenda {idx + 1}</span>
                            {agendaItems.length > 1 && <button onClick={() => removeAgendaItem(item.id)} style={{ background: 'none', border: 'none', color: T.inkMute, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>}
                          </div>
                          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <input value={item.title} onChange={e => updateAgendaItem(item.id, 'title', e.target.value)} placeholder="e.g. Financial Review (20 mins)" style={{ ...inputSt, fontSize: 13, fontWeight: 600 }} />
                            {isFromTpl && (motionCount > 0 || notingCount > 0 || compCount > 0) && (
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {motionCount > 0 && <span style={{ fontSize: 10, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 20, padding: '1px 8px' }}>{motionCount} motion{motionCount > 1 ? 's' : ''}</span>}
                                {notingCount > 0 && <span style={{ fontSize: 10, color: '#166534', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 20, padding: '1px 8px' }}>{notingCount} doc{notingCount > 1 ? 's' : ''} to note</span>}
                                {compCount > 0   && <span style={{ fontSize: 10, color: '#166534', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 20, padding: '1px 8px' }}>{compCount} compliance form{compCount > 1 ? 's' : ''}</span>}
                              </div>
                            )}
                            <textarea value={item.goal} onChange={e => updateAgendaItem(item.id, 'goal', e.target.value)} placeholder="Notes for CS (optional)" rows={isFromTpl ? 1 : 2} style={{ ...inputSt, fontSize: 11, color: T.inkMid, resize: 'vertical' as const }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={addAgendaItem}
                    style={{ marginTop: 8, background: 'none', border: `1px dashed ${T.rule}`, borderRadius: 8, color: T.inkMid, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '8px 0', width: '100%', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = T.inkMute)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = T.rule)}>
                    + Add Agenda Item
                  </button>
                </div>
              )}
            </div>

            {createStep === 'form' && (
              <div style={{ padding: '14px 28px 20px', borderTop: `1px solid ${T.rule}`, display: 'flex', gap: 8, background: T.white }}>
                <button onClick={closeModal} style={ghostBtn}>Cancel</button>
                <button onClick={handleCreate} disabled={creating} style={{ ...primaryBtn, flex: 2, opacity: creating ? 0.6 : 1 }}>{creating ? 'Creating…' : 'Create Meeting'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.white, border: `1px solid ${T.rule}`, borderRadius: 14, padding: '26px 26px 22px', width: '100%', maxWidth: 380, boxShadow: '0 16px 48px rgba(35,31,27,0.15)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: T.ink, margin: '0 0 8px' }}>Delete meeting?</h3>
            <p style={{ fontSize: 12, color: T.inkMid, margin: '0 0 18px', lineHeight: 1.6 }}>
              <strong>{deleteTarget.title}</strong> and all its agenda items will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} style={ghostBtn}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, background: T.crimsonBg, color: T.crimson, border: `1px solid ${T.crimsonBdr}`, borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MtgSection({ title, meetings, companyId, onDelete }: { title: string; meetings: Meeting[]; companyId: string; onDelete: (m: Meeting) => void; }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ width: 12, height: 2, background: '#C4973A', display: 'inline-block' }} />
        <p style={{ fontSize: 9, fontWeight: 700, color: '#96908A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{title}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meetings.map(m => (
          <div key={m.id} className="mtg-row" style={{ display: 'flex', alignItems: 'center' }}>
            <Link href={`/companies/${companyId}/meetings/${m.id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
              <div className="mtg-row-inner" style={{ background: '#FDFCFB', border: '1px solid #EBE6DF', borderRadius: 10, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F5F2EE', border: '1px solid #E0DAD2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5750', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1v3M11 1v3M1 7h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#231F1B', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</p>
                  <p style={{ fontSize: 11, color: '#96908A', margin: '2px 0 0' }}>{fmt(m.scheduledAt)}</p>
                </div>
                <StatusPill status={m.status} />
                <span style={{ color: '#E0DAD2', fontSize: 14, flexShrink: 0 }}>›</span>
              </div>
            </Link>
            {['DRAFT','SCHEDULED'].includes(m.status) && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(m); }} title="Delete"
                style={{ marginLeft: 6, flexShrink: 0, width: 30, height: 30, borderRadius: 7, background: 'transparent', border: `1px solid #E0DAD2`, color: '#96908A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,26,26,0.07)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,26,26,0.2)'; (e.currentTarget as HTMLElement).style.color = '#8B1A1A'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = '#E0DAD2'; (e.currentTarget as HTMLElement).style.color = '#96908A'; }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
