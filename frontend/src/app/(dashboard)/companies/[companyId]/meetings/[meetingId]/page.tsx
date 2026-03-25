'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { meetings, resolutions as resApi, voting, minutesApi, vault as vaultApi, resolveDownloadUrl } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import type {
  MeetingDetail, Resolution, AgendaItem, MeetingStatus,
  AttendanceRecord, AttendanceMode,
  DirectorDeclarationRecord, DeclarationFormType,
  MeetingDocument, MeetingShareLink,
  NominationState,
} from '@/lib/api';
import { StatusBadge, VoteBar, Spinner, Button, Textarea } from '@/components/ui';
import VariableTokenText from '@/components/VariableTokenText';
import { countUnfilled } from '@/lib/template-variables';

const STATUS_ORDER: MeetingStatus[] = [
  'DRAFT','SCHEDULED','IN_PROGRESS','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED',
];
const NEXT_STATUS_LABEL: Partial<Record<MeetingStatus, string>> = {
  DRAFT:               'Mark Scheduled',
  SCHEDULED:           'Start Meeting',
  IN_PROGRESS:         'Generate Draft Minutes',
  MINUTES_DRAFT:       'Circulate Draft Minutes',
  MINUTES_CIRCULATED:  'Sign Minutes',
};
function nextStatus(s: MeetingStatus): MeetingStatus | null {
  const i = STATUS_ORDER.indexOf(s);
  return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

export default function MeetingWorkspacePage() {
  const { companyId, meetingId } = useParams<{ companyId: string; meetingId: string }>();
  const jwt = getToken()!;
  const me  = getUser();

  const [meeting,     setMeeting]     = useState<MeetingDetail | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [attendance,  setAttendance]  = useState<AttendanceRecord[]>([]);
  const [declarations,setDeclarations]= useState<DirectorDeclarationRecord[]>([]);
  const [members,     setMembers]     = useState<any[]>([]);
  const [vaultDocs,   setVaultDocs]   = useState<any[]>([]);
  const [myRole,      setMyRole]      = useState('OBSERVER');
  const [loading,     setLoading]     = useState(true);
  const [activeAgenda,setActiveAgenda]= useState<string | null>(null);
  const [panel,       setPanel]       = useState<'resolutions'|'declarations'|'attendance'|'minutes'|'documents'>('resolutions');
  const [advancing,   setAdvancing]   = useState(false);
  const [error,       setError]       = useState('');

  // Chairperson election modal
  const [showChairModal, setShowChairModal] = useState(false);
  const [guidedMode,     setGuidedMode]     = useState(false);
  const [guidedStep,     setGuidedStep]     = useState(0);


  const reload = useCallback(async () => {
    try {
      const [m, r, memberList, vaultDocList] = await Promise.all([
        meetings.findOne(companyId, meetingId, jwt),
        resApi.listForMeeting(companyId, meetingId, jwt),
        import('@/lib/api').then(a => a.companies.listMembers(companyId, jwt)),
        import('@/lib/api').then(a => a.vault.list(companyId, jwt).catch(() => [])),
      ]);
      setMeeting(m);
      setResolutions(r);
      setMembers(memberList);
      setVaultDocs(vaultDocList ?? []);
      const me2 = memberList.find((mem: any) => mem.user.id === (me?.id ?? ''));
      if (me2) setMyRole(me2.role);
      // Always sync activeAgenda — auto-select first item if none selected yet
      setActiveAgenda(prev => (!prev && m.agendaItems[0]) ? m.agendaItems[0].id : prev);

      if (m.status !== 'DRAFT') {
        const [att, decl] = await Promise.all([
          meetings.getAttendance(companyId, meetingId, jwt).catch(() => []),
          meetings.getDeclarations(companyId, meetingId, jwt).catch(() => []),
        ]);
        setAttendance(att as any);
        setDeclarations(decl as any);
      }
    } catch { setError('Failed to load meeting. Please refresh.'); }
    finally { setLoading(false); }
  }, [companyId, meetingId, jwt, me?.id]);

  useEffect(() => { reload(); }, [reload]);

  // Auto-focus: guide user to the right panel for current status
  useEffect(() => {
    if (!meeting) return;
    if (meeting.status === 'SCHEDULED') {
      // SCHEDULED: guide to attendance panel so user can see status
      setPanel('resolutions');
    }
    // IN_PROGRESS: start at resolutions (agenda item execution surface)
    // docnotes/declarations are handled as agenda items now
  }, [meeting?.status]);

  async function advanceMeeting() {
    if (!meeting) return;
    const target = nextStatus(meeting.status as MeetingStatus);
    if (!target) return;

    // No pre-gate for chairperson — elected as first agenda item inside the meeting.
    // Backend enforces quorum only. If chairperson needed, prompt appears inside meeting.

    setAdvancing(true); setError('');
    try {
      if (target === 'SIGNED') {
        await minutesApi.sign(companyId, meetingId, jwt);
      } else {
        await meetings.advance(companyId, meetingId, target, jwt);
        if (target === 'MINUTES_DRAFT') {
          await minutesApi.generate(companyId, meetingId, jwt);
          setPanel('minutes');
        }
        if (target === 'MINUTES_CIRCULATED') setPanel('minutes');
      }
      await reload();
    } catch (err: any) {
      setError((err as any).body?.message ?? 'Could not advance meeting status.');
    } finally { setAdvancing(false); }
  }

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!meeting) return null;

  const next    = nextStatus(meeting.status as MeetingStatus);
  const myMembership  = members.find((m: any) => m.user?.id === me?.id);
  const isWorkspaceAdmin = myMembership?.isWorkspaceAdmin === true;
  const isDirector   = myRole === 'DIRECTOR';
  const isChairpersonUser = meeting.chairpersonId === me?.id;
  const isCS         = myRole === 'COMPANY_SECRETARY';
  const isParticipant = isDirector || isCS;
  // canAdvance: before chairperson elected → meeting caller or workspace admin only
  //             after chairperson elected  → chairperson only
  const isCalledByMe = (meeting as any).calledBy === me?.id;
  const canAdvance = meeting.chairpersonId
    ? isChairpersonUser
    : (isCalledByMe || isWorkspaceAdmin);
  // isAdmin kept as alias for legacy guards (e.g. add agenda item, manage docs)
  const isAdmin = isWorkspaceAdmin || isDirector;

  const visibleResolutions = activeAgenda
    ? resolutions.filter(r => r.agendaItemId === activeAgenda)
    : resolutions;

  const presentCount    = attendance.filter(a => a.attendance?.mode !== 'ABSENT').length;
  const totalCount      = attendance.length;
  const allDeclReceived = declarations.length > 0 && declarations.every(d => d.forms.every(f => f.received));
  const declWarning     = declarations.length > 0 && !allDeclReceived &&
    ['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status);

  // Unfilled variables across all agenda items
  const unfilledVarCount = meeting.agendaItems.reduce((total: number, item: any) => {
    if (!item.variables?.length) return total;
    return total + countUnfilled(item.motionText ?? '', item.resolutionText ?? '', item.variableValues ?? {});
  }, 0);

  // Directors for chairperson/recorder selection
  const directors = members.filter((m: any) => ['DIRECTOR','COMPANY_SECRETARY'].includes(m.role));

  return (
    <div className="flex flex-col h-screen bg-[#F5F2EE] overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#E0DAD2;border-radius:10px}
      `}</style>

      {/* Chairperson election modal */}
      {showChairModal && (
        <ChairpersonModal
          companyId={companyId} meetingId={meetingId} jwt={jwt}
          currentUserId={me?.id ?? ''}
          onElected={async () => { setShowChairModal(false); await reload(); setPanel('attendance'); }}
          onClose={() => setShowChairModal(false)}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-[#EBE6DF] border-b border-[#E0DAD2] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-[#96908A] text-xs flex items-center gap-1.5 flex-shrink-0">
              <a href={`/companies/${companyId}`} className="hover:text-[#5C5750]">Workspace</a>
              <span>›</span>
              <a href={`/companies/${companyId}/meetings`} className="hover:text-[#5C5750]">Meetings</a>
              <span>›</span>
            </div>
            <h1 className="text-white font-bold text-lg truncate"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              {meeting.title}
            </h1>
            <StatusBadge status={meeting.status.toLowerCase()} />
            {totalCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EBE6DF] border border-[#E0DAD2] text-[#5C5750]">
                {presentCount}/{totalCount} present
              </span>
            )}
            {declWarning && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 border border-[#FDE68A]/40 text-[#92400E]">
                ⚠ Declarations pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {meeting.videoUrl && (
              <a href={meeting.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[#8B1A1A] bg-blue-950 border border-[#ECC9C9] px-3 py-1.5 rounded-lg hover:bg-blue-900">
                <span>▶</span> Join {meeting.videoProvider ?? 'Video Call'}
              </a>
            )}
            {isAdmin && (
              <a href={`/companies/${companyId}`}
                className="flex items-center gap-1.5 text-xs text-[#6B21A8] bg-[#F5F3FF]/40 border border-[#DDD6FE] px-3 py-1.5 rounded-lg hover:bg-[#F5F3FF]">
                <span>◎</span> Invite Members
              </a>
            )}
            <span className="text-[#96908A] text-xs">
              {new Date(meeting.scheduledAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
            </span>
            {(meeting as any).deemedVenue && (
              <span className="text-[#96908A] text-[10px] bg-[#EBE6DF] border border-[#E0DAD2] px-2.5 py-1 rounded-lg hidden sm:block" title="Deemed Venue (SS-1)">
                ◎ {(meeting as any).deemedVenue}
              </span>
            )}
            {meeting.status === 'IN_PROGRESS' && (
              <button
                onClick={() => { setGuidedMode(g => !g); setGuidedStep(0); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  guidedMode
                    ? 'bg-[#8B1A1A] border-blue-500 text-white'
                    : 'bg-[#EBE6DF] border-[#E0DAD2] text-[#5C5750] hover:text-zinc-200 hover:border-zinc-500'
                }`}>
                {guidedMode ? '✕ Exit Guided' : '▶ Guided Mode'}
              </button>
            )}
            {canAdvance && next && (
              <Button onClick={advanceMeeting} loading={advancing} size="sm"
                variant={next === 'SIGNED' ? 'outline' : 'primary'}>
                {NEXT_STATUS_LABEL[meeting.status as MeetingStatus] ?? `→ ${next}`}
              </Button>
            )}
          </div>
        </div>
        <WorkflowProgress status={meeting.status as MeetingStatus} />
        {/* Unfilled variables banner */}
        {unfilledVarCount > 0 && meeting.status === 'IN_PROGRESS' && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-[#FEF3C7]/30 border-b border-[#FDE68A]">
            <span className="text-[#92400E] text-sm">⚠</span>
            <p className="text-[#78350F] text-xs flex-1">
              <span className="font-semibold">{unfilledVarCount} agenda item{unfilledVarCount !== 1 ? 's have' : ' has'} unfilled details</span>
              {' '}— click the amber tokens in each motion to fill them before the meeting.
            </p>
          </div>
        )}
      </header>

      {guidedMode && meeting.status === 'IN_PROGRESS' && <GuidedMeetingView
        meeting={meeting} resolutions={resolutions} guidedStep={guidedStep}
        setGuidedStep={setGuidedStep} setGuidedMode={setGuidedMode}
        companyId={companyId} meetingId={meetingId} jwt={jwt}
        currentUserId={me?.id ?? ''} isAdmin={isAdmin}
        isChairperson={isChairpersonUser} vaultDocs={vaultDocs}
        onRefresh={reload}
      />}
      {!guidedMode && <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-[#EBE6DF] border-r border-[#E0DAD2] flex flex-col overflow-y-auto">
          <div className="px-4 pt-5 pb-2">
            <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold">Agenda</p>
          </div>
          {/* ── Pre-business procedural gates (not agenda items) ─────────── */}
          {['IN_PROGRESS'].includes(meeting.status) && (() => {
            const hasChairItem = meeting.agendaItems.some(a => (a as any).itemType === 'CHAIRPERSON_ELECTION');
            const hasQuorumItem = meeting.agendaItems.some(a => (a as any).itemType === 'QUORUM_CONFIRMATION');
            if (!hasChairItem && !hasQuorumItem) return null;
            return (
              <div className="px-3 pb-2 space-y-1">
                {hasChairItem && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${meeting.chairpersonId ? 'text-[#166534]' : 'text-[#92400E]'}`}>
                    <span className="text-[10px]">{meeting.chairpersonId ? '✓' : '⚑'}</span>
                    <span className="text-[10px] font-semibold">{meeting.chairpersonId ? 'Chairperson elected' : 'Elect Chairperson'}</span>
                  </div>
                )}
                {hasQuorumItem && (() => {
                  const presentCount2 = attendance.filter((a: any) => a.attendance?.mode && a.attendance.mode !== 'ABSENT').length;
                  const totalCount2   = attendance.length;
                  const quorumReq2    = Math.max(2, Math.ceil(totalCount2 / 3));
                  const quorumMet2    = presentCount2 >= quorumReq2;
                  const allMarked     = totalCount2 > 0 && attendance.every((a: any) => a.attendance?.mode);
                  const done          = (meeting as any).quorumConfirmedAt || (allMarked && quorumMet2);
                  return (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${done ? 'text-[#166534]' : totalCount2 > 0 ? 'text-[#8B1A1A] hover:bg-[#FDFCFB]' : 'text-[#96908A]'}`}
                      onClick={() => totalCount2 > 0 && setPanel('attendance')}
                      title={totalCount2 > 0 ? 'Click to view attendance' : undefined}
                    >
                      <span className="text-[10px]">{done ? '✓' : totalCount2 > 0 ? '◎' : '◎'}</span>
                      <span className="text-[10px] font-semibold">
                        {done
                          ? `Quorum confirmed — ${presentCount2} of ${totalCount2} present`
                          : totalCount2 > 0
                          ? `Roll call in progress — ${presentCount2} of ${totalCount2} marked`
                          : 'Roll call pending'}
                      </span>
                    </div>
                  );
                })()}
                <div className="border-t border-[#E0DAD2] mt-1" />
              </div>
            );
          })()}

          <nav className="flex flex-col gap-0.5 px-2 pb-4">
            {meeting.agendaItems.length === 0 ? (
              <p className="text-[#96908A] text-xs px-2 py-3">No agenda items yet.</p>
            ) : (() => {
              // Filter out procedural steps — these are shown as gates above, not agenda items
              const PROCEDURAL = ['CHAIRPERSON_ELECTION', 'QUORUM_CONFIRMATION'];
              const businessItems = meeting.agendaItems.filter(
                (item: any) => !PROCEDURAL.includes(item.itemType ?? 'STANDARD')
              );
              let displayIdx = 0;
              return meeting.agendaItems.map((item: any) => {
                if (PROCEDURAL.includes(item.itemType ?? 'STANDARD')) return null;
                displayIdx++;
                const itemRes = resolutions.filter((r: any) => r.agendaItemId === item.id);
                const hasVoting = itemRes.some((r: any) => r.status === 'VOTING');
                const allDone   = itemRes.length > 0 && itemRes.every((r: any) => ['APPROVED','REJECTED','NOTED'].includes(r.status));
                const n = displayIdx;
                return (
                  <button key={item.id}
                    onClick={() => { setActiveAgenda(item.id === activeAgenda ? null : item.id); setPanel('resolutions'); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150
                      ${activeAgenda === item.id && panel === 'resolutions'
                        ? 'bg-[#F5E6E6] border border-[#ECC9C9]'
                        : 'hover:bg-[#FDFCFB] border border-transparent'}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center mt-0.5
                        ${allDone ? 'bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]'
                        : hasVoting ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                        : 'bg-[#F5F2EE] border-[#E0DAD2] text-[#96908A]'}`}>
                        {allDone ? '✓' : n}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium leading-tight ${
                          activeAgenda === item.id && panel === 'resolutions' ? 'text-[#701515]' : 'text-[#5C5750]'}`}>
                          {item.title}
                          {item.isAob && <span className="ml-1 text-[9px] text-amber-500">AOB</span>}
                        </p>
                        {itemRes.length > 0 && (
                          <p className="text-[#96908A] text-[10px] mt-0.5">
                            {itemRes.length} item{itemRes.length !== 1 ? 's' : ''}{hasVoting && ' · voting open'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              });
            })()}
          </nav>

          {/* ── Pending AOB items — awaiting chairperson admission ─────── */}
          {(() => {
            const pending = meeting.agendaItems.filter(
              (a: any) => a.isAob && (a as any).guidanceNote === '__PENDING_ADMISSION__'
            );
            if (pending.length === 0) return null;
            return (
              <div className="px-3 pb-3 border-t border-[#E0DAD2] pt-2">
                <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-2">
                  Pending Admission ({pending.length})
                </p>
                <div className="space-y-1.5">
                  {pending.map((item: any) => (
                    <div key={item.id} className="bg-[#FEF3C7]/20 border border-[#FDE68A] rounded-lg px-3 py-2">
                      <p className="text-[#78350F] text-[11px] font-medium leading-tight">{item.title}</p>
                      {item.description && (
                        <p className="text-[#96908A] text-[10px] mt-0.5">{item.description}</p>
                      )}
                      {isChairpersonUser && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={async () => {
                              try { await meetings.admitAob(companyId, meetingId, item.id, jwt); await reload(); }
                              catch (e: any) { alert(e?.body?.message ?? 'Could not admit item'); }
                            }}
                            className="text-[10px] font-bold text-[#166534] bg-[#DCFCE7]/30 border border-green-800/30 px-2 py-0.5 rounded hover:bg-[#DCFCE7]/50 transition-colors">
                            ✓ Admit for Discussion
                          </button>
                          <button
                            onClick={async () => {
                              // Dismiss by removing the marker — treated as not admitted
                              try {
                                await meetings.addAgendaItem(companyId, meetingId,
                                  { title: item.title, description: 'Not admitted by Chairperson.' }, jwt);
                                await reload();
                              } catch {}
                            }}
                            className="text-[10px] text-[#96908A] hover:text-[#5C5750]">
                            ✕ Decline
                          </button>
                        </div>
                      )}
                      {!isChairpersonUser && (
                        <p className="text-[#96908A] text-[10px] mt-1 italic">Awaiting Chairperson</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {isAdmin && !['MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED'].includes(meeting.status) && (
            <div className="px-3 pb-4 pt-2 border-t border-[#E0DAD2]">
              <ProposeAgendaForm
                companyId={companyId} meetingId={meetingId} jwt={jwt}
                isChairperson={isChairpersonUser} meetingStatus={meeting.status}
                onAdded={reload}
              />
            </div>
          )}

          {/* Role assignments */}
          {isAdmin && !['SIGNED','LOCKED'].includes(meeting.status) && (
            <div className="px-3 pb-3 pt-1 border-t border-[#E0DAD2]">
              <RoleAssignmentMini
                meeting={meeting} directors={directors}
                companyId={companyId} meetingId={meetingId}
                jwt={jwt} onUpdated={reload}
              />
            </div>
          )}

          {/* Panel switcher */}
          <div className="px-3 pb-4 pt-1 border-t border-[#E0DAD2] space-y-1">
            <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-2 px-1">View</p>
            {[
              { key: 'resolutions', label: '◇ Business', always: true },
              // Declarations panel removed — DocNotesPanel (Compliance Docs) is the single source

              { key: 'attendance', label: '◎ Attendance', show: !['DRAFT'].includes(meeting.status),
                badge: meeting.status === 'IN_PROGRESS' && attendance.length === 0 ? 'Required' : undefined, badgeColor: 'amber' },
              // Compliance docs noted inline within agenda items (COMPLIANCE_NOTING itemType)

              { key: 'documents', label: '📎 Meeting Papers', always: true },
              { key: 'minutes', label: '▣ Minutes', show: !!meeting.minutes },
            ].map((p: any) => p.always || p.show ? (
              <button key={p.key} onClick={() => setPanel(p.key as any)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${panel === p.key ? 'bg-[#FDFCFB] text-zinc-200' : 'text-[#96908A] hover:text-[#5C5750]'}`}>
                {p.label}
                {p.badge && (
                  <span className={`ml-2 text-[9px] bg-${p.badgeColor}-900/60 text-${p.badgeColor}-400 border border-${p.badgeColor}-700/40 px-1.5 py-0.5 rounded-full`}>
                    {p.badge}
                  </span>
                )}
              </button>
            ) : null)}
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-8 py-7">


          {/* ── Chairperson prompt (IN_PROGRESS but no chairperson) ─────────── */}
          {meeting.status === 'IN_PROGRESS' && !meeting.chairpersonId && (
            <div className="mb-5 bg-[#FEF3C7]/20 border border-[#FDE68A] rounded-2xl p-5 flex items-start gap-4">
              <span className="text-[#92400E] text-xl flex-shrink-0 mt-0.5">⚑</span>
              <div className="flex-1">
                <p className="text-[#92400E] text-sm font-semibold mb-1">Elect Chairperson — first act of every board meeting</p>
                <p className="text-[#5C5750] text-xs leading-relaxed mb-3">
                  No business can proceed until a Chairperson is elected (SS-1 Annexure B).
                </p>
                {/* Any director can open the nomination modal */}
                <button
                  onClick={() => setShowChairModal(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Elect Chairperson →
                </button>
              </div>
            </div>
          )}

          {panel === 'resolutions' && (
            <ResolutionsPanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} resolutions={visibleResolutions}
              activeAgendaItem={meeting.agendaItems.find(a => a.id === activeAgenda)}
              currentUserId={me?.id ?? ''} onRefresh={reload} isAdmin={isAdmin}
              isChairperson={isChairpersonUser}
              vaultDocs={vaultDocs}
            />
          )}
          {/* Declarations panel removed — use Compliance Docs panel instead */}
          {panel === 'attendance' && (
            <AttendancePanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} attendance={attendance}
              currentUserId={me?.id ?? ''}
              isChairperson={meeting.chairpersonId === me?.id}
              isCS={myRole === 'COMPANY_SECRETARY'}
              onRefresh={reload}
            />
          )}
          {panel === 'minutes' && meeting.minutes && (
            <MinutesPanel
              minutes={meeting.minutes}
              companyId={companyId}
              meetingId={meetingId}
              jwt={jwt}
            />
          )}
          {/* Compliance docs noted inline — navigate to the Director Declarations agenda item */}
          {panel === 'documents' && (
            <MeetingDocumentsPanel
              companyId={companyId} meetingId={meetingId} token={jwt}
              canManage={isAdmin}
            />
          )}
        </main>
      </div>}
    </div>
  );
}

// ── Workflow Progress ─────────────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: MeetingStatus }) {
  const steps = [
    {key:'DRAFT',label:'Draft'},
    {key:'SCHEDULED',label:'Scheduled'},
    {key:'IN_PROGRESS',label:'In Meeting'},
    {key:'VOTING',label:'Voting'},
    {key:'MINUTES_DRAFT',label:'Minutes'},
    {key:'MINUTES_CIRCULATED',label:'Circulated'},
    {key:'SIGNED',label:'Signed'},
    {key:'LOCKED',label:'Archived'},
  ];
  const currentIdx = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((step, idx) => {
        const done = idx < currentIdx, current = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-0.5 w-full rounded-full transition-all duration-500 ${done?'bg-[#701515]':current?'bg-[#701515]/50':'bg-[#232830]'}`}/>
              <span className={`text-[9px] font-medium tracking-wide whitespace-nowrap ${current?'text-[#8B1A1A]':done?'text-[#96908A]':'text-[#C8C0B5]'}`}>{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Chairperson Modal ─────────────────────────────────────────────────────────

// ── Chairperson Election Modal ────────────────────────────────────────────────
// Nomination flow for small boards (2–3 directors):
//   Step 1: Any director nominates someone (or themselves)
//   Step 2: All other directors see the nomination and can confirm or propose an alternative
//   Step 3: When a nominee has a majority of confirmations → election complete
//
// For single-director companies: director self-nominates and confirms immediately.
// Backend requires DIRECTOR role — any director can nominate, not just admin.

// ── Chairperson Election Modal ────────────────────────────────────────────────
//
// DB-backed nomination flow. State is persisted via API so every director's
// browser shows the same pending nomination on reload.
//
// Flow:
//   Step 1: Any director nominates (POST /nominate)   → proposer auto-confirms
//   Step 2: Other directors confirm  (POST /confirm)  → each adds their userId
//   Step 3: Once majority reached   (POST /chairperson) → election finalised
//
// The modal polls every 3s so Director B sees Director A's nomination without
// needing to manually refresh the page.

function ChairpersonModal({ companyId, meetingId, jwt, currentUserId, onElected, onClose }: any) {
  const [nomination, setNomination] = useState<NominationState | null>(null);
  const [loadError,  setLoadError]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [recId,      setRecId]      = useState('');
  const mountedRef  = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load nomination state from DB — only update state if still mounted
  const loadNomination = useCallback(async () => {
    try {
      const n = await meetings.getNomination(companyId, meetingId, jwt);
      if (!mountedRef.current) return;
      // Stop polling once chairperson is elected
      if (n.chairpersonId && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setNomination(n);
      setLoadError('');
    } catch {
      if (!mountedRef.current) return;
      setLoadError('Could not load nomination state. Please try again.');
    }
  }, [companyId, meetingId, jwt]);

  useEffect(() => {
    mountedRef.current = true;
    loadNomination();
    // Poll every 3s so Director B sees Director A's nomination in real time
    intervalRef.current = setInterval(loadNomination, 3000);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loadNomination]);

  async function nominate(nomineeId: string) {
    setSaving(true);
    try {
      const n = await meetings.nominateChairperson(companyId, meetingId, nomineeId, jwt);
      setNomination(n);
    } catch (err: any) {
      alert(err?.body?.message ?? 'Could not submit nomination.');
    } finally { setSaving(false); }
  }

  async function confirm() {
    setSaving(true);
    try {
      const n = await meetings.confirmChairperson(companyId, meetingId, jwt);
      setNomination(n);
    } catch (err: any) {
      alert(err?.body?.message ?? 'Could not confirm nomination.');
    } finally { setSaving(false); }
  }

  async function elect() {
    if (!nomination?.nomineeId || !nomination.isMajority) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSaving(true);
    try {
      await meetings.electChairperson(companyId, meetingId, nomination.nomineeId, jwt);
      // Default recorder to chairperson if none selected — CS can change later
      const effectiveRecId = recId || nomination.nomineeId;
      await meetings.setRecorder(companyId, meetingId, effectiveRecId, jwt);
      await onElected();
    } catch (err: any) {
      alert(err?.body?.message ?? 'Could not elect chairperson.');
      setSaving(false);
    }
  }

  async function withdrawNomination() {
    // Nominate the current user with no nominee (clears state via backend)
    // Actually — just call nominate again to reset, or we can add a clear endpoint.
    // For now: reload to get fresh state; admin can re-nominate to override.
    await loadNomination();
  }

  if (!nomination) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-[#EBE6DF] border border-[#E0DAD2] rounded-2xl p-7 max-w-md w-full">
          {loadError
            ? <p className="text-[#991B1B] text-sm">{loadError}</p>
            : <div className="flex items-center gap-3"><div className="w-5 h-5 border-2 border-[#E0DAD2] border-t-blue-500 rounded-full animate-spin"/><p className="text-[#5C5750] text-sm">Loading…</p></div>
          }
          <button onClick={onClose} className="mt-4 text-[#96908A] text-xs hover:text-[#5C5750]">Cancel</button>
        </div>
      </div>
    );
  }

  const myId           = currentUserId;
  const iHaveConfirmed = nomination.confirmedBy.includes(myId);
  const iAmProposer    = nomination.proposedBy === myId;
  const nomineeName    = nomination.directors.find(d => d.userId === nomination.nomineeId)?.name ?? '';
  const proposerName   = nomination.directors.find(d => d.userId === nomination.proposedBy)?.name ?? '';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#EBE6DF] border border-[#E0DAD2] rounded-2xl p-7 max-w-md w-full fade-up">
        <p className="text-[#96908A] text-[10px] uppercase tracking-widest mb-1">SS-1 Annexure B — Item 1</p>
        <h2 className="text-white font-bold text-lg mb-1" style={{fontFamily:"'Playfair Display',serif"}}>
          Elect Chairperson
        </h2>
        <p className="text-[#96908A] text-xs mb-5">
          Any director may nominate. Nomination requires confirmation by a majority
          of directors before the election is finalised.
        </p>

        {!nomination.nomineeId ? (
          // ── Step 1: No pending nomination — anyone can propose ──────────────
          <div className="space-y-3">
            <p className="text-[#5C5750] text-xs font-semibold mb-2">Nominate a Chairperson</p>
            {nomination.directors.map(d => (
              <button
                key={d.userId}
                onClick={() => nominate(d.userId)}
                disabled={saving}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#F5F2EE] border border-[#E0DAD2] rounded-xl hover:border-blue-700/50 hover:bg-[#0d1524] transition-all text-left disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{d.name}</p>
                  <p className="text-[10px] text-[#96908A] mt-0.5">
                    {d.userId === myId ? 'Nominate yourself' : 'Nominate this director'}
                  </p>
                </div>
                <span className="text-[#96908A] text-xs">→</span>
              </button>
            ))}
          </div>
        ) : (
          // ── Step 2 / 3: Nomination pending — confirm or elect ───────────────
          <div className="space-y-4">
            {/* Nomination card */}
            <div className="bg-[#F5E6E6] border border-[#ECC9C9] rounded-xl p-4">
              <p className="text-[10px] text-[#96908A] mb-1">Proposed by {proposerName}</p>
              <p className="text-base font-bold text-zinc-100">{nomineeName}</p>
              <p className="text-[10px] text-[#96908A] mt-1">
                {nomination.confirmCount} of {nomination.totalDirectors} director{nomination.totalDirectors > 1 ? 's' : ''} confirmed
                {nomination.totalDirectors > 1 ? ` · ${nomination.majorityNeeded} needed` : ''}
              </p>
              {/* Progress bar — one segment per director */}
              <div className="mt-2.5 flex gap-1.5">
                {nomination.directors.map(d => (
                  <div
                    key={d.userId}
                    title={`${d.name}${nomination.confirmedBy.includes(d.userId) ? ' ✓' : ''}`}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      nomination.confirmedBy.includes(d.userId) ? 'bg-green-500' : 'bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Current director action */}
            {!iHaveConfirmed && !iAmProposer && (
              <div className="bg-[#F5F2EE] border border-[#E0DAD2] rounded-xl p-4">
                <p className="text-xs text-[#5C5750] mb-3">
                  {proposerName} has proposed <strong className="text-zinc-200">{nomineeName}</strong> as Chairperson.
                  Do you confirm?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={confirm}
                    disabled={saving}
                    className="px-4 py-2 bg-green-900/50 border border-[#BBF7D0]/50 text-[#166534] text-xs font-semibold rounded-lg hover:bg-green-900/70 transition-colors disabled:opacity-50"
                  >
                    {saving ? '…' : '✓ Confirm'}
                  </button>
                  <button
                    onClick={() => nominate(myId === nomination.nomineeId
                      ? nomination.directors.find(d => d.userId !== myId)?.userId ?? myId
                      : myId
                    )}
                    disabled={saving}
                    className="px-4 py-2 bg-transparent border border-[#E0DAD2]/50 text-[#96908A] text-xs font-semibold rounded-lg hover:text-[#5C5750] transition-colors disabled:opacity-50"
                  >
                    Propose someone else
                  </button>
                </div>
              </div>
            )}

            {iAmProposer && !nomination.isMajority && (
              <p className="text-[#96908A] text-xs bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-4 py-3">
                You proposed {nomineeName}. Waiting for other directors to confirm…
                <span className="block text-[#C8C0B5] text-[10px] mt-1">This page updates automatically every few seconds.</span>
              </p>
            )}

            {iHaveConfirmed && !iAmProposer && !nomination.isMajority && (
              <p className="text-[#96908A] text-xs bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-4 py-3">
                ✓ You confirmed. Waiting for more directors…
              </p>
            )}

            {/* Election finalisation — shown once majority reached */}
            {nomination.isMajority && (
              <div className="bg-[#DCFCE7]/20 border border-green-800/30 rounded-xl p-4 space-y-3">
                <p className="text-[#166534] text-sm font-semibold">
                  ✓ Majority confirmed — ready to finalise
                </p>
                <div>
                  <label className="text-[#96908A] text-[10px] uppercase tracking-widest block mb-1.5">
                    Minutes Recorder <span className="text-[#96908A]">(optional)</span>
                  </label>
                  <select
                    value={recId}
                    onChange={e => setRecId(e.target.value)}
                    className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
                  >
                    <option value="">Same as Chairperson (default)</option>
                    {nomination.directors.map(d => (
                      <option key={d.userId} value={d.userId}>{d.name}</option>
                    ))}
                  </select>
                  <p className="text-[#96908A] text-[10px] mt-1">
                    Best practice: a different director records the minutes
                  </p>
                </div>
                <Button size="sm" loading={saving} onClick={elect}>
                  Confirm Election & Open Meeting
                </Button>
              </div>
            )}

            <button
              onClick={() => nominate(nomination.directors[0]?.userId ?? '')}
              className="text-[#96908A] text-xs hover:text-[#5C5750]"
            >
              ← Start over with a different nominee
            </button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-[#E0DAD2]">
          <button onClick={onClose} className="text-[#96908A] text-xs hover:text-[#5C5750]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Role Assignment Mini (sidebar) ────────────────────────────────────────────

function RoleAssignmentMini({ meeting, directors, companyId, meetingId, jwt, onUpdated }: any) {
  const [saving, setSaving] = useState(false);

  async function changeChair(id: string) {
    setSaving(true);
    try { await meetings.electChairperson(companyId, meetingId, id, jwt); await onUpdated(); }
    finally { setSaving(false); }
  }
  async function changeRecorder(id: string) {
    setSaving(true);
    try { await meetings.setRecorder(companyId, meetingId, id, jwt); await onUpdated(); }
    finally { setSaving(false); }
  }

  const chairName    = directors.find((d: any) => d.user.id === meeting.chairpersonId)?.user?.name;
  const recorderName = directors.find((d: any) => d.user.id === meeting.minutesRecorderId)?.user?.name;

  // Recorder can be set/changed during IN_PROGRESS (not after voting begins)
  const canSetRecorder = !['VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED'].includes(meeting.status);

  return (
    <div className="space-y-2 py-2">
      <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold px-1">Meeting Roles</p>

      {/* Chairperson */}
      <div>
        <p className="text-[#96908A] text-[10px] mb-0.5 px-1">Chairperson</p>
        {chairName
          ? <p className="text-[#5C5750] text-xs px-1 font-medium">{chairName}</p>
          : <button onClick={() => {}} className="text-[#92400E] text-[10px] px-1 hover:text-[#78350F]">
              ⚠ Not elected
            </button>
        }
      </div>

      {/* Minutes Recorder — selectable dropdown */}
      <div>
        <p className="text-[#96908A] text-[10px] mb-1 px-1">Minutes Recorder</p>
        {canSetRecorder ? (
          <select
            value={meeting.minutesRecorderId ?? ''}
            onChange={e => e.target.value && changeRecorder(e.target.value)}
            disabled={saving}
            className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-2 py-1 text-[11px] text-[#5C5750] focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-50"
          >
            <option value="">— Designate recorder</option>
            <option value={meeting.chairpersonId ?? ''}>
              {chairName ? `${chairName} (Chairperson)` : 'Same as Chairperson'}
            </option>
            {directors.filter((d: any) => d.user.id !== meeting.chairpersonId).map((d: any) => (
              <option key={d.user.id} value={d.user.id}>{d.user.name}</option>
            ))}
          </select>
        ) : (
          <p className="text-[#5C5750] text-[10px] px-1">
            {recorderName
              ? meeting.minutesRecorderId === meeting.chairpersonId
                ? `${recorderName} (Chairperson)`
                : recorderName
              : '— Not designated'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Declarations Panel ────────────────────────────────────────────────────────

const FORM_META: Record<DeclarationFormType, {label: string; shortName: string; law: string; desc: string}> = {
  DIR_2: { label: 'DIR-2', shortName: 'Consent', law: 'Sec. 152(5)', desc: 'Written consent to act as director' },
  DIR_8: { label: 'DIR-8', shortName: 'Non-disqualification', law: 'Sec. 164(2)', desc: 'Declaration of non-disqualification' },
  MBP_1: { label: 'MBP-1', shortName: 'Disclosure', law: 'Sec. 184(1)', desc: 'Disclosure of interest in other entities' },
};

function DeclarationsPanel({ companyId, meetingId, jwt, meeting, declarations, isAdmin, onRefresh }: any) {
  const [saving,   setSaving]   = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const canEdit = isAdmin && ['SCHEDULED','IN_PROGRESS'].includes(meeting.status);

  async function toggle(userId: string, formType: DeclarationFormType, received: boolean, notes?: string) {
    const key = `${userId}:${formType}`;
    setSaving(key);
    try {
      await meetings.recordDeclaration(companyId, meetingId, { userId, formType, received, notes }, jwt);
      await onRefresh();
    } finally { setSaving(null); }
  }

  const allGood = declarations.length > 0 && declarations.every((d: any) => d.forms.every((f: any) => f.received));

  return (
    <div className="max-w-3xl fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">Sec. 152 · 164 · 184 — CA2013</p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>
            Director Declarations
          </h2>
        </div>
        {declarations.length > 0 && (
          <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${allGood
            ? 'bg-[#DCFCE7]/40 border-[#BBF7D0] text-[#166534]'
            : 'bg-[#FEF3C7]/40 border-[#FDE68A] text-[#92400E]'}`}>
            {allGood ? '✓ All declarations received' : '⚠ Declarations pending'}
          </div>
        )}
      </div>

      {/* Form legend */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.entries(FORM_META) as [DeclarationFormType, any][]).map(([key, meta]) => (
          <div key={key} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-3">
            <p className="text-xs font-bold text-zinc-200">{meta.label}</p>
            <p className="text-[10px] text-[#96908A] mt-0.5">{meta.law}</p>
            <p className="text-[10px] text-[#96908A] mt-1">{meta.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {declarations.map((dir: any) => (
          <div key={dir.userId} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-zinc-200">{dir.name}</p>
                <p className="text-[#96908A] text-[11px]">{dir.email}</p>
              </div>
              {dir.isWorkspaceAdmin && (
                <span className="text-[9px] font-bold bg-amber-900/40 text-[#92400E] border border-[#FDE68A]/30 px-1.5 py-0.5 rounded-full">
                  WS Admin
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {dir.forms.map((form: any) => {
                const key = `${dir.userId}:${form.formType}`;
                const meta = FORM_META[form.formType as DeclarationFormType];
                const isSaving = saving === key;

                return (
                  <div key={form.formType} className={`rounded-lg p-3 border transition-all
                    ${form.received
                      ? 'bg-[#DCFCE7]/30 border-green-800/30'
                      : 'bg-[#EBE6DF] border-[#E0DAD2]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-[#5C5750]">{meta.label}</span>
                      {form.received
                        ? <span className="text-[#166534] text-[10px] font-semibold">✓ Received</span>
                        : <span className="text-[#96908A] text-[10px]">Pending</span>}
                    </div>

                    {form.notes && (
                      <p className="text-[#96908A] text-[10px] mb-2 italic truncate">{form.notes}</p>
                    )}

                    {/* MBP-1 notes input */}
                    {noteOpen === key && (
                      <div className="mb-2">
                        <input
                          autoFocus
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Interests disclosed..."
                          className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded px-2 py-1 text-[10px] text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    )}

                    {canEdit && (
                      <div className="flex gap-1.5 mt-1">
                        <button
                          disabled={isSaving}
                          onClick={() => {
                            if (form.formType === 'MBP_1' && !form.received && noteOpen !== key) {
                              setNoteOpen(key); setNoteText(form.notes ?? ''); return;
                            }
                            toggle(dir.userId, form.formType, !form.received, noteOpen === key ? noteText : form.notes);
                            if (noteOpen === key) setNoteOpen(null);
                          }}
                          className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-all
                            ${form.received
                              ? 'border-red-700/40 text-[#991B1B] hover:bg-[#FEE2E2]/20'
                              : 'border-[#BBF7D0]/40 text-[#166534] hover:bg-[#DCFCE7]/20'}
                            ${isSaving ? 'opacity-50' : ''}`}>
                          {isSaving ? '…' : form.received ? 'Mark Not Received' : 
                            (form.formType === 'MBP_1' && noteOpen !== key ? 'Add Notes & Receive' : 'Mark Received')}
                        </button>
                        {noteOpen === key && (
                          <button onClick={() => setNoteOpen(null)}
                            className="text-[10px] text-[#96908A] hover:text-[#5C5750] px-1">✕</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Attendance Panel ──────────────────────────────────────────────────────────

// ── Roll Call Panel (Attendance) ─────────────────────────────────────────────
//
// Used by the Chairperson after being elected (agenda item 1).
// Chairperson marks each director as IN_PERSON, VIDEO, PHONE, or ABSENT.
// For VIDEO/PHONE the location and no-third-party confirmation are recorded
// per SS-1 Rule 3(4). Quorum is calculated live and displayed.
//
// This replaces the old self-mark + request flow. There is no pre-meeting
// attendance step — roll call happens inside the meeting, taken by the Chair.

function AttendancePanel({ companyId, meetingId, jwt, meeting, attendance, currentUserId, isChairperson, isCS, onRefresh }: any) {
  const [saving,       setSaving]       = useState<string | null>(null);
  const [err,          setErr]          = useState('');
  // Per-row location input — only shown for VIDEO/PHONE modes
  const [locationInputs, setLocationInputs] = useState<Record<string, string>>({});
  const [ntpChecks,      setNtpChecks]      = useState<Record<string, boolean>>({});
  const [expandedRow,    setExpandedRow]    = useState<string | null>(null);

  const canRecord = isChairperson || isCS;

  const present = attendance.filter((a: any) => {
    const mode = a.attendance?.mode;
    return mode && !['ABSENT'].includes(mode);
  });
  const total          = attendance.length;
  const quorumRequired = Math.max(2, Math.ceil(total / 3));
  const quorumMet      = present.length >= quorumRequired;

  async function record(userId: string, mode: AttendanceMode, location?: string, noThirdParty?: boolean) {
    setSaving(userId); setErr('');
    try {
      await meetings.recordAttendance(companyId, meetingId, {
        userId, mode,
        ...(location     !== undefined ? { location }     : {}),
        ...(noThirdParty !== undefined ? { noThirdParty } : {}),
      }, jwt);
      setExpandedRow(null);
      setLocationInputs(prev => { const n = {...prev}; delete n[userId]; return n; });
      setNtpChecks(prev => { const n = {...prev}; delete n[userId]; return n; });
      await onRefresh();
    } catch (e: any) {
      setErr(e?.body?.message ?? 'Could not record attendance');
    } finally { setSaving(null); }
  }

  function handleModeClick(userId: string, mode: AttendanceMode) {
    if (mode === 'VIDEO' || mode === 'PHONE') {
      // Expand the row to collect location + noThirdParty first
      setExpandedRow(expandedRow === userId + mode ? null : userId + mode);
    } else {
      record(userId, mode);
    }
  }

  if (meeting.status !== 'IN_PROGRESS') {
    return (
      <div className="max-w-2xl fade-up">
        <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">Roll Call</p>
        <h2 className="text-white text-xl font-bold mb-4" style={{fontFamily:"'Playfair Display',serif"}}>Attendance</h2>
        <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-5 py-4 text-[#96908A] text-sm">
          Roll call is taken by the Chairperson after the meeting opens.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">SS-1 · Sec. 174 · Roll Call</p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Attendance</h2>
        </div>
        <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${quorumMet
          ? 'bg-[#DCFCE7]/40 border-[#BBF7D0] text-[#166534]'
          : 'bg-[#FEE2E2]/40 border-[#FECACA] text-[#991B1B]'}`}>
          {quorumMet ? '✓ Quorum Met' : '✕ Quorum Not Met'}
          <span className="block text-[10px] font-normal opacity-70 mt-0.5">
            {present.length} of {total} present · min {quorumRequired} required
          </span>
        </div>
      </div>

      {/* Chairperson instruction */}
      {canRecord ? (
        <div className="mb-5 bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-3 text-[#5C5750] text-xs leading-relaxed">
          Call the roll — mark each director's mode of attendance.
          For Video or Phone, confirm their location and that no third party is present (SS-1 Rule 3(4)).
        </div>
      ) : (
        <div className="mb-5 bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-3 text-[#96908A] text-xs leading-relaxed">
          Attendance is being recorded by the Chairperson.
        </div>
      )}

      {err && <p className="text-[#991B1B] text-xs mb-4 bg-[#FEE2E2]/30 border border-[#FECACA] rounded-lg px-3 py-2">{err}</p>}

      <div className="space-y-2">
        {attendance.map((dir: any) => {
          const mode     = dir.attendance?.mode ?? null;
          const isSaving = saving === dir.userId;
          const rowKey   = (m: string) => dir.userId + m;
          const location = locationInputs[dir.userId] ?? '';
          const ntp      = ntpChecks[dir.userId] ?? false;

          const modeColor = (m: string | null) => {
            if (!m) return 'text-[#96908A]';
            if (m === 'ABSENT')    return 'text-[#991B1B]';
            if (m === 'IN_PERSON') return 'text-[#166534]';
            return 'text-[#8B1A1A]';
          };
          const modeLabel = (m: string | null) =>
            !m ? '—' : m === 'IN_PERSON' ? 'In Person' : m.charAt(0) + m.slice(1).toLowerCase();

          return (
            <div key={dir.userId} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl p-4">
              <div className="flex items-center gap-4">
                {/* Director info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-200">{dir.name}</p>
                    {dir.userId === currentUserId && (
                      <span className="text-[9px] font-bold bg-blue-900/40 text-[#8B1A1A] border border-blue-700/30 px-1.5 py-0.5 rounded-full">you</span>
                    )}
                    {meeting.chairpersonId === dir.userId && (
                      <span className="text-[9px] font-bold bg-purple-900/40 text-[#6B21A8] border border-purple-700/30 px-1.5 py-0.5 rounded-full">Chairperson</span>
                    )}
                    {dir.role === 'COMPANY_SECRETARY' && (
                      <span className="text-[9px] font-bold bg-indigo-900/40 text-indigo-400 border border-indigo-700/30 px-1.5 py-0.5 rounded-full">CS</span>
                    )}
                  </div>
                  {dir.attendance?.location && (
                    <p className="text-[#96908A] text-[10px] mt-0.5">📍 {dir.attendance.location}</p>
                  )}
                </div>

                {/* Current mode */}
                <span className={`text-xs font-semibold flex-shrink-0 ${modeColor(mode)}`}>
                  {modeLabel(mode)}
                </span>
              </div>

              {/* Action buttons — chairperson/CS only */}
              {canRecord && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['IN_PERSON', 'VIDEO', 'PHONE', 'ABSENT'] as AttendanceMode[]).map(m => (
                    <button
                      key={m}
                      disabled={isSaving}
                      onClick={() => handleModeClick(dir.userId, m)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-50 ${
                        mode === m
                          ? m === 'ABSENT'    ? 'bg-[#FEE2E2]/60 border-red-700/60 text-[#991B1B]'
                          : m === 'IN_PERSON' ? 'bg-[#DCFCE7]/60 border-[#BBF7D0]/60 text-[#166534]'
                          : 'bg-[#F5E6E6] border-blue-700/60 text-[#8B1A1A]'
                          : 'bg-transparent border-[#E0DAD2]/40 text-[#96908A] hover:text-[#5C5750] hover:border-zinc-600'
                      }`}
                    >
                      {isSaving && mode !== m ? '…' : m === 'IN_PERSON' ? '◉ In Person' : m === 'VIDEO' ? '▶ Video' : m === 'PHONE' ? '◌ Phone' : '✕ Absent'}
                    </button>
                  ))}
                </div>
              )}

              {/* Location + noThirdParty form — shown for VIDEO or PHONE */}
              {canRecord && (expandedRow === rowKey('VIDEO') || expandedRow === rowKey('PHONE')) && (
                <div className="mt-3 bg-[#F5F2EE] border border-[#E0DAD2] rounded-xl p-3 space-y-3">
                  <p className="text-[#5C5750] text-[11px] font-semibold">
                    SS-1 Rule 3(4) — Confirm remote attendance details for {dir.name}
                  </p>
                  <input
                    value={location}
                    onChange={e => setLocationInputs(prev => ({...prev, [dir.userId]: e.target.value}))}
                    placeholder="Location (e.g. Mumbai, Maharashtra)"
                    className="w-full bg-[#EBE6DF] border border-[#E0DAD2] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600"
                  />
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ntp}
                      onChange={e => setNtpChecks(prev => ({...prev, [dir.userId]: e.target.checked}))}
                      className="mt-0.5 flex-shrink-0"
                      style={{ accentColor: '#34D399', width: 13, height: 13 }}
                    />
                    <span className="text-[11px] text-[#5C5750] leading-relaxed">
                      Director confirms no third party is present at their location
                      <span className="text-[#96908A]"> (SS-1 Rule 3(4)(ii))</span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      disabled={isSaving || !location.trim() || !ntp}
                      onClick={() => record(
                        dir.userId,
                        expandedRow === rowKey('VIDEO') ? 'VIDEO' : 'PHONE',
                        location, ntp
                      )}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-900/50 border border-blue-700/50 text-[#8B1A1A] disabled:opacity-50 hover:bg-blue-900/70 transition-colors"
                    >
                      {isSaving ? '…' : '✓ Confirm'}
                    </button>
                    <button
                      onClick={() => setExpandedRow(null)}
                      className="px-3 py-1.5 text-[11px] text-[#96908A] hover:text-[#5C5750]"
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {attendance.length === 0 && (
        <p className="text-[#96908A] text-sm text-center py-10">No members found.</p>
      )}
    </div>
  );
}
// ── Resolutions Panel ─────────────────────────────────────────────────────────

function ResolutionsPanel({ companyId, meetingId: meetingIdProp, jwt, meeting, resolutions, activeAgendaItem, currentUserId, onRefresh, isAdmin, isChairperson, vaultDocs }: any) {
  const meetingId = meetingIdProp as string;
  const reload = onRefresh;
  const [showAdd, setShowAdd] = useState(false);
  const canAdd = !['VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED'].includes(meeting.status);

  const itemType = (activeAgendaItem as any)?.itemType ?? 'STANDARD';

  // ── Route to specialised inline surfaces based on agenda item type ──────────
  if (itemType === 'COMPLIANCE_NOTING') {
    return (
      <ComplianceNotingInline
        companyId={companyId} meetingId={meetingId} jwt={jwt}
        meeting={meeting} isChairperson={isChairperson}
        agendaItem={activeAgendaItem}
      />
    );
  }

  if (itemType === 'DOCUMENT_NOTING' || itemType === 'VAULT_DOC_NOTING') {
    return (
      <DocumentNotingInline
        companyId={companyId} meetingId={meetingId} jwt={jwt}
        meeting={meeting} resolutions={resolutions}
        isChairperson={isChairperson} vaultDocs={vaultDocs}
        agendaItem={activeAgendaItem} onRefresh={onRefresh}
      />
    );
  }

  // ── Closure item — detect by title ─────────────────────────────────────────
  const isMinutesRecorder = meeting.minutesRecorderId === currentUserId;
  const canClose          = isChairperson || isMinutesRecorder;
  const isClosureItem     = (activeAgendaItem as any)?.title?.toLowerCase().includes('declaration of meeting closure');
  const alreadyClosed     = !!(meeting as any).conclusionTime;

  if (isClosureItem && ['IN_PROGRESS','VOTING'].includes(meeting.status)) {
    return (
      <ClosurePanel
        companyId={companyId} meetingId={meetingId} jwt={jwt}
        meeting={meeting} canClose={canClose} alreadyClosed={alreadyClosed}
        onRefresh={reload}
      />
    );
  }

  // ── Default: standard resolution list ──────────────────────────────────────
  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">
            {activeAgendaItem ? `Agenda — ${activeAgendaItem.title}` : 'All Business Items'}
          </p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Agenda Business</h2>
        </div>
        {isAdmin && canAdd && (
          <Button size="sm" onClick={() => setShowAdd(s => !s)}>{showAdd ? '✕ Cancel' : '+ New Motion'}</Button>
        )}
      </div>
      {showAdd && (
        <div className="mb-5 fade-up">
          <AddResolutionForm companyId={companyId} meetingId={meetingId} agendaItemId={activeAgendaItem?.id}
            jwt={jwt} onAdded={() => { setShowAdd(false); onRefresh(); }} vaultDocs={vaultDocs} />
        </div>
      )}
      {resolutions.length === 0 && (
        <div className="text-center py-16 text-[#96908A]">
          <p className="text-3xl mb-3">◇</p>
          <p className="text-sm">No motions yet for this agenda item.</p>
          {isAdmin && canAdd && <button onClick={() => setShowAdd(true)} className="mt-3 text-[#8B1A1A] text-xs hover:text-[#701515]">+ Add first motion</button>}
        </div>
      )}
      <div className="space-y-4">
        {resolutions.map((res: Resolution, idx: number) => (
          <ResolutionCard key={res.id} resolution={res} index={idx + 1}
            companyId={companyId} jwt={jwt} currentUserId={currentUserId}
            meeting={meeting} isAdmin={isAdmin} isChairperson={isChairperson} onRefresh={onRefresh} activeAgendaItem={activeAgendaItem} />
        ))}
      </div>
    </div>
  );
}

// ── Resolution Card ───────────────────────────────────────────────────────────

// ── Compliance Noting Inline ─────────────────────────────────────────────────
//
// Shown when the active agenda item has itemType === 'COMPLIANCE_NOTING'.
// Renders the full director × form matrix inline in the main panel — same
// logic as DocNotesPanel but without navigation away from the agenda.

const FORM_META_INLINE: Record<string, { label: string; description: string; law: string }> = {
  DIR_2: { label: 'DIR-2', description: 'Consent to act as Director',       law: 'Sec. 152(5)' },
  DIR_8: { label: 'DIR-8', description: 'Non-disqualification declaration', law: 'Sec. 164(2)' },
  MBP_1: { label: 'MBP-1', description: 'Disclosure of interest',           law: 'Sec. 184(1)' },
};

function ComplianceNotingInline({ companyId, meetingId, jwt, meeting, isChairperson, agendaItem }: any) {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [noting,     setNoting]     = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ userId: string; formType: string; mode: 'options'|'exception'|'physical' } | null>(null);
  const [exceptionText, setExceptionText] = useState('');
  const [reviewed,   setReviewed]   = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vaultApi.docNotes(companyId, meetingId, jwt);
      setData(result);
    } catch { /* chairperson not yet elected */ }
    finally { setLoading(false); }
  }, [companyId, meetingId, jwt]);

  useEffect(() => { load(); }, [load]);

  async function submitNote(directorUserId: string, formType: string, status: 'NOTED'|'NOTED_WITH_EXCEPTION'|'PHYSICALLY_PRESENT', exception?: string) {
    if (!isChairperson) return;
    const key = `${directorUserId}:${formType}`;
    setNoting(key);
    try {
      await vaultApi.noteDoc(companyId, meetingId, { directorUserId, formType, status, exception: exception?.trim() || undefined }, jwt);
      setActiveCell(null); setExceptionText(''); await load();
    } catch (err: any) { alert(err?.body?.message ?? 'Failed to note document.'); }
    finally { setNoting(null); }
  }

  const deemedVenue = (meeting as any).deemedVenue ?? (meeting as any).location ?? 'deemed venue';

  if (loading) return (
    <div className="max-w-2xl fade-up flex items-center gap-3 py-8 text-[#96908A] text-sm">
      <div className="w-4 h-4 border-2 border-[#E0DAD2] border-t-blue-500 rounded-full animate-spin"/>
      Loading compliance declarations…
    </div>
  );
  if (!data) return (
    <div className="max-w-2xl fade-up bg-[#FEF3C7]/20 border border-[#FDE68A] rounded-xl px-5 py-4 text-[#92400E] text-sm">
      ⚑ Elect a Chairperson first before noting compliance declarations.
    </div>
  );

  const missingDocs = data.rows.flatMap((r: any) =>
    r.forms.filter((f: any) => !f.complianceDoc?.submittedAt).map((f: any) => `${r.name} — ${FORM_META_INLINE[f.formType]?.label ?? f.formType}`)
  );

  return (
    <div className="max-w-2xl fade-up space-y-4">
      <div>
        <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">
          {agendaItem?.title ?? 'Director Declarations'}
        </p>
        <h2 className="text-white text-xl font-bold mb-1" style={{fontFamily:"'Playfair Display',serif"}}>
          Compliance Declarations
        </h2>
        <p className="text-[#96908A] text-xs">
          The Chairperson must open and note each director's statutory declaration before proceeding.
        </p>
      </div>

      {/* Progress */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${data.allNoted ? 'bg-[#DCFCE7]/20 border-green-800/30' : 'bg-[#FDFCFB] border-[#E0DAD2]'}`}>
        <p className={`text-sm font-semibold ${data.allNoted ? 'text-[#166534]' : 'text-[#5C5750]'}`}>
          {data.allNoted ? '✓ All declarations noted' : `${data.totalNoted} of ${data.totalRequired} noted`}
        </p>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-[#EBE6DF] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${data.totalRequired > 0 ? Math.round(data.totalNoted / data.totalRequired * 100) : 0}%`, background: data.allNoted ? '#34D399' : '#4F7FFF' }} />
          </div>
          <span className="text-[#96908A] text-xs">{data.totalRequired > 0 ? Math.round(data.totalNoted / data.totalRequired * 100) : 0}%</span>
        </div>
      </div>

      {missingDocs.length > 0 && (
        <div className="bg-[#FEF3C7]/20 border border-[#FDE68A] rounded-xl px-4 py-3">
          <p className="text-[#92400E] text-xs font-semibold mb-1">⚠ {missingDocs.length} form{missingDocs.length > 1 ? 's' : ''} not uploaded to vault</p>
          <p className="text-[#96908A] text-xs">These can still be noted as physically present at {deemedVenue}.</p>
        </div>
      )}

      {/* Director × Form matrix */}
      <div className="space-y-3">
        {data.rows.map((row: any) => (
          <div key={row.userId} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl overflow-hidden">
            <div className="bg-[#1a1e26] border-b border-[#E0DAD2] px-4 py-2.5 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-zinc-200">{row.name}</span>
                <span className="text-[#96908A] text-[11px] ml-2">{row.email}</span>
              </div>
              <span className="text-[10px] font-bold text-[#96908A] uppercase tracking-wider">{row.role}</span>
            </div>
            <div className={`grid gap-0`} style={{ gridTemplateColumns: `repeat(${row.forms.length}, 1fr)` }}>
              {row.forms.map((cell: any, ci: number) => {
                const cellKey   = `${row.userId}:${cell.formType}`;
                const noted     = !!cell.note;
                const hasDoc    = !!cell.complianceDoc?.submittedAt;
                const rawUrl    = cell.complianceDoc?.downloadUrl ?? null;
                const downloadUrl = rawUrl ? resolveDownloadUrl(rawUrl, jwt) : null;
                const hasReviewed = reviewed.has(cellKey);
                const isActive  = activeCell?.userId === row.userId && activeCell?.formType === cell.formType;
                const isNoting  = noting === cellKey;
                const meta      = FORM_META_INLINE[cell.formType] ?? { label: cell.formType, description: '', law: '' };
                const noteColor = cell.note?.status === 'NOTED' ? '#34D399' : cell.note?.status === 'PHYSICALLY_PRESENT' ? '#60A5FA' : '#FBBF24';
                const noteLabel = cell.note?.status === 'NOTED' ? '✓ Noted' : cell.note?.status === 'PHYSICALLY_PRESENT' ? '✓ Physical' : '⚠ Exception';

                return (
                  <div key={cell.formType} className="p-3.5" style={{ borderRight: ci < row.forms.length - 1 ? '1px solid #232830' : 'none' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-[#5C5750]">{meta.label}</span>
                      <span className="text-[10px] text-[#96908A]">{meta.law}</span>
                    </div>
                    <p className="text-[10px] text-[#96908A] mb-2 leading-tight">{meta.description}</p>

                    {/* Doc link */}
                    {hasDoc && downloadUrl ? (
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                        onClick={() => setReviewed(prev => new Set(prev).add(cellKey))}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border mb-2 transition-colors ${hasReviewed ? 'text-[#166534] border-[#BBF7D0] bg-[#DCFCE7]/20' : 'text-[#8B1A1A] border-[#ECC9C9] bg-blue-950/10 hover:bg-[#F5E6E6]'}`}>
                        {hasReviewed ? '✓' : '↗'} {cell.complianceDoc.fileName?.slice(0, 20) ?? 'Open'}
                      </a>
                    ) : (
                      <span className="inline-block text-[10px] font-bold text-[#991B1B] bg-[#FEE2E2]/30 border border-[#FECACA] px-2 py-0.5 rounded mb-2">Not uploaded</span>
                    )}

                    {/* Action */}
                    {noted ? (
                      <p className="text-xs font-semibold" style={{ color: noteColor }}>{noteLabel}</p>
                    ) : isChairperson ? (
                      !isActive ? (
                        <div className="flex flex-col gap-1">
                          {hasDoc && (
                            <button
                              onClick={() => hasReviewed && setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'options' })}
                              disabled={!hasReviewed}
                              className="text-[11px] font-semibold text-[#8B1A1A] disabled:text-[#C8C0B5] disabled:cursor-not-allowed"
                              title={!hasReviewed ? 'Open doc above first' : undefined}>
                              {isNoting ? '…' : hasReviewed ? 'Note ›' : 'Open doc first'}
                            </button>
                          )}
                          <button
                            onClick={() => setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'physical' })}
                            className="text-[11px] font-semibold text-[#5C5750] hover:text-[#8B1A1A] transition-colors">
                            Physical ›
                          </button>
                        </div>
                      ) : activeCell?.mode === 'options' ? (
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => submitNote(row.userId, cell.formType, 'NOTED')}
                            className="text-[11px] font-semibold text-[#166534] bg-[#DCFCE7]/30 border border-green-800/30 px-2 py-1 rounded cursor-pointer">✓ Note</button>
                          <button onClick={() => setActiveCell({ userId: row.userId, formType: cell.formType, mode: 'exception' })}
                            className="text-[11px] font-semibold text-[#92400E] bg-[#FEF3C7]/30 border border-[#FDE68A] px-2 py-1 rounded cursor-pointer">⚠</button>
                          <button onClick={() => setActiveCell(null)} className="text-[11px] text-[#96908A] px-1">✕</button>
                        </div>
                      ) : activeCell?.mode === 'exception' ? (
                        <div className="space-y-1">
                          <textarea value={exceptionText} onChange={e => setExceptionText(e.target.value)} rows={2} placeholder="Describe exception…"
                            className="w-full bg-[#F5F2EE] border border-[#FDE68A] rounded px-2 py-1 text-[11px] text-[#5C5750] resize-none focus:outline-none"/>
                          <div className="flex gap-1">
                            <button onClick={() => submitNote(row.userId, cell.formType, 'NOTED_WITH_EXCEPTION', exceptionText)} disabled={!exceptionText.trim()}
                              className="text-[11px] font-semibold text-[#92400E] disabled:opacity-40 cursor-pointer">Save</button>
                            <button onClick={() => setActiveCell(null)} className="text-[11px] text-[#96908A]">Cancel</button>
                          </div>
                        </div>
                      ) : activeCell?.mode === 'physical' ? (
                        <div className="bg-[#F5F2EE] border border-[#E0DAD2]/40 rounded p-2 space-y-1">
                          <p className="text-[10px] text-[#5C5750]">Confirm {meta.label} physically present at {deemedVenue}</p>
                          <div className="flex gap-1">
                            <button onClick={() => submitNote(row.userId, cell.formType, 'PHYSICALLY_PRESENT', `${meta.label} physically present at ${deemedVenue}`)}
                              className="text-[11px] font-semibold text-[#8B1A1A] cursor-pointer">✓ Confirm</button>
                            <button onClick={() => setActiveCell(null)} className="text-[11px] text-[#96908A]">Cancel</button>
                          </div>
                        </div>
                      ) : null
                    ) : (
                      <span className="text-[11px] text-[#96908A] italic">Awaiting Chair</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Document Noting Inline ─────────────────────────────────────────────────────
//
// Shown when the active agenda item has itemType === 'DOCUMENT_NOTING'.
// Renders one card per NOTING resolution under this agenda item.
// Each card shows the document source (vault / external / physical) and lets
// the Chairperson confirm evidence and place on record — all inline.

function DocumentNotingInline({ companyId, meetingId, jwt, meeting, resolutions, isChairperson, vaultDocs, agendaItem, onRefresh }: any) {
  const notingResolutions = resolutions.filter((r: any) => r.type === 'NOTING');
  const vaultDocType = (agendaItem as any)?.vaultDocType;
  const docLabel     = (agendaItem as any)?.docLabel ?? agendaItem?.title ?? 'Document';

  // If no NOTING resolutions yet under this item, show a prompt
  if (notingResolutions.length === 0) {
    return (
      <div className="max-w-2xl fade-up">
        <div className="mb-4">
          <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">
            {agendaItem?.title ?? 'Document Noting'}
          </p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>
            Document Noting
          </h2>
        </div>
        <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-5 py-6 text-center">
          <p className="text-[#96908A] text-sm mb-1">No noting item yet for this agenda.</p>
          <p className="text-[#96908A] text-xs">This was not auto-created — the document may not have been in the vault when the meeting was set up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl fade-up space-y-4">
      <div>
        <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">
          {agendaItem?.title ?? 'Document Noting'}
        </p>
        <h2 className="text-white text-xl font-bold mb-1" style={{fontFamily:"'Playfair Display',serif"}}>
          Document Noting
        </h2>
        <p className="text-[#96908A] text-xs">
          Chairperson must confirm document evidence before placing on record.
        </p>
      </div>
      <div className="space-y-4">
        {notingResolutions.map((res: Resolution, idx: number) => (
          <ResolutionCard key={res.id} resolution={res} index={idx + 1}
            companyId={companyId} jwt={jwt} currentUserId=""
            meeting={meeting} isAdmin={false} isChairperson={isChairperson} onRefresh={onRefresh} activeAgendaItem={agendaItem} />
        ))}
      </div>
    </div>
  );
}

// ── Resolution Card ───────────────────────────────────────────────────────────
//
// Renders one resolution. For NOTING type it shows the document evidence UI —
// the chairperson must confirm at least one of three evidence paths before
// "Place on Record" is enabled.

const PLATFORM_META: Record<string, { label: string; icon: string; urlHint: string }> = {
  'MCA21':        { label: 'MCA21 Portal',  icon: '🏛', urlHint: 'https://www.mca.gov.in/...' },
  'Google Drive': { label: 'Google Drive',  icon: '📁', urlHint: 'https://drive.google.com/...' },
  'Dropbox':      { label: 'Dropbox',       icon: '📦', urlHint: 'https://www.dropbox.com/...' },
  'OneDrive':     { label: 'OneDrive',      icon: '☁',  urlHint: 'https://onedrive.live.com/...' },
  'Other':        { label: 'Other URL',     icon: '🔗', urlHint: 'https://...' },
};
const PLATFORMS = Object.keys(PLATFORM_META);

function ResolutionCard({ resolution, index, companyId, jwt, currentUserId, meeting, isAdmin, isChairperson, onRefresh, activeAgendaItem }: any) {
  const [expanded,  setExpanded]  = useState(resolution.status === 'VOTING');
  const [isVoting,  setIsVoting]  = useState(false);
  const [myVote,    setMyVote]    = useState<string | null>(null);
  const [castError, setCastError] = useState('');
  const [proposing, setProposing] = useState(false);
  const [noting,    setNoting]    = useState(false);
  const [evidErr,   setEvidErr]   = useState('');

  // Evidence path selection state (Path B / C — Path A is already on resolution)
  const [evidPath,    setEvidPath]    = useState<'A'|'B'|'C'|null>(null);
  const [extPlatform, setExtPlatform] = useState('MCA21');
  const [extUrl,      setExtUrl]      = useState('');
  const [savingEvid,  setSavingEvid]  = useState(false);
  // Path A: track if chairperson opened the vault doc this session
  const [openedVault, setOpenedVault] = useState(false);

  const isNoting          = resolution.type === 'NOTING';
  const ed                = resolution.exhibitDoc;
  const isMinutesRecorder = meeting.minutesRecorderId === currentUserId;
  const canFill           = isChairperson || isMinutesRecorder;

  // Determine confirmed evidence state from what's persisted on the resolution
  const hasVaultDoc       = !!(ed?.downloadUrl);
  const hasExternalEvid   = !!(ed?.externalDocUrl || resolution.externalDocUrl);
  const hasPhysicalEvid   = !!(ed?.physicallyPresent || resolution.physicallyPresent);
  const evidenceConfirmed = hasVaultDoc || hasExternalEvid || hasPhysicalEvid;

  // Chairperson can place on record once evidence is confirmed
  // Path A additionally needs the vault doc to be opened this session
  const canPlaceOnRecord = isNoting && (
    (hasVaultDoc    && openedVault)  ||
    hasExternalEvid                  ||
    hasPhysicalEvid
  );

  const existingVote = resolution.votes?.find((v: any) => v.user.id === currentUserId);
  const hasVoted     = !!existingVote;

  const borderColor = resolution.status === 'APPROVED' ? 'border-green-800/50'
    : resolution.status === 'REJECTED' ? 'border-red-800/50'
    : resolution.status === 'NOTED'    ? 'border-[#E0DAD2]/50'
    : resolution.status === 'VOTING'   ? 'border-[#FDE68A]'
    : 'border-[#E0DAD2]';

  const accentBar = resolution.status === 'APPROVED' ? 'bg-green-500'
    : resolution.status === 'REJECTED' ? 'bg-red-500'
    : resolution.status === 'NOTED'    ? 'bg-zinc-600'
    : resolution.status === 'VOTING'   ? 'bg-amber-500'
    : isNoting ? 'bg-zinc-700' : 'bg-[#8B1A1A]';

  async function propose() {
    // Gate: all variables in the motion text must be filled before voting opens
    if (activeAgendaItem) {
      const motionText  = (activeAgendaItem as any).motionText  ?? resolution.motionText  ?? '';
      const values      = (activeAgendaItem as any).variableValues ?? {};
      const TOKEN_RE    = /\{\{([^}]+)\}\}/g;
      let m: RegExpExecArray | null;
      const unfilled: string[] = [];
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(motionText)) !== null) {
        const key = m[1].split('|')[0].trim();
        if (!values[key]) unfilled.push(key);
      }
      if (unfilled.length > 0) {
        setCastError(`Fill all variable fields in this motion before putting it to a vote. Missing: ${unfilled.join(', ')}`);
        return;
      }
    }
    setProposing(true);
    try {
      // Propose (DRAFT → PROPOSED) then immediately open voting (PROPOSED → VOTING)
      // This is the chairperson putting the motion to the Board in one action
      await resApi.propose(companyId, resolution.id, jwt);
      await resApi.openVoting(companyId, resolution.id, jwt);
      onRefresh();
    }
    catch (e: any) { setCastError((e as any).body?.message ?? 'Could not put motion to vote'); }
    finally { setProposing(false); }
  }

  async function placeOnRecord() {
    setNoting(true); setEvidErr('');
    try { await resApi.note(companyId, resolution.id, jwt); onRefresh(); }
    catch (e: any) { setEvidErr((e as any).body?.message ?? 'Could not place on record'); }
    finally { setNoting(false); }
  }

  async function saveEvidence() {
    setSavingEvid(true); setEvidErr('');
    try {
      if (evidPath === 'B') {
        if (!extUrl.trim()) { setEvidErr('Please enter the document URL.'); return; }
        await resApi.setEvidence(companyId, resolution.id, {
          externalDocUrl: extUrl.trim(),
          externalDocPlatform: extPlatform,
        }, jwt);
      } else if (evidPath === 'C') {
        const venue = (meeting as any).deemedVenue ?? (meeting as any).location ?? 'deemed venue';
        const date  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
        await resApi.setEvidence(companyId, resolution.id, {
          physicallyPresent: true,
          physicalEvidence: `Physically present at ${venue} on ${date}`,
        }, jwt);
      }
      await onRefresh();
      setEvidPath(null);
    } catch (e: any) {
      setEvidErr((e as any).body?.message ?? 'Could not save evidence');
    } finally { setSavingEvid(false); }
  }

  async function castVote(value: string) {
    setMyVote(value); setIsVoting(true); setCastError('');
    try { await voting.castVote(companyId, resolution.id, { value: value as any }, jwt); onRefresh(); }
    catch (e: any) { setCastError((e as any).body?.message ?? 'Could not cast vote'); setMyVote(null); }
    finally { setIsVoting(false); }
  }

  const totalVotes = (resolution.tally?.APPROVE ?? 0) + (resolution.tally?.REJECT ?? 0) + (resolution.tally?.ABSTAIN ?? 0);

  return (
    <div className={`bg-[#FDFCFB] border ${borderColor} rounded-2xl overflow-hidden transition-all duration-200`}>
      <div className={`h-0.5 ${accentBar}`} />
      <button className="w-full text-left px-6 py-4 flex items-start justify-between gap-4 hover:bg-[#1d2229]"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#EBE6DF] border border-[#E0DAD2] text-[#96908A] text-[10px] font-bold flex items-center justify-center mt-0.5">
            {index}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-semibold text-sm leading-snug">{resolution.title}</p>
              {isNoting && <span className="text-[9px] bg-[#EBE6DF] border border-[#E0DAD2] text-[#96908A] px-1.5 py-0.5 rounded-full">Noting</span>}
            </div>
            {resolution.status === 'VOTING' && (
              <p className="text-[#92400E] text-[11px] mt-0.5">{totalVotes} of {resolution.directorCount ?? '?'} voted</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={resolution.status.toLowerCase()} />
          <span className="text-[#96908A] text-xs">{expanded ? '▴' : '▾'}</span>
        </div>
      </button>

      {['VOTING','APPROVED','REJECTED'].includes(resolution.status) && !isNoting && (
        <div className="px-6 pb-3">
          <VoteBar approve={resolution.tally?.APPROVE ?? 0} reject={resolution.tally?.REJECT ?? 0}
            abstain={resolution.tally?.ABSTAIN ?? 0} total={resolution.directorCount ?? 5} />
        </div>
      )}

      {expanded && (
        <div className="px-6 pb-5 fade-up space-y-4 border-t border-[#E0DAD2] pt-4">
          {/* Motion text (pre-vote) OR Resolution text (post-approval) */}
          {!isNoting && (() => {
            const isApproved = resolution.status === 'APPROVED';
            const showResText = isApproved && resolution.resolutionText;
            const displayText = showResText ? resolution.resolutionText : resolution.motionText;
            const label = isApproved
              ? 'Resolution (passed)'
              : resolution.status === 'REJECTED'
              ? 'Rejected Motion'
              : resolution.status === 'VOTING'
              ? 'Motion before the Board'
              : 'Motion';
            const borderColor = isApproved ? 'border-[#BBF7D0]' : resolution.status === 'REJECTED' ? 'border-red-800' : 'border-[#E0DAD2]';
            return (
              <div className={`bg-[#EBE6DF] border-l-2 ${borderColor} pl-4 py-3 pr-3 rounded-r-xl`}>
                <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1.5 ${isApproved ? 'text-green-600' : resolution.status === 'REJECTED' ? 'text-red-700' : 'text-[#96908A]'}`}>
                  {label}
                </p>
                <VariableTokenText
                  text={displayText ?? ''}
                  variables={(activeAgendaItem as any)?.variables}
                  values={(activeAgendaItem as any)?.variableValues ?? {}}
                  onFill={async (key, value) => {
                    if (!activeAgendaItem) return;
                    try {
                      await meetings.updateVariableValues(companyId, meeting.id, activeAgendaItem.id, { [key]: value }, jwt);
                      await onRefresh();
                    } catch {}
                  }}
                  editable={canFill}
                />
                {/* Hint for directors who cannot fill — amber tokens are visible but non-clickable */}
                {!canFill && (activeAgendaItem as any)?.variables?.length > 0 && (
                  <p className="text-[#96908A] text-[10px] mt-2 italic">
                    Amber fields to be filled by the Chairperson or Minutes Recorder before voting.
                  </p>
                )}
                {/* If approved and resolutionText exists, also show the motion text collapsed */}
                {isApproved && resolution.resolutionText && resolution.motionText && (
                  <details className="mt-2">
                    <summary className="text-[#C8C0B5] text-[10px] cursor-pointer hover:text-[#96908A]">
                      Original motion text
                    </summary>
                    <p className="text-[#96908A] text-[10px] leading-relaxed whitespace-pre-wrap mt-1">{resolution.motionText}</p>
                  </details>
                )}
              </div>
            );
          })()}
          {isNoting && (
            <div className="bg-[#EBE6DF] border-l-2 border-[#E0DAD2] pl-4 py-3 pr-3 rounded-r-xl">
              <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-1.5">Noting</p>
              <p className="text-[#5C5750] text-xs leading-relaxed whitespace-pre-wrap">{resolution.motionText}</p>
            </div>
          )}

          {/* ── Document Evidence Section (NOTING type only) ──────────────── */}
          {isNoting && resolution.status === 'DRAFT' && (
            <div className="space-y-3">
              <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold">Document Evidence</p>

              {/* Path A — SafeMinutes Vault */}
              {hasVaultDoc && (
                <div className={`rounded-xl border p-3.5 flex items-center gap-3 transition-colors ${
                  openedVault ? 'bg-[#DCFCE7]/20 border-green-800/30' : 'bg-[#EBE6DF] border-[#FDE68A]'
                }`}>
                  <span className="text-lg flex-shrink-0">{openedVault ? '✓' : '📁'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#5C5750] truncate">
                      {ed?.vaultDocLabel ?? ed?.fileName ?? 'Vault document'}
                    </p>
                    <p className="text-[10px] text-[#96908A] mt-0.5">
                      {openedVault ? 'Reviewed from SafeMinutes vault' : 'Open to review before placing on record'}
                    </p>
                  </div>
                  <a href={resolveDownloadUrl(ed!.downloadUrl!, jwt)} target="_blank" rel="noopener noreferrer"
                    onClick={() => setOpenedVault(true)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                      openedVault
                        ? 'text-[#166534] border-[#BBF7D0]/40 bg-[#DCFCE7]/30'
                        : 'text-[#8B1A1A] border-blue-700/40 bg-blue-950/30 hover:bg-blue-950/50'
                    }`}>
                    {openedVault ? '↗ Re-open' : '↗ Open'}
                  </a>
                </div>
              )}

              {/* Path B — External platform (confirmed) */}
              {hasExternalEvid && (
                <div className="rounded-xl border border-[#ECC9C9] bg-blue-950/10 p-3.5 flex items-center gap-3">
                  <span className="text-lg">{PLATFORM_META[ed?.externalDocPlatform ?? resolution.externalDocPlatform ?? 'Other']?.icon ?? '🔗'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#5C5750]">
                      {PLATFORM_META[ed?.externalDocPlatform ?? resolution.externalDocPlatform ?? 'Other']?.label ?? 'External'}
                    </p>
                    <a href={ed?.externalDocUrl ?? resolution.externalDocUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-[#8B1A1A] hover:underline truncate block max-w-xs">
                      {ed?.externalDocUrl ?? resolution.externalDocUrl}
                    </a>
                  </div>
                  <span className="text-[9px] font-bold text-[#8B1A1A] bg-blue-950 border border-[#ECC9C9] px-2 py-0.5 rounded-full">Confirmed</span>
                </div>
              )}

              {/* Path C — Physical presence (confirmed) */}
              {hasPhysicalEvid && (
                <div className="rounded-xl border border-[#E0DAD2]/40 bg-[#F5F2EE]/30 p-3.5 flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#5C5750]">Physical copy confirmed</p>
                    <p className="text-[10px] text-[#96908A] mt-0.5">
                      {ed?.physicalEvidence ?? resolution.physicalEvidence ?? 'Present at deemed venue'}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-[#5C5750] bg-[#EBE6DF] border border-[#E0DAD2] px-2 py-0.5 rounded-full">Confirmed</span>
                </div>
              )}

              {/* Evidence path selector — shown when no evidence confirmed yet */}
              {isChairperson && !evidenceConfirmed && !hasVaultDoc && evidPath === null && (
                <div className="bg-[#F5F2EE] border border-[#E0DAD2] rounded-xl p-4 space-y-2">
                  <p className="text-[#5C5750] text-xs font-semibold mb-3">How was this document reviewed?</p>
                  {[
                    { path: 'B' as const, icon: '🔗', label: 'External platform', sub: 'MCA21, Google Drive, Dropbox, etc.' },
                    { path: 'C' as const, icon: '📄', label: 'Physical copy',      sub: `Present at ${(meeting as any).deemedVenue ?? 'deemed venue'}` },
                  ].map(opt => (
                    <button key={opt.path} onClick={() => setEvidPath(opt.path)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-[#EBE6DF] border border-[#E0DAD2] rounded-xl hover:border-zinc-600 transition-all text-left">
                      <span className="text-xl flex-shrink-0">{opt.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">{opt.label}</p>
                        <p className="text-[10px] text-[#96908A] mt-0.5">{opt.sub}</p>
                      </div>
                      <span className="ml-auto text-[#C8C0B5] text-xs">→</span>
                    </button>
                  ))}
                </div>
              )}

              {/* No vault + not chairperson: show guidance */}
              {!isChairperson && !evidenceConfirmed && !hasVaultDoc && (
                <div className="bg-[#F5F2EE] border border-[#E0DAD2] rounded-xl px-4 py-3">
                  <p className="text-[#96908A] text-xs">Waiting for Chairperson to confirm document evidence.</p>
                </div>
              )}

              {/* Link to vault if vault doc not uploaded yet */}
              {isChairperson && !hasVaultDoc && (
                <a href={`/companies/${companyId}/vault`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[11px] text-[#96908A] hover:text-[#8B1A1A] transition-colors">
                  <span>📁</span>
                  <span>Upload to SafeMinutes vault instead →</span>
                </a>
              )}

              {/* Path B — External URL form */}
              {evidPath === 'B' && (
                <div className="bg-[#F5F2EE] border border-[#ECC9C9] rounded-xl p-4 space-y-3">
                  <p className="text-[#8B1A1A] text-xs font-semibold">External Platform</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PLATFORMS.map(p => (
                      <button key={p} type="button" onClick={() => setExtPlatform(p)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                          extPlatform === p
                            ? 'bg-[#F5E6E6] border-blue-700 text-[#701515]'
                            : 'bg-[#EBE6DF] border-[#E0DAD2] text-[#96908A] hover:border-zinc-600'
                        }`}>
                        <span>{PLATFORM_META[p].icon}</span>
                        <span>{PLATFORM_META[p].label}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={extUrl}
                    onChange={e => setExtUrl(e.target.value)}
                    placeholder={PLATFORM_META[extPlatform]?.urlHint ?? 'https://...'}
                    className="w-full bg-[#EBE6DF] border border-[#E0DAD2] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600"
                  />
                  {evidErr && <p className="text-[#991B1B] text-[11px]">{evidErr}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingEvid} onClick={saveEvidence} disabled={!extUrl.trim()}>
                      Confirm Link
                    </Button>
                    <button onClick={() => { setEvidPath(null); setEvidErr(''); }} className="text-[#96908A] text-xs hover:text-[#5C5750]">Cancel</button>
                  </div>
                </div>
              )}

              {/* Path C — Physical presence form */}
              {evidPath === 'C' && (
                <div className="bg-[#F5F2EE] border border-[#E0DAD2]/40 rounded-xl p-4 space-y-3">
                  <p className="text-[#5C5750] text-xs font-semibold">Confirm Physical Copy</p>
                  <p className="text-[#96908A] text-xs leading-relaxed">
                    I confirm that this document was physically present at{' '}
                    <strong className="text-[#5C5750]">{(meeting as any).deemedVenue ?? 'the deemed venue'}</strong>{' '}
                    and placed before the Board for noting.
                  </p>
                  {evidErr && <p className="text-[#991B1B] text-[11px]">{evidErr}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingEvid} onClick={saveEvidence}>
                      ✓ Confirm Physical Presence
                    </Button>
                    <button onClick={() => { setEvidPath(null); setEvidErr(''); }} className="text-[#96908A] text-xs hover:text-[#5C5750]">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTING: Place on Record ───────────────────────────────────── */}
          {isNoting && resolution.status === 'DRAFT' && isChairperson && meeting.status === 'IN_PROGRESS' && (
            <div>
              <Button size="sm" onClick={placeOnRecord} loading={noting} disabled={!canPlaceOnRecord}>
                ✓ Place on Record
              </Button>
              {!canPlaceOnRecord && (
                <p className="text-[#92400E] text-[10px] mt-2">
                  {hasVaultDoc && !openedVault
                    ? '↑ Open the vault document above first'
                    : !evidenceConfirmed
                    ? '↑ Confirm document evidence above first'
                    : ''}
                </p>
              )}
              {evidErr && <p className="text-[#991B1B] text-xs mt-1">{evidErr}</p>}
            </div>
          )}
          {isNoting && resolution.status === 'NOTED' && (
            <div className="flex items-center gap-2 text-[#96908A] text-xs">
              <span className="text-[#166534]">✓</span>
              <span>Placed on record during this meeting.</span>
              {(hasExternalEvid || hasPhysicalEvid) && (
                <span className="text-[#96908A]">·</span>
              )}
              {hasExternalEvid && (
                <span className="text-[#96908A]">
                  Via {ed?.externalDocPlatform ?? resolution.externalDocPlatform}
                </span>
              )}
              {hasPhysicalEvid && (
                <span className="text-[#96908A]">Physical copy</span>
              )}
            </div>
          )}

          {/* ── Regular resolution actions ────────────────────────────────── */}
          {!isNoting && isChairperson && ['DRAFT','PROPOSED'].includes(resolution.status) && ['IN_PROGRESS','VOTING'].includes(meeting.status) && (
            <Button size="sm" onClick={propose} loading={proposing} disabled={resolution.status === 'VOTING'}>
              {resolution.status === 'VOTING' ? 'Voting open' : 'Put Motion to Vote'}
            </Button>
          )}

          {/* Vote buttons */}
          {!isNoting && resolution.status === 'VOTING' && !hasVoted && (
            <div>
              <p className="text-[#96908A] text-xs mb-2 font-medium">Cast your vote</p>
              <div className="flex gap-2">
                {[
                  {value:'APPROVE', label:'✓ Approve', idle:'border-[#E0DAD2] text-[#5C5750] hover:border-[#BBF7D0] hover:text-[#166534]', active:'bg-[#DCFCE7]/60 border-[#BBF7D0] text-[#166534]'},
                  {value:'REJECT',  label:'✕ Reject',  idle:'border-[#E0DAD2] text-[#5C5750] hover:border-red-700 hover:text-[#991B1B]',   active:'bg-[#FEE2E2]/60 border-red-700 text-[#991B1B]'},
                  {value:'ABSTAIN', label:'— Abstain', idle:'border-[#E0DAD2] text-[#5C5750] hover:border-[#FDE68A] hover:text-[#92400E]', active:'bg-[#FEF3C7]/60 border-[#FDE68A] text-[#92400E]'},
                ].map(btn => (
                  <button key={btn.value} onClick={() => castVote(btn.value)} disabled={isVoting}
                    className={`flex-1 py-2 text-xs font-semibold border rounded-lg transition-all ${myVote === btn.value ? btn.active : btn.idle}`}>
                    {isVoting && myVote === btn.value ? '…' : btn.label}
                  </button>
                ))}
              </div>
              {castError && <p className="text-[#991B1B] text-xs mt-2">{castError}</p>}
            </div>
          )}
          {!isNoting && resolution.status === 'VOTING' && hasVoted && (
            <div className="flex items-center gap-2 py-2">
              <VotePill value={existingVote!.value} />
              <span className="text-[#96908A] text-xs">You voted</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ── ClosurePanel ──────────────────────────────────────────────────────────────
// Shown when the active agenda item is "Declaration of Meeting Closure".
// Chairperson or minutes recorder clicks to formally close the meeting and
// stamp conclusionTime — required by SS-1 Para 7.2.1.1 for the minutes header.

function ClosurePanel({ companyId, meetingId, jwt, meeting, canClose, alreadyClosed, onRefresh }: any) {
  const [closing, setClosing] = useState(false);
  const [err,     setErr]     = useState('');

  const conclusionTime = (meeting as any).conclusionTime;
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  async function handleClose() {
    setClosing(true); setErr('');
    try {
      await meetings.conclude(companyId, meetingId, jwt);
      await onRefresh();
    } catch (e: any) {
      setErr(e?.body?.message ?? 'Could not declare closure. Please try again.');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="max-w-2xl fade-up">
      <div className="mb-6">
        <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">Meeting Closure</p>
        <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Declaration of Meeting Closure</h2>
      </div>

      <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl p-6 space-y-4">
        <p className="text-[#5C5750] text-sm leading-relaxed">
          After all agenda business has been transacted, the Chairperson formally declares the meeting closed.
          The time of conclusion is recorded in the minutes as required by SS-1 Para 7.2.1.1.
        </p>

        {alreadyClosed ? (
          <div className="bg-[#DCFCE7]/30 border border-[#BBF7D0] rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-[#166534] text-lg mt-0.5">✓</span>
            <div>
              <p className="text-[#166534] text-sm font-semibold">Meeting formally closed</p>
              <p className="text-[#96908A] text-xs mt-1">
                Conclusion time recorded: <strong className="text-[#5C5750]">{fmtTime(conclusionTime)}</strong>.
                This will appear in the minutes header.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#EBE6DF] border border-[#E0DAD2] rounded-xl px-5 py-4">
            <p className="text-[#96908A] text-xs leading-relaxed mb-4">
              <strong className="text-[#5C5750]">SS-1 Para 7.2.1.1</strong> — Minutes shall state the time of commencement and conclusion of the meeting.
              Clicking below records the exact time of closure in the statutory record.
            </p>
            {canClose ? (
              <button
                onClick={handleClose}
                disabled={closing}
                className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {closing ? 'Recording…' : '⬡ Declare Meeting Closed'}
              </button>
            ) : (
              <p className="text-[#96908A] text-xs text-center italic">
                Only the Chairperson or Minutes Recorder can declare meeting closure.
              </p>
            )}
          </div>
        )}

        {err && (
          <div className="bg-[#FEE2E2]/30 border border-[#FECACA] rounded-lg px-4 py-2.5 text-[#991B1B] text-xs">
            {err}
          </div>
        )}

        <div className="pt-2 border-t border-[#E0DAD2]">
          <p className="text-[#C8C0B5] text-[10px] leading-relaxed">
            A vote of thanks to the Chairperson is customary before closure and should be noted verbally.
            If the meeting is being adjourned instead of closed, do not use this button — advance the meeting
            status and note the reason in AOB. The 120-day interval counts from the original meeting date.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Minutes Panel ─────────────────────────────────────────────────────────────

function MinutesPanel({ minutes, companyId, meetingId, jwt }: any) {
  const [exporting,  setExporting]  = useState(false);
  const [exportUrl,  setExportUrl]  = useState<string | null>(null);
  const [exportErr,  setExportErr]  = useState('');
  const [regExporting, setRegExporting] = useState(false);
  const [regUrl,       setRegUrl]       = useState<string | null>(null);
  const [regErr,       setRegErr]       = useState('');

  // Minutes are available to download from MINUTES_CIRCULATED onwards so
  // directors can review the draft PDF during the 7-day comment window.
  const canExport = ['MINUTES_CIRCULATED', 'SIGNED', 'LOCKED'].includes(minutes.status);

  async function handleExport() {
    setExporting(true);
    setExportErr('');
    try {
      const result = await minutesApi.exportPdf(companyId, meetingId, jwt);
      // Backend returns { downloadUrl, objectPath }
      const url = (result as any).downloadUrl ?? (result as any).s3Url;
      if (url) {
        setExportUrl(url);
        window.open(url, '_blank');
      }
    } catch (err: any) {
      setExportErr(err?.body?.message ?? 'PDF export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleAttendanceRegister() {
    setRegExporting(true);
    setRegErr('');
    try {
      const result = await minutesApi.exportAttendanceRegister(companyId, meetingId, jwt);
      const url = (result as any).downloadUrl;
      if (url) {
        setRegUrl(url);
        window.open(url, '_blank');
      }
    } catch (err: any) {
      setRegErr(err?.body?.message ?? 'Attendance register export failed. Please try again.');
    } finally {
      setRegExporting(false);
    }
  }

  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[#96908A] text-xs uppercase tracking-widest font-semibold mb-1">Generated Document</p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Meeting Minutes</h2>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={minutes.status.toLowerCase()} />
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              loading={exporting}
            >
              {exporting ? 'Generating…' : exportUrl ? '↗ Open PDF' : '⬇ Download PDF'}
            </Button>
          )}
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAttendanceRegister}
              loading={regExporting}
            >
              {regExporting ? 'Generating…' : regUrl ? '↗ Attendance Register' : '⬇ Attendance Register'}
            </Button>
          )}
        </div>
      </div>

      {exportErr && (
        <div className="mb-4 bg-[#FEE2E2]/30 border border-[#FECACA] rounded-lg px-4 py-2.5 text-[#991B1B] text-xs">
          {exportErr}
        </div>
      )}
      {regErr && (
        <div className="mb-4 bg-[#FEE2E2]/30 border border-[#FECACA] rounded-lg px-4 py-2.5 text-[#991B1B] text-xs">
          {regErr}
        </div>
      )}

      {minutes.signatureHash && (
        <div className="mb-5 bg-[#DCFCE7]/30 border border-green-800/30 rounded-xl p-3.5 flex items-start gap-3">
          <span className="text-[#166534] text-lg mt-0.5">✓</span>
          <div>
            <p className="text-[#166534] text-xs font-semibold mb-0.5">Digitally Signed</p>
            <p className="text-[#96908A] text-[10px] font-mono break-all">{minutes.signatureHash}</p>
          </div>
        </div>
      )}
      <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl p-7 prose-sm text-[#5C5750]"
        style={{fontSize:'13px',lineHeight:'1.8'}}
        dangerouslySetInnerHTML={{__html: minutes.content}} />
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

// ProposeAgendaForm — used during IN_PROGRESS meetings
// Any director can propose an AOB item (pending chairperson admission).
// Before meeting starts, chairperson/admin can add agenda items directly.
function ProposeAgendaForm({ companyId, meetingId, jwt, isChairperson, meetingStatus, onAdded }: any) {
  const [open,    setOpen]    = useState(false);
  const [title,   setTitle]   = useState('');
  const [desc,    setDesc]    = useState('');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  const isLive = meetingStatus === 'IN_PROGRESS';

  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim()) return;
    setLoading(true); setErr('');
    try {
      if (isLive) {
        // During meeting — propose as AOB (chairperson admission required)
        await meetings.proposeAob(companyId, meetingId, { title: title.trim(), description: desc.trim() || undefined }, jwt);
      } else {
        // Before meeting — add directly
        await meetings.addAgendaItem(companyId, meetingId, { title: title.trim(), description: desc.trim() || undefined }, jwt);
      }
      setTitle(''); setDesc(''); setOpen(false); onAdded();
    } catch (e: any) {
      setErr(e?.body?.message ?? 'Could not add item');
    } finally { setLoading(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-[#96908A] text-xs hover:text-[#5C5750] w-full text-left">
      {isLive ? '+ Propose AOB item' : '+ Add agenda item'}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-2 fade-up">
      {isLive && (
        <p className="text-[#96908A] text-[10px] leading-tight">
          Proposed as AOB — Chairperson must admit before discussion.
        </p>
      )}
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Item title"
        className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600"/>
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
        placeholder="Brief description (optional)"
        className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600 resize-none"/>
      {err && <p className="text-[#991B1B] text-[10px]">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="text-[11px] text-[#8B1A1A] font-medium disabled:opacity-50">
          {loading ? '…' : isLive ? 'Propose' : 'Add'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setErr(''); }}
          className="text-[11px] text-[#96908A]">Cancel</button>
      </div>
    </form>
  );
}

function AddResolutionForm({ companyId, meetingId, agendaItemId, jwt, onAdded, vaultDocs }: any) {
  const [title,          setTitle]          = useState('');
  const [motionText,     setMotionText]     = useState('I move that the Board authorise ');
  const [resolutionText, setResolutionText] = useState('RESOLVED THAT ');
  const [type,           setType]           = useState<'MEETING'|'NOTING'>('MEETING');
  const [vaultDocId,     setVaultDocId]     = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');

  function switchType(t: 'MEETING'|'NOTING') {
    setType(t);
    if (t === 'NOTING') {
      setMotionText('');
      setResolutionText('');
    } else {
      setMotionText('I move that the Board authorise ');
      setResolutionText('RESOLVED THAT ');
    }
  }

  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim()) return;
    if (type === 'MEETING' && !motionText.trim()) return;
    setLoading(true); setError('');
    try {
      await resApi.create(companyId, meetingId, {
        title,
        motionText:     type === 'NOTING' ? 'Noting item' : motionText.trim(),
        resolutionText: type === 'MEETING' && resolutionText.trim() ? resolutionText.trim() : undefined,
        agendaItemId,
        type,
        ...(type === 'NOTING' && vaultDocId ? { vaultDocId } : {}),
      }, jwt);
      onAdded();
    }
    catch (err: any) { setError((err as any).body?.message ?? 'Could not create motion'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="bg-[#EBE6DF] border border-[#E0DAD2] rounded-2xl p-5 space-y-4">
      <p className="text-[#5C5750] text-sm font-semibold">New Motion</p>

      {/* Type selector */}
      <div className="flex gap-2">
        {[{v:'MEETING',l:'Motion (requires vote)'},{v:'NOTING',l:'Noting Item (on record)'}].map(t => (
          <button key={t.v} type="button" onClick={() => switchType(t.v as any)}
            className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border transition-all ${type === t.v
              ? 'bg-[#F5E6E6] border-blue-700 text-[#701515]'
              : 'bg-transparent border-[#E0DAD2] text-[#96908A] hover:text-[#5C5750]'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Title */}
      <div>
        <label className="text-[#96908A] text-[10px] uppercase tracking-widest block mb-1.5">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder={type === 'NOTING' ? 'e.g. Noting of Certificate of Incorporation' : 'e.g. Opening of Bank Account'}
          required className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-[#C8C0B5] focus:outline-none focus:border-blue-600"/>
      </div>

      {type === 'MEETING' && (<>
        {/* Motion text — what directors vote on */}
        <div>
          <label className="text-[#96908A] text-[10px] uppercase tracking-widest block mb-1">Motion Text</label>
          <p className="text-[#C8C0B5] text-[10px] mb-1.5">Shown to directors while voting. Use plain proposal language — no "RESOLVED THAT".</p>
          <Textarea value={motionText} onChange={e => setMotionText(e.target.value)} rows={3} required minLength={10}
            placeholder='I move that the Board authorise the opening of a current account with [Bank Name]...' />
        </div>

        {/* Resolution text — what goes in minutes if passed */}
        <div>
          <label className="text-[#96908A] text-[10px] uppercase tracking-widest block mb-1">Resolution Text <span className="text-[#C8C0B5] normal-case tracking-normal">(if motion passes)</span></label>
          <p className="text-[#C8C0B5] text-[10px] mb-1.5">Printed in minutes and certified copies. Use "RESOLVED THAT..." format.</p>
          <Textarea value={resolutionText} onChange={e => setResolutionText(e.target.value)} rows={4}
            placeholder='RESOLVED THAT the Company be and is hereby authorised to open a current account with [Bank Name]...' />
        </div>
      </>)}

      {type === 'NOTING' && vaultDocs?.length > 0 && (
        <div>
          <label className="text-[#96908A] text-[10px] uppercase tracking-widest block mb-1.5">
            Link Exhibit Document <span className="text-[#C8C0B5]">(optional)</span>
          </label>
          <select value={vaultDocId} onChange={e => setVaultDocId(e.target.value)}
            className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600">
            <option value="">No document linked</option>
            {(vaultDocs as any[]).map((d: any) => (
              <option key={d.id} value={d.id}>{d.label || d.fileName} ({d.docType})</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-[#991B1B] text-xs">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={loading}>Add {type === 'NOTING' ? 'Noting Item' : 'Motion'}</Button>
      </div>
    </form>
  );
}

function VotePill({ value }: { value: string }) {
  const map: Record<string,string> = {
    APPROVE: 'bg-[#DCFCE7] text-[#166534] border-green-800/50',
    REJECT:  'bg-[#FEE2E2] text-[#991B1B] border-red-800/50',
    ABSTAIN: 'bg-[#FEF3C7] text-[#92400E] border-amber-800/50',
  };
  const labels: Record<string,string> = { APPROVE: '✓ Approve', REJECT: '✕ Reject', ABSTAIN: '— Abstain' };
  return (
    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[value] ?? ''}`}>
      {labels[value] ?? value}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="h-screen bg-[#F5F2EE] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="w-8 h-8" />
        <p className="text-[#96908A] text-sm">Loading meeting…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-screen bg-[#F5F2EE] flex items-center justify-center">
      <div className="bg-[#FEE2E2]/40 border border-[#FECACA] rounded-2xl p-8 text-center max-w-sm">
        <p className="text-[#991B1B] text-sm mb-4">{message}</p>
        <button onClick={() => window.location.reload()} className="text-[#8B1A1A] text-xs hover:underline">Retry</button>
      </div>
    </div>
  );
}

// ── Meeting Documents Panel ───────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'DRAFT_NOTICE',     label: 'Draft Notice' },
  { value: 'DRAFT_AGENDA',     label: 'Draft Agenda' },
  { value: 'SUPPORTING_PAPER', label: 'Supporting Paper' },
  { value: 'DRAFT_RESOLUTION', label: 'Draft Motion' },
  { value: 'CUSTOM',           label: 'Other Document' },
];

function MeetingDocumentsPanel({
  companyId, meetingId, token, canManage,
}: { companyId: string; meetingId: string; token: string; canManage: boolean }) {
  const [docs,       setDocs]       = useState<MeetingDocument[]>([]);
  const [shareLink,  setShareLink]  = useState<MeetingShareLink | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [showForm,   setShowForm]   = useState(false);
  const [title,      setTitle]      = useState('');
  const [docType,    setDocType]    = useState('DRAFT_AGENDA');
  const [isShared,   setIsShared]   = useState(false);
  const [copied,     setCopied]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        vaultApi.meetingDocs(companyId, meetingId, token),
        fetch(`${API}/companies/${companyId}/meetings/${meetingId}/share`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setDocs(d);
      setShareLink(s);
    } finally { setLoading(false); }
  }, [companyId, meetingId, token]);

  useEffect(() => { load(); }, [load]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
    setShowForm(true);
  }

  async function handleUpload() {
    if (!pendingFile || !title.trim()) return;
    setUploading(true); setUploadPct(30);
    try {
      await vaultApi.uploadMeetingDoc(companyId, meetingId, pendingFile, {
        title: title.trim(), docType, isShared,
      }, token);
      setUploadPct(100);
      setShowForm(false); setTitle(''); setDocType('DRAFT_AGENDA'); setIsShared(false); setPendingFile(null);
      await load();
    } catch (err: any) {
      alert(err?.message ?? 'Upload failed. Please try again.');
    } finally { setUploading(false); setUploadPct(0); }
  }

  async function toggleShared(doc: MeetingDocument) {
    await vaultApi.toggleShared(companyId, meetingId, doc.id, !doc.isShared, token);
    await load();
  }

  async function removeDoc(docId: string) {
    if (!confirm('Delete this document?')) return;
    await vaultApi.removeMeetingDoc(companyId, meetingId, docId, token);
    await load();
  }

  async function handleShareToggle() {
    if (shareLink?.isActive) {
      await vaultApi.deactivateShareLink(companyId, meetingId, token);
    } else {
      await vaultApi.createShareLink(companyId, meetingId, token);
    }
    await load();
  }

  const shareUrl = shareLink?.isActive
    ? `${window.location.origin}/shared/meeting/${shareLink.shareToken}`
    : null;

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="w-6 h-6" /></div>;

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-200">Meeting Papers</h2>
          <p className="text-sm text-[#96908A] mt-1">Upload draft notices, agenda, and supporting papers. Share via a secure link in your invitation.</p>
        </div>
        {canManage && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-[#8B1A1A] hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Upload
          </button>
        )}
      </div>

      {/* Share link banner */}
      <div className={`rounded-xl border p-4 mb-6 ${shareLink?.isActive ? 'bg-[#0D1A0D] border-green-900/50' : 'bg-[#EBE6DF] border-[#E0DAD2]'}`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-bold ${shareLink?.isActive ? 'text-[#166534]' : 'text-[#5C5750]'}`}>
            {shareLink?.isActive ? '🔗 Share link is active' : '🔗 Share link'}
          </p>
          {canManage && (
            <button onClick={handleShareToggle}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${shareLink?.isActive ? 'bg-[#FEE2E2] border-red-800 text-[#991B1B] hover:bg-red-900' : 'bg-[#1E2530] border-[#374151] text-[#5C5750] hover:text-zinc-200'}`}>
              {shareLink?.isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
        {shareUrl ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-[#701515] bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-2 truncate">{shareUrl}</code>
            <button onClick={copyShareUrl} className="text-xs font-semibold text-[#5C5750] hover:text-zinc-200 bg-[#1E2530] border border-[#374151] rounded-lg px-3 py-2">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#96908A]">Activate to generate a public link for sharing documents with meeting attendees.</p>
        )}
        {docs.filter(d => d.isShared).length === 0 && shareLink?.isActive && (
          <p className="text-xs text-amber-500 mt-2">⚠ No documents marked as shared yet — toggle documents below to include them in the link.</p>
        )}
      </div>

      {/* Upload form */}
      {showForm && pendingFile && (
        <div className="bg-[#EBE6DF] border border-[#4F7FFF]/30 rounded-xl p-5 mb-6">
          <p className="text-sm font-bold text-[#5C5750] mb-4">📎 {pendingFile.name}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#5C5750] block mb-1">Document Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-600"
                placeholder="e.g. Draft Agenda — Q1 2026 Board Meeting" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#5C5750] block mb-1">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full bg-[#F5F2EE] border border-[#E0DAD2] rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none">
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setIsShared(s => !s)}
                className={`w-10 h-5 rounded-full transition-colors relative ${isShared ? 'bg-[#8B1A1A]' : 'bg-[#232830]'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${isShared ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-medium text-[#5C5750]">Include in share link</span>
            </label>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setShowForm(false); setPendingFile(null); }}
              className="flex-1 bg-[#232830] text-[#5C5750] text-sm font-semibold py-2 rounded-lg">Cancel</button>
            <button onClick={handleUpload} disabled={!title.trim() || uploading}
              className="flex-2 bg-[#8B1A1A] text-white text-sm font-semibold px-6 py-2 rounded-lg disabled:opacity-50">
              {uploading ? `Uploading… ${uploadPct}%` : 'Save Document'}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="text-center py-16 text-[#96908A]">
          <p className="text-sm">No documents uploaded yet.</p>
          {canManage && <p className="text-xs mt-2">Upload a draft agenda or notice to get started.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="bg-[#EBE6DF] border border-[#E0DAD2] rounded-xl px-5 py-4 flex items-center gap-4 hover:border-[#374151] transition-colors">
              <span className="text-2xl flex-shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-zinc-200 truncate">{doc.title}</p>
                  <span className="text-[9px] font-bold text-[#96908A] uppercase tracking-wide border border-[#E0DAD2] px-1.5 py-0.5 rounded flex-shrink-0">
                    {DOC_TYPES.find(t => t.value === doc.docType)?.label ?? doc.docType}
                  </span>
                </div>
                <p className="text-xs text-[#96908A]">{doc.fileName} · {doc.uploader.name} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Shared toggle */}
                {canManage && (
                  <button onClick={() => toggleShared(doc)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${doc.isShared ? 'bg-blue-950 border-blue-800 text-[#8B1A1A]' : 'bg-transparent border-[#E0DAD2] text-[#96908A] hover:text-[#5C5750]'}`}>
                    {doc.isShared ? '🔗 Shared' : 'Share'}
                  </button>
                )}
                {doc.downloadUrl && (
                  <a href={resolveDownloadUrl(doc.downloadUrl, token)} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#8B1A1A] hover:text-[#701515]">View ↗</a>
                )}
                {canManage && (
                  <button onClick={() => removeDoc(doc.id)}
                    className="text-xs text-[#C8C0B5] hover:text-[#991B1B] transition-colors px-1">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Guided Meeting Walk-Through ───────────────────────────────────────────────
function GuidedMeetingView({
  meeting, resolutions, guidedStep, setGuidedStep, setGuidedMode,
  companyId, meetingId, jwt, currentUserId, isAdmin, isChairperson, vaultDocs, onRefresh,
}: any) {
  const PROCEDURAL = ['CHAIRPERSON_ELECTION', 'QUORUM_CONFIRMATION'];
  const steps = (meeting.agendaItems ?? []).filter(
    (a: any) => !PROCEDURAL.includes(a.itemType ?? 'STANDARD')
  );
  const safeStep   = Math.min(Math.max(guidedStep, 0), Math.max(steps.length - 1, 0));
  const currentItem = steps[safeStep];
  if (!currentItem) return (
    <div className="flex flex-1 items-center justify-center text-[#96908A] text-sm">
      No agenda items to walk through.
    </div>
  );
  const itemRes  = resolutions.filter((r: any) => r.agendaItemId === currentItem.id);
  const stepDone = itemRes.length > 0 && itemRes.every(
    (r: any) => ['APPROVED','REJECTED','NOTED'].includes(r.status)
  );
  const isLast = safeStep >= steps.length - 1;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-56 flex-shrink-0 bg-[#EBE6DF] border-r border-[#E0DAD2] flex flex-col overflow-y-auto p-3">
        <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-3 px-1">
          Step {safeStep + 1} of {steps.length}
        </p>
        {steps.map((item: any, idx: number) => {
          const iRes   = resolutions.filter((r: any) => r.agendaItemId === item.id);
          const done   = iRes.length > 0 && iRes.every((r: any) => ['APPROVED','REJECTED','NOTED'].includes(r.status));
          const active = idx === safeStep;
          const locked = idx > safeStep;
          return (
            <button key={item.id}
              onClick={() => { if (!locked) setGuidedStep(idx); }}
              disabled={locked}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-start gap-2.5 transition-all border ${
                active  ? 'bg-[#F5E6E6] border-[#ECC9C9]'
                : locked ? 'opacity-30 cursor-not-allowed border-transparent'
                : 'hover:bg-[#FDFCFB] border-transparent cursor-pointer'
              }`}>
              <span className={`flex-shrink-0 w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center mt-0.5 ${
                done   ? 'bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]'
                : active ? 'bg-blue-950 border-blue-700 text-[#8B1A1A]'
                : 'bg-[#F5F2EE] border-[#E0DAD2] text-[#96908A]'
              }`}>{done ? '✓' : idx + 1}</span>
              <p className={`text-xs font-medium leading-tight ${
                active ? 'text-[#701515]' : done ? 'text-[#5C5750]' : 'text-[#96908A]'
              }`}>{item.title}</p>
            </button>
          );
        })}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-[#E0DAD2] px-8 py-4 flex items-center justify-between">
          <div>
            <p className="text-[#96908A] text-[10px] uppercase tracking-widest font-semibold mb-1">
              Agenda Item {safeStep + 1} of {steps.length}
            </p>
            <h2 className="text-[#231F1B] font-bold text-lg">{currentItem.title}</h2>
            {currentItem.description && (
              <p className="text-[#96908A] text-sm mt-0.5">{currentItem.description}</p>
            )}
          </div>
          {stepDone && (
            <span className="text-[#166534] text-sm font-semibold bg-[#DCFCE7]/40 border border-[#BBF7D0] px-3 py-1.5 rounded-lg">
              ✓ Complete
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <ResolutionsPanel
            companyId={companyId} meetingId={meetingId} jwt={jwt}
            meeting={meeting} resolutions={resolutions}
            activeAgendaItem={currentItem}
            currentUserId={currentUserId} onRefresh={onRefresh}
            isAdmin={isAdmin} isChairperson={isChairperson}
            vaultDocs={vaultDocs}
          />
        </div>
        <div className="border-t border-[#E0DAD2] px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setGuidedStep((s: number) => Math.max(0, s - 1))}
            disabled={safeStep === 0}
            className="text-sm font-semibold text-[#5C5750] hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            ← Previous
          </button>
          <div className="flex gap-1.5 items-center">
            {steps.map((_: any, idx: number) => (
              <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === safeStep ? 'bg-[#701515] w-4'
                : idx < safeStep ? 'bg-green-600 w-1.5'
                : 'bg-zinc-700 w-1.5'
              }`} />
            ))}
          </div>
          {isLast ? (
            <button onClick={() => setGuidedMode(false)}
              className="text-sm font-semibold text-[#166534] hover:text-[#166534] transition-colors">
              Finish ✓
            </button>
          ) : (
            <button
              onClick={() => setGuidedStep((s: number) => Math.min(steps.length - 1, s + 1))}
              disabled={!stepDone}
              className="text-sm font-semibold text-[#8B1A1A] hover:text-[#701515] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              {stepDone ? 'Next →' : 'Complete item to continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
