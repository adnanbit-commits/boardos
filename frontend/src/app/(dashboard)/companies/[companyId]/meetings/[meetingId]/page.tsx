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
} from '@/lib/api';
import { StatusBadge, VoteBar, Spinner, Button, Textarea } from '@/components/ui';
import DocNotesPanel from '@/components/DocNotesPanel';

const STATUS_ORDER: MeetingStatus[] = [
  'DRAFT','SCHEDULED','IN_PROGRESS','VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED',
];
const NEXT_STATUS_LABEL: Partial<Record<MeetingStatus, string>> = {
  DRAFT:               'Mark Scheduled',
  SCHEDULED:           'Start Meeting',
  IN_PROGRESS:         'Open Voting',
  VOTING:              'Close Voting',
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
  const [myRole,      setMyRole]      = useState('OBSERVER');
  const [loading,     setLoading]     = useState(true);
  const [activeAgenda,setActiveAgenda]= useState<string | null>(null);
  const [panel,       setPanel]       = useState<'resolutions'|'declarations'|'attendance'|'minutes'|'documents'|'docnotes'>('resolutions');
  const [advancing,   setAdvancing]   = useState(false);
  const [error,       setError]       = useState('');

  // Chairperson election modal
  const [showChairModal, setShowChairModal] = useState(false);

  // Roll call + notice acknowledgement state
  const [rollCall,     setRollCall]     = useState<RollCallStatus | null>(null);
  const [showRollCall, setShowRollCall] = useState(false);
  const [noticeAcked,  setNoticeAcked]  = useState(false);

  const reload = useCallback(async () => {
    try {
      const [m, r, memberList, rc] = await Promise.all([
        meetings.findOne(companyId, meetingId, jwt),
        resApi.listForMeeting(companyId, meetingId, jwt),
        import('@/lib/api').then(a => a.companies.listMembers(companyId, jwt)),
        meetings.getRollCall(companyId, meetingId, jwt).catch(() => null),
      ]);
      setMeeting(m);
      setResolutions(r);
      setMembers(memberList);
      if (rc) setRollCall(rc as RollCallStatus);
      // Set notice ack state for current user
      if (m.noticeAcknowledgedBy?.includes(me?.id ?? '')) setNoticeAcked(true);
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
      // In SCHEDULED state, show roll call prompt if not yet completed
      setPanel('attendance');
    }
    // IN_PROGRESS: start at resolutions (agenda item execution surface)
    // docnotes/declarations are handled as agenda items now
  }, [meeting?.status]);

  async function advanceMeeting() {
    if (!meeting) return;
    const target = nextStatus(meeting.status as MeetingStatus);
    if (!target) return;

    // No pre-gate for IN_PROGRESS — chairperson election is agenda item 1
    // after the meeting opens. The backend enforces attendance/quorum.

    setAdvancing(true); setError('');
    try {
      if (target === 'SIGNED') {
        await minutesApi.sign(companyId, meetingId, jwt);
      } else {
        await meetings.advance(companyId, meetingId, target, jwt);
        if (target === 'VOTING') {
          try { await resApi.bulkOpenVoting(companyId, meetingId, jwt); } catch {}
          setPanel('resolutions');
        }
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
  const isDirector = myRole === 'DIRECTOR';
  const isParticipant = myRole === 'DIRECTOR' || myRole === 'COMPANY_SECRETARY';
  const isAdmin = isWorkspaceAdmin || isDirector; // legacy alias — use specific flags below

  const visibleResolutions = activeAgenda
    ? resolutions.filter(r => r.agendaItemId === activeAgenda)
    : resolutions;

  const presentCount    = attendance.filter(a => a.attendance?.mode !== 'ABSENT').length;
  const totalCount      = attendance.length;
  const allDeclReceived = declarations.length > 0 && declarations.every(d => d.forms.every(f => f.received));
  const declWarning     = declarations.length > 0 && !allDeclReceived &&
    ['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status);

  // Directors for chairperson/recorder selection
  const directors = members.filter((m: any) => ['DIRECTOR','COMPANY_SECRETARY'].includes(m.role));

  return (
    <div className="flex flex-col h-screen bg-[#0D0F12] overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#2a303a;border-radius:10px}
      `}</style>

      {/* Chairperson election modal */}
      {showChairModal && (
        <ChairpersonModal
          directors={directors}
          companyId={companyId} meetingId={meetingId} jwt={jwt}
          onElected={async () => { setShowChairModal(false); await reload(); await advanceMeeting(); }}
          onClose={() => setShowChairModal(false)}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-[#13161B] border-b border-[#232830] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-zinc-600 text-xs flex items-center gap-1.5 flex-shrink-0">
              <a href={`/companies/${companyId}`} className="hover:text-zinc-400">Workspace</a>
              <span>›</span>
              <a href={`/companies/${companyId}/meetings`} className="hover:text-zinc-400">Meetings</a>
              <span>›</span>
            </div>
            <h1 className="text-white font-bold text-lg truncate"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              {meeting.title}
            </h1>
            <StatusBadge status={meeting.status.toLowerCase()} />
            {totalCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                {presentCount}/{totalCount} present
              </span>
            )}
            {declWarning && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/40 text-amber-400">
                ⚠ Declarations pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {meeting.videoUrl && (
              <a href={meeting.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 bg-blue-950 border border-blue-800/50 px-3 py-1.5 rounded-lg hover:bg-blue-900">
                <span>▶</span> Join {meeting.videoProvider ?? 'Video Call'}
              </a>
            )}
            {isAdmin && (
              <a href={`/companies/${companyId}`}
                className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-950/40 border border-purple-800/40 px-3 py-1.5 rounded-lg hover:bg-purple-950">
                <span>◎</span> Invite Members
              </a>
            )}
            <span className="text-zinc-500 text-xs">
              {new Date(meeting.scheduledAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
            </span>
            {isAdmin && next && (
              <Button onClick={advanceMeeting} loading={advancing} size="sm"
                variant={next === 'SIGNED' ? 'outline' : 'primary'}>
                {NEXT_STATUS_LABEL[meeting.status as MeetingStatus] ?? `→ ${next}`}
              </Button>
            )}
          </div>
        </div>
        <WorkflowProgress status={meeting.status as MeetingStatus} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-[#13161B] border-r border-[#232830] flex flex-col overflow-y-auto">
          <div className="px-4 pt-5 pb-2">
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold">Agenda</p>
          </div>
          <nav className="flex flex-col gap-0.5 px-2 pb-4">
            {meeting.agendaItems.length === 0 ? (
              <p className="text-zinc-600 text-xs px-2 py-3">No agenda items yet.</p>
            ) : meeting.agendaItems.map((item, idx) => {
              const itemRes = resolutions.filter(r => r.agendaItemId === item.id);
              const hasVoting = itemRes.some(r => r.status === 'VOTING');
              const allDone   = itemRes.length > 0 && itemRes.every(r => ['APPROVED','REJECTED','NOTED'].includes(r.status));
              return (
                <button key={item.id}
                  onClick={() => { setActiveAgenda(item.id === activeAgenda ? null : item.id); setPanel('resolutions'); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150
                    ${activeAgenda === item.id && panel === 'resolutions'
                      ? 'bg-blue-950/60 border border-blue-800/50'
                      : 'hover:bg-[#191D24] border border-transparent'}`}>
                  <div className="flex items-start gap-2.5">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center mt-0.5
                      ${allDone ? 'bg-green-950 border-green-700 text-green-400'
                      : hasVoting ? 'bg-amber-950 border-amber-700 text-amber-400'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                      {allDone ? '✓' : idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium leading-tight ${
                        activeAgenda === item.id && panel === 'resolutions' ? 'text-blue-300' : 'text-zinc-300'}`}>
                        {item.title}
                        {(item as any).isAob && <span className="ml-1 text-[9px] text-amber-500">AOB</span>}
                      </p>
                      {itemRes.length > 0 && (
                        <p className="text-zinc-600 text-[10px] mt-0.5">
                          {itemRes.length} item{itemRes.length !== 1 ? 's' : ''}{hasVoting && ' · voting open'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {isAdmin && !['VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED'].includes(meeting.status) && (
            <div className="px-3 pb-4 pt-2 border-t border-[#232830]">
              <AddAgendaForm companyId={companyId} meetingId={meetingId} jwt={jwt} onAdded={reload} />
            </div>
          )}

          {/* Role assignments */}
          {isAdmin && !['SIGNED','LOCKED'].includes(meeting.status) && (
            <div className="px-3 pb-3 pt-1 border-t border-[#232830]">
              <RoleAssignmentMini
                meeting={meeting} directors={directors}
                companyId={companyId} meetingId={meetingId}
                jwt={jwt} onUpdated={reload}
              />
            </div>
          )}

          {/* Panel switcher */}
          <div className="px-3 pb-4 pt-1 border-t border-[#232830] space-y-1">
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold mb-2 px-1">View</p>
            {[
              { key: 'resolutions', label: '◇ Resolutions', always: true },
              { key: 'declarations', label: '📋 Declarations', show: !['DRAFT'].includes(meeting.status),
                badge: declWarning ? 'Pending' : undefined, badgeColor: 'amber' },
              { key: 'attendance', label: '◎ Attendance', show: !['DRAFT'].includes(meeting.status),
                badge: meeting.status === 'IN_PROGRESS' ? 'Required' : undefined, badgeColor: 'amber' },
              { key: 'docnotes', label: '⊟ Compliance Docs',
                show: ['SCHEDULED','IN_PROGRESS'].includes(meeting.status),
                badge: meeting.status === 'SCHEDULED' ? 'Required' : undefined, badgeColor: 'amber' },
              { key: 'documents', label: '📎 Meeting Papers', always: true },
              { key: 'minutes', label: '▣ Minutes', show: !!meeting.minutes },
            ].map((p: any) => p.always || p.show ? (
              <button key={p.key} onClick={() => setPanel(p.key as any)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${panel === p.key ? 'bg-[#191D24] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
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

          {/* ── Notice acknowledgement banner (SCHEDULED status) ─────────────── */}
          {meeting.status === 'SCHEDULED' && !noticeAcked && (
            <div className="mb-6 bg-amber-950/30 border border-amber-800/30 rounded-2xl p-5 flex items-start gap-4">
              <span className="text-amber-400 text-xl flex-shrink-0 mt-0.5">📋</span>
              <div className="flex-1">
                <p className="text-amber-400 text-sm font-semibold mb-1">Acknowledge Notice Receipt</p>
                <p className="text-zinc-400 text-xs leading-relaxed mb-3">
                  SS-1 Rule 3(4) requires each director to confirm receipt of the meeting notice and agenda before participating.
                  Click below to confirm you have received the notice for this meeting.
                </p>
                <button
                  onClick={async () => {
                    await meetings.acknowledgeNotice(companyId, meetingId, jwt);
                    setNoticeAcked(true);
                    reload();
                  }}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  ✓ I confirm receipt of notice and agenda
                </button>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-zinc-600 text-[10px] mb-1">Acknowledged by</p>
                <p className="text-zinc-400 text-xs font-semibold">
                  {meeting.noticeAcknowledgedBy?.length ?? 0} of {members.filter((m:any) => ['DIRECTOR','COMPANY_SECRETARY'].includes(m.role)).length} directors
                </p>
              </div>
            </div>
          )}

          {/* ── Roll call panel (shown when meeting is open) ─────────────────── */}
          {['SCHEDULED','IN_PROGRESS'].includes(meeting.status) && showRollCall && (
            <RollCallPanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              currentUserId={me?.id ?? ''} rollCall={rollCall}
              onComplete={() => { setShowRollCall(false); reload(); }}
            />
          )}

          {/* ── Current task guidance block ──────────────────────────────────── */}
          {!showRollCall && (
            <CurrentTaskBlock
              meeting={meeting} rollCall={rollCall} members={members}
              noticeAckedCount={meeting.noticeAcknowledgedBy?.length ?? 0}
              onShowRollCall={() => setShowRollCall(true)}
              onSetPanel={setPanel}
            />
          )}

          {panel === 'resolutions' && (
            <ResolutionsPanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} resolutions={visibleResolutions}
              activeAgendaItem={meeting.agendaItems.find(a => a.id === activeAgenda)}
              currentUserId={me?.id ?? ''} onRefresh={reload} isAdmin={isAdmin}
            />
          )}
          {panel === 'declarations' && (
            <DeclarationsPanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} declarations={declarations}
              isAdmin={isAdmin} onRefresh={reload}
            />
          )}
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
          {panel === 'docnotes' && (
            <div>
              <h2 className="text-lg font-bold text-zinc-200 mb-1">Compliance Documents</h2>
              <p className="text-sm text-zinc-500 mb-6">
                The Chairperson must formally note receipt of DIR-8 and MBP-1 from all directors before the meeting can open.
              </p>
              <DocNotesPanel
                companyId={companyId} meetingId={meetingId} token={jwt}
                isChairperson={meeting.chairpersonId === me?.id}
                onAllNoted={reload}
              />
            </div>
          )}
          {panel === 'documents' && (
            <MeetingDocumentsPanel
              companyId={companyId} meetingId={meetingId} token={jwt}
              canManage={isAdmin}
            />
          )}
        </main>
      </div>
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
              <div className={`h-0.5 w-full rounded-full transition-all duration-500 ${done?'bg-blue-500':current?'bg-blue-500/50':'bg-[#232830]'}`}/>
              <span className={`text-[9px] font-medium tracking-wide whitespace-nowrap ${current?'text-blue-400':done?'text-zinc-500':'text-zinc-700'}`}>{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Chairperson Modal ─────────────────────────────────────────────────────────

function ChairpersonModal({ directors, companyId, meetingId, jwt, onElected, onClose }: any) {
  const [selected, setSelected] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [recId,    setRecId]    = useState('');

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await meetings.electChairperson(companyId, meetingId, selected, jwt);
      if (recId) await meetings.setRecorder(companyId, meetingId, recId, jwt);
      await onElected();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#13161B] border border-[#232830] rounded-2xl p-7 max-w-md w-full fade-up">
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">SS-1 — Before starting</p>
        <h2 className="text-white font-bold text-lg mb-4" style={{fontFamily:"'Playfair Display',serif"}}>
          Elect Meeting Chairperson
        </h2>
        <p className="text-zinc-500 text-xs mb-5">
          Under SS-1 a Chairperson must be elected at the start of each meeting.
          Optionally designate a Minutes Recorder (SS-1 — authorised person to record proceedings).
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-zinc-500 text-[10px] uppercase tracking-widest block mb-1.5">
              Chairperson <span className="text-red-400">*</span>
            </label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600">
              <option value="">Select a director...</option>
              {directors.map((d: any) => (
                <option key={d.user.id} value={d.user.id}>
                  {d.user.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-zinc-500 text-[10px] uppercase tracking-widest block mb-1.5">
              Minutes Recorder <span className="text-zinc-600">(optional)</span>
            </label>
            <select value={recId} onChange={e => setRecId(e.target.value)}
              className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600">
              <option value="">Same as Chairperson (default)</option>
              {directors.map((d: any) => (
                <option key={d.user.id} value={d.user.id}>{d.user.name}</option>
              ))}
            </select>
            <p className="text-zinc-600 text-[10px] mt-1">For 2-director boards: best practice is non-Chairperson director records the minutes</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button size="sm" loading={saving} onClick={save} disabled={!selected}>
            Elect & Start Meeting
          </Button>
          <button onClick={onClose} className="text-zinc-500 text-xs hover:text-zinc-300">Cancel</button>
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
      <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold px-1">Meeting Roles</p>

      {/* Chairperson */}
      <div>
        <p className="text-zinc-600 text-[10px] mb-0.5 px-1">Chairperson</p>
        {chairName
          ? <p className="text-zinc-300 text-xs px-1 font-medium">{chairName}</p>
          : <button onClick={() => {}} className="text-amber-400 text-[10px] px-1 hover:text-amber-300">
              ⚠ Not elected
            </button>
        }
      </div>

      {/* Minutes Recorder — selectable dropdown */}
      <div>
        <p className="text-zinc-600 text-[10px] mb-1 px-1">Minutes Recorder</p>
        {canSetRecorder ? (
          <select
            value={meeting.minutesRecorderId ?? ''}
            onChange={e => e.target.value && changeRecorder(e.target.value)}
            disabled={saving}
            className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-50"
          >
            <option value="">— Designate recorder</option>
            {directors.map((d: any) => (
              <option key={d.user.id} value={d.user.id}>{d.user.name}</option>
            ))}
          </select>
        ) : (
          <p className="text-zinc-400 text-[10px] px-1">{recorderName ?? '— Not designated'}</p>
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
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">Sec. 152 · 164 · 184 — CA2013</p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>
            Director Declarations
          </h2>
        </div>
        {declarations.length > 0 && (
          <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${allGood
            ? 'bg-green-950/40 border-green-800/40 text-green-400'
            : 'bg-amber-950/40 border-amber-800/40 text-amber-400'}`}>
            {allGood ? '✓ All declarations received' : '⚠ Declarations pending'}
          </div>
        )}
      </div>

      {/* Form legend */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.entries(FORM_META) as [DeclarationFormType, any][]).map(([key, meta]) => (
          <div key={key} className="bg-[#191D24] border border-[#232830] rounded-xl p-3">
            <p className="text-xs font-bold text-zinc-200">{meta.label}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{meta.law}</p>
            <p className="text-[10px] text-zinc-600 mt-1">{meta.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {declarations.map((dir: any) => (
          <div key={dir.userId} className="bg-[#191D24] border border-[#232830] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-zinc-200">{dir.name}</p>
                <p className="text-zinc-600 text-[11px]">{dir.email}</p>
              </div>
              {dir.isWorkspaceAdmin && (
                <span className="text-[9px] font-bold bg-amber-900/40 text-amber-400 border border-amber-700/30 px-1.5 py-0.5 rounded-full">
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
                      ? 'bg-green-950/30 border-green-800/30'
                      : 'bg-[#13161B] border-[#232830]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-zinc-300">{meta.label}</span>
                      {form.received
                        ? <span className="text-green-400 text-[10px] font-semibold">✓ Received</span>
                        : <span className="text-zinc-600 text-[10px]">Pending</span>}
                    </div>

                    {form.notes && (
                      <p className="text-zinc-500 text-[10px] mb-2 italic truncate">{form.notes}</p>
                    )}

                    {/* MBP-1 notes input */}
                    {noteOpen === key && (
                      <div className="mb-2">
                        <input
                          autoFocus
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Interests disclosed..."
                          className="w-full bg-[#0D0F12] border border-[#232830] rounded px-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"
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
                              ? 'border-red-700/40 text-red-400 hover:bg-red-950/20'
                              : 'border-green-700/40 text-green-400 hover:bg-green-950/20'}
                            ${isSaving ? 'opacity-50' : ''}`}>
                          {isSaving ? '…' : form.received ? 'Mark Not Received' : 
                            (form.formType === 'MBP_1' && noteOpen !== key ? 'Add Notes & Receive' : 'Mark Received')}
                        </button>
                        {noteOpen === key && (
                          <button onClick={() => setNoteOpen(null)}
                            className="text-[10px] text-zinc-600 hover:text-zinc-400 px-1">✕</button>
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

function AttendancePanel({ companyId, meetingId, jwt, meeting, attendance, currentUserId, isChairperson, isCS, onRefresh }: any) {
  const [saving,    setSaving]    = useState<string | null>(null);
  const [requesting,setRequesting]= useState<string | null>(null); // 'VIDEO' | 'PHONE'
  const [err,       setErr]       = useState('');

  const canAuthenticate = isChairperson || isCS; // can record VIDEO/PHONE/ABSENT for others
  const canEdit = ['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status) && !!meeting.chairpersonId;

  const present = attendance.filter((a: any) => a.attendance && !['ABSENT', null].includes(a.attendance?.mode) && !a.attendance?.mode?.startsWith('REQUESTED'));
  const total   = attendance.length;
  const quorumRequired = Math.max(2, Math.ceil(total / 3));
  const quorumMet = present.length >= quorumRequired;

  async function record(userId: string, mode: AttendanceMode) {
    setSaving(userId); setErr('');
    try {
      await meetings.recordAttendance(companyId, meetingId, { userId, mode }, jwt);
      await onRefresh();
    } catch (e: any) { setErr((e as any).body?.message ?? 'Could not save attendance'); }
    finally { setSaving(null); }
  }

  async function requestMode(mode: 'VIDEO' | 'PHONE') {
    setRequesting(mode); setErr('');
    try {
      await meetings.requestAttendance(companyId, meetingId, mode, jwt);
      await onRefresh();
    } catch (e: any) { setErr((e as any).body?.message ?? 'Could not send request'); }
    finally { setRequesting(null); }
  }

  const noChairperson = !meeting.chairpersonId;

  return (
    <div className="max-w-2xl fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">SS-1 · Section 174 · Companies Act 2013</p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Attendance</h2>
        </div>
        {total > 0 && (
          <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${quorumMet
            ? 'bg-green-950/40 border-green-800/40 text-green-400'
            : 'bg-red-950/40 border-red-800/40 text-red-400'}`}>
            {quorumMet ? '✓ Quorum Met' : '✕ Quorum Not Met'}
            <span className="block text-[10px] font-normal opacity-70 mt-0.5">
              {present.length} of {total} present · min {quorumRequired} required
            </span>
          </div>
        )}
      </div>

      {/* No chairperson warning */}
      {noChairperson && (
        <div className="mb-5 flex items-start gap-3 bg-amber-950/20 border border-amber-800/30 rounded-xl px-4 py-3">
          <span className="text-amber-400 mt-0.5">⚠</span>
          <p className="text-amber-300 text-xs leading-relaxed">
            No chairperson elected yet. A chairperson must be elected before attendance can be recorded (SS-1).
          </p>
        </div>
      )}

      {/* Role context banner */}
      {!noChairperson && canEdit && (
        <div className="mb-5 flex items-start gap-3 bg-[#191D24] border border-[#232830] rounded-xl px-4 py-3">
          <span className="text-blue-400 mt-0.5 text-sm">ℹ</span>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {canAuthenticate
              ? `You are the ${isChairperson ? 'Chairperson' : 'Company Secretary'}. You can authenticate electronic attendance (Video/Phone) and mark directors absent per SS-1.`
              : 'You can mark yourself as In Person. To join by video or phone, use the request button — the Chairperson or CS will confirm.'}
          </p>
        </div>
      )}

      {err && <p className="text-red-400 text-xs mb-4 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">{err}</p>}

      <div className="space-y-3">
        {attendance.map((dir: any) => {
          const currentMode: string | null = dir.attendance?.mode ?? null;
          const isSelf = dir.userId === currentUserId;
          const isSaving = saving === dir.userId;
          const isPending = currentMode === 'REQUESTED_VIDEO' || currentMode === 'REQUESTED_PHONE';

          return (
            <div key={dir.userId} className={`bg-[#191D24] border rounded-xl p-4 ${isPending ? 'border-amber-800/40' : 'border-[#232830]'}`}>
              <div className="flex items-start gap-4">
                {/* Member info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-200">{dir.name}</p>
                    {isSelf && <span className="text-[9px] font-bold bg-blue-900/40 text-blue-400 border border-blue-700/30 px-1.5 py-0.5 rounded-full">you</span>}
                    {meeting.chairpersonId === dir.userId && <span className="text-[9px] font-bold bg-purple-900/40 text-purple-400 border border-purple-700/30 px-1.5 py-0.5 rounded-full">Chairperson</span>}
                    {dir.role === 'COMPANY_SECRETARY' && <span className="text-[9px] font-bold bg-indigo-900/40 text-indigo-400 border border-indigo-700/30 px-1.5 py-0.5 rounded-full">CS</span>}
                  </div>
                  <p className="text-zinc-600 text-[11px] mt-0.5">{dir.email}</p>
                </div>

                {/* Current status badge */}
                <div className="flex-shrink-0">
                  {currentMode && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      isPending              ? 'bg-amber-950/40 border-amber-700/40 text-amber-400'
                      : currentMode==='ABSENT'    ? 'bg-red-950/40 border-red-700/40 text-red-400'
                      : currentMode==='IN_PERSON' ? 'bg-green-950/40 border-green-700/40 text-green-400'
                      : 'bg-blue-950/40 border-blue-700/40 text-blue-400'
                    }`}>
                      {isPending
                        ? `⏳ ${currentMode === 'REQUESTED_VIDEO' ? 'Requested Video' : 'Requested Phone'}`
                        : currentMode.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">

                  {/* ── Own row: self-mark IN_PERSON + request VIDEO/PHONE ── */}
                  {isSelf && !canAuthenticate && (
                    <>
                      <button disabled={isSaving || currentMode === 'IN_PERSON'}
                        onClick={() => record(dir.userId, 'IN_PERSON')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'IN_PERSON'
                            ? 'bg-green-950/60 border-green-700/60 text-green-400'
                            : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-green-700/50 hover:text-green-400'}
                          ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {isSaving ? '…' : '◉ Mark In Person'}
                      </button>
                      <button disabled={!!requesting || currentMode === 'REQUESTED_VIDEO' || currentMode === 'VIDEO'}
                        onClick={() => requestMode('VIDEO')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'VIDEO' || currentMode === 'REQUESTED_VIDEO'
                            ? 'bg-blue-950/60 border-blue-700/60 text-blue-400'
                            : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-blue-700/50 hover:text-blue-400'}
                          ${requesting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {requesting === 'VIDEO' ? '…' : '▶ Request Video'}
                      </button>
                      <button disabled={!!requesting || currentMode === 'REQUESTED_PHONE' || currentMode === 'PHONE'}
                        onClick={() => requestMode('PHONE')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'PHONE' || currentMode === 'REQUESTED_PHONE'
                            ? 'bg-blue-950/60 border-blue-700/60 text-blue-400'
                            : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-blue-700/50 hover:text-blue-400'}
                          ${requesting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {requesting === 'PHONE' ? '…' : '◌ Request Phone'}
                      </button>
                    </>
                  )}

                  {/* ── Chairperson / CS row: full control for others + self ── */}
                  {canAuthenticate && (
                    <>
                      {/* IN_PERSON — anyone can appear in person */}
                      <button disabled={isSaving} onClick={() => record(dir.userId, 'IN_PERSON')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'IN_PERSON' ? 'bg-green-950/60 border-green-700/60 text-green-400' : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-green-700/50 hover:text-green-400'}
                          ${isSaving ? 'opacity-50' : ''}`}>
                        {isSaving && currentMode==='IN_PERSON' ? '…' : '◉ In Person'}
                      </button>

                      {/* VIDEO — authenticate or confirm request */}
                      <button disabled={isSaving} onClick={() => record(dir.userId, 'VIDEO')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'VIDEO' ? 'bg-blue-950/60 border-blue-700/60 text-blue-400'
                          : isPending && currentMode === 'REQUESTED_VIDEO' ? 'bg-amber-950/60 border-amber-700/60 text-amber-300 animate-pulse'
                          : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-blue-700/50 hover:text-blue-400'}
                          ${isSaving ? 'opacity-50' : ''}`}>
                        {isSaving && currentMode==='VIDEO' ? '…'
                          : currentMode === 'REQUESTED_VIDEO' ? '✓ Confirm Video'
                          : '▶ Video'}
                      </button>

                      {/* PHONE */}
                      <button disabled={isSaving} onClick={() => record(dir.userId, 'PHONE')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'PHONE' ? 'bg-blue-950/60 border-blue-700/60 text-blue-400'
                          : isPending && currentMode === 'REQUESTED_PHONE' ? 'bg-amber-950/60 border-amber-700/60 text-amber-300 animate-pulse'
                          : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-blue-700/50 hover:text-blue-400'}
                          ${isSaving ? 'opacity-50' : ''}`}>
                        {isSaving && currentMode==='PHONE' ? '…'
                          : currentMode === 'REQUESTED_PHONE' ? '✓ Confirm Phone'
                          : '◌ Phone'}
                      </button>

                      {/* ABSENT */}
                      <button disabled={isSaving} onClick={() => record(dir.userId, 'ABSENT')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === 'ABSENT' ? 'bg-red-950/60 border-red-700/60 text-red-400' : 'bg-transparent border-zinc-700/50 text-zinc-400 hover:border-red-700/50 hover:text-red-400'}
                          ${isSaving ? 'opacity-50' : ''}`}>
                        {isSaving && currentMode==='ABSENT' ? '…' : '✕ Absent'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Read-only — not editable */}
              {!canEdit && currentMode && (
                <div className="mt-2">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                    !currentMode ? 'bg-zinc-900 border-zinc-700 text-zinc-500'
                    : currentMode === 'ABSENT' ? 'bg-red-950/40 border-red-800/40 text-red-400'
                    : 'bg-green-950/40 border-green-800/40 text-green-400'}`}>
                    {currentMode.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {attendance.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-10">No members to record attendance for.</p>
      )}
    </div>
  );
}

// ── Resolutions Panel ─────────────────────────────────────────────────────────

function ResolutionsPanel({ companyId, meetingId, jwt, meeting, resolutions, activeAgendaItem, currentUserId, onRefresh, isAdmin }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const canAdd = !['VOTING','MINUTES_DRAFT','MINUTES_CIRCULATED','SIGNED','LOCKED'].includes(meeting.status);
  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">
            {activeAgendaItem ? `Agenda — ${activeAgendaItem.title}` : 'All Resolutions'}
          </p>
          <h2 className="text-white text-xl font-bold" style={{fontFamily:"'Playfair Display',serif"}}>Board Resolutions</h2>
        </div>
        {isAdmin && canAdd && (
          <Button size="sm" onClick={() => setShowAdd(s => !s)}>{showAdd ? '✕ Cancel' : '+ New Resolution'}</Button>
        )}
      </div>
      {showAdd && (
        <div className="mb-5 fade-up">
          <AddResolutionForm companyId={companyId} meetingId={meetingId} agendaItemId={activeAgendaItem?.id}
            jwt={jwt} onAdded={() => { setShowAdd(false); onRefresh(); }} />
        </div>
      )}
      {resolutions.length === 0 && (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-3xl mb-3">◇</p>
          <p className="text-sm">No resolutions yet for this agenda item.</p>
          {isAdmin && canAdd && <button onClick={() => setShowAdd(true)} className="mt-3 text-blue-400 text-xs hover:text-blue-300">+ Add first resolution</button>}
        </div>
      )}
      <div className="space-y-4">
        {resolutions.map((res: Resolution, idx: number) => (
          <ResolutionCard key={res.id} resolution={res} index={idx + 1}
            companyId={companyId} jwt={jwt} currentUserId={currentUserId}
            meeting={meeting} isAdmin={isAdmin} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

// ── Resolution Card ───────────────────────────────────────────────────────────

function ResolutionCard({ resolution, index, companyId, jwt, currentUserId, meeting, isAdmin, onRefresh }: any) {
  const [expanded,        setExpanded]        = useState(resolution.status === 'VOTING');
  const [isVoting,        setIsVoting]        = useState(false);
  const [myVote,          setMyVote]          = useState<string | null>(null);
  const [castError,       setCastError]       = useState('');
  const [proposing,       setProposing]       = useState(false);
  const [noting,          setNoting]          = useState(false);
  // Exhibit doc: chairperson must open before Place on Record is enabled
  const [hasOpenedExhibit, setHasOpenedExhibit] = useState(false);

  const isNoting     = resolution.type === 'NOTING';
  const hasExhibit   = !!(resolution.exhibitDoc?.downloadUrl);
  const canPlaceOnRecord = isNoting && (!hasExhibit || hasOpenedExhibit);
  const existingVote = resolution.votes?.find((v: any) => v.user.id === currentUserId);
  const hasVoted = !!existingVote;

  const borderColor = resolution.status === 'APPROVED' ? 'border-green-800/50'
    : resolution.status === 'REJECTED' ? 'border-red-800/50'
    : resolution.status === 'NOTED'    ? 'border-zinc-700/50'
    : resolution.status === 'VOTING'   ? 'border-amber-800/40'
    : 'border-[#232830]';

  const accentBar = resolution.status === 'APPROVED' ? 'bg-green-500'
    : resolution.status === 'REJECTED' ? 'bg-red-500'
    : resolution.status === 'NOTED'    ? 'bg-zinc-600'
    : resolution.status === 'VOTING'   ? 'bg-amber-500'
    : isNoting ? 'bg-zinc-700'
    : 'bg-blue-600';

  async function propose() {
    setProposing(true);
    try { await resApi.propose(companyId, resolution.id, jwt); onRefresh(); }
    catch (e: any) { setCastError((e as any).body?.message ?? 'Could not propose'); }
    finally { setProposing(false); }
  }

  async function placeOnRecord() {
    setNoting(true);
    try { await resApi.note(companyId, resolution.id, jwt); onRefresh(); }
    catch (e: any) { setCastError((e as any).body?.message ?? 'Could not place on record'); }
    finally { setNoting(false); }
  }

  async function castVote(value: string) {
    setMyVote(value); setIsVoting(true); setCastError('');
    try { await voting.castVote(companyId, resolution.id, { value: value as 'APPROVE' | 'REJECT' | 'ABSTAIN' }, jwt); onRefresh(); }
    catch (e: any) { setCastError((e as any).body?.message ?? 'Could not cast vote'); setMyVote(null); }
    finally { setIsVoting(false); }
  }

  const totalVotes = (resolution.tally?.APPROVE ?? 0) + (resolution.tally?.REJECT ?? 0) + (resolution.tally?.ABSTAIN ?? 0);

  return (
    <div className={`bg-[#191D24] border ${borderColor} rounded-2xl overflow-hidden transition-all duration-200`}>
      <div className={`h-0.5 ${accentBar}`} />
      <button className="w-full text-left px-6 py-4 flex items-start justify-between gap-4 hover:bg-[#1d2229]"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
            {index}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-sm leading-snug">{resolution.title}</p>
              {isNoting && <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-full">On Record</span>}
            </div>
            {resolution.status === 'VOTING' && (
              <p className="text-amber-400 text-[11px] mt-0.5">{totalVotes} of {resolution.directorCount ?? '?'} voted</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={resolution.status.toLowerCase()} />
          <span className="text-zinc-600 text-xs">{expanded ? '▴' : '▾'}</span>
        </div>
      </button>

      {['VOTING','APPROVED','REJECTED'].includes(resolution.status) && !isNoting && (
        <div className="px-6 pb-3">
          <VoteBar approve={resolution.tally?.APPROVE ?? 0} reject={resolution.tally?.REJECT ?? 0}
            abstain={resolution.tally?.ABSTAIN ?? 0} total={resolution.directorCount ?? 5} />
        </div>
      )}

      {expanded && (
        <div className="px-6 pb-5 fade-up space-y-4 border-t border-[#232830] pt-4">
          <div className="bg-[#13161B] border-l-2 border-zinc-700 pl-4 py-3 pr-3 rounded-r-xl">
            <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap">{resolution.text}</p>
          </div>

          {/* NOTING type — exhibit document preview */}
          {isNoting && hasExhibit && (
            <div className={`rounded-xl border p-3.5 flex items-center gap-3 transition-colors ${
              hasOpenedExhibit
                ? 'bg-green-950/20 border-green-800/30'
                : 'bg-[#13161B] border-amber-800/30'
            }`}>
              <span className="text-lg flex-shrink-0">{hasOpenedExhibit ? '✓' : '📄'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-300 truncate">{resolution.exhibitDoc!.fileName}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {hasOpenedExhibit ? 'Document reviewed' : 'Must be opened before noting'}
                </p>
              </div>
              <a
                href={resolveDownloadUrl(resolution.exhibitDoc!.downloadUrl, jwt)}
                target="_blank" rel="noopener noreferrer"
                onClick={() => setHasOpenedExhibit(true)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                  hasOpenedExhibit
                    ? 'text-green-400 border-green-700/40 bg-green-950/30'
                    : 'text-blue-400 border-blue-700/40 bg-blue-950/30 hover:bg-blue-950/50'
                }`}
              >
                {hasOpenedExhibit ? '↗ Re-open' : '↗ Open'}
              </a>
            </div>
          )}

          {/* NOTING type — place on record button */}
          {isNoting && resolution.status === 'DRAFT' && isAdmin && meeting.status === 'IN_PROGRESS' && (
            <div>
              <Button
                size="sm" onClick={placeOnRecord} loading={noting}
                disabled={!canPlaceOnRecord}
              >
                ✓ Place on Record
              </Button>
              {hasExhibit && !hasOpenedExhibit && (
                <p className="text-amber-400 text-[10px] mt-2">
                  ↑ Open the exhibit document above before placing on record
                </p>
              )}
            </div>
          )}
          {isNoting && resolution.status === 'NOTED' && (
            <p className="text-zinc-500 text-xs">Placed on record during this meeting.</p>
          )}

          {/* Regular resolution — propose */}
          {!isNoting && isAdmin && resolution.status === 'DRAFT' && meeting.status === 'IN_PROGRESS' && (
            <Button size="sm" onClick={propose} loading={proposing}>Propose Resolution</Button>
          )}

          {/* Vote buttons */}
          {!isNoting && resolution.status === 'VOTING' && !hasVoted && (
            <div>
              <p className="text-zinc-500 text-xs mb-2 font-medium">Cast your vote</p>
              <div className="flex gap-2">
                {[
                  {value:'APPROVE', label:'✓ Approve', idle:'border-zinc-700 text-zinc-400 hover:border-green-700 hover:text-green-400', active:'bg-green-950/60 border-green-700 text-green-400'},
                  {value:'REJECT',  label:'✕ Reject',  idle:'border-zinc-700 text-zinc-400 hover:border-red-700 hover:text-red-400',   active:'bg-red-950/60 border-red-700 text-red-400'},
                  {value:'ABSTAIN', label:'— Abstain', idle:'border-zinc-700 text-zinc-400 hover:border-amber-700 hover:text-amber-400', active:'bg-amber-950/60 border-amber-700 text-amber-400'},
                ].map(btn => (
                  <button key={btn.value} onClick={() => castVote(btn.value)} disabled={isVoting}
                    className={`flex-1 py-2 text-xs font-semibold border rounded-lg transition-all ${myVote === btn.value ? btn.active : btn.idle}`}>
                    {isVoting && myVote === btn.value ? '…' : btn.label}
                  </button>
                ))}
              </div>
              {castError && <p className="text-red-400 text-xs mt-2">{castError}</p>}
            </div>
          )}
          {!isNoting && resolution.status === 'VOTING' && hasVoted && (
            <div className="flex items-center gap-2 py-2">
              <VotePill value={existingVote!.value} />
              <span className="text-zinc-500 text-xs">You voted</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Minutes Panel ─────────────────────────────────────────────────────────────

function MinutesPanel({ minutes, companyId, meetingId, jwt }: any) {
  const [exporting,  setExporting]  = useState(false);
  const [exportUrl,  setExportUrl]  = useState<string | null>(null);
  const [exportErr,  setExportErr]  = useState('');

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

  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">Generated Document</p>
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
        </div>
      </div>

      {exportErr && (
        <div className="mb-4 bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-2.5 text-red-400 text-xs">
          {exportErr}
        </div>
      )}

      {minutes.signatureHash && (
        <div className="mb-5 bg-green-950/30 border border-green-800/30 rounded-xl p-3.5 flex items-start gap-3">
          <span className="text-green-400 text-lg mt-0.5">✓</span>
          <div>
            <p className="text-green-400 text-xs font-semibold mb-0.5">Digitally Signed</p>
            <p className="text-zinc-600 text-[10px] font-mono break-all">{minutes.signatureHash}</p>
          </div>
        </div>
      )}
      <div className="bg-[#191D24] border border-[#232830] rounded-2xl p-7 prose-sm text-zinc-300"
        style={{fontSize:'13px',lineHeight:'1.8'}}
        dangerouslySetInnerHTML={{__html: minutes.content}} />
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function AddAgendaForm({ companyId, meetingId, jwt, onAdded }: any) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try { await meetings.addAgendaItem(companyId, meetingId, { title }, jwt); setTitle(''); setOpen(false); onAdded(); }
    finally { setLoading(false); }
  }
  if (!open) return <button onClick={() => setOpen(true)} className="text-zinc-600 text-xs hover:text-zinc-400 w-full text-left">+ Add agenda item</button>;
  return (
    <form onSubmit={submit} className="space-y-2 fade-up">
      <input autoFocus value={title} onChange={e => setTitle((e as any).target.value)} placeholder="Agenda item title"
        className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"/>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="text-[11px] text-blue-400 font-medium disabled:opacity-50">{loading ? '…' : 'Add'}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-600">Cancel</button>
      </div>
    </form>
  );
}

function AddResolutionForm({ companyId, meetingId, agendaItemId, jwt, onAdded }: any) {
  const [title, setTitle] = useState('');
  const [text,  setText]  = useState('RESOLVED THAT the Board of Directors of [Company] hereby ');
  const [type,  setType]  = useState<'MEETING'|'NOTING'>('MEETING');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim() || !text.trim()) return;
    setLoading(true); setError('');
    try { await resApi.create(companyId, meetingId, { title, text, agendaItemId, type }, jwt); onAdded(); }
    catch (err: any) { setError((err as any).body?.message ?? 'Could not create resolution'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="bg-[#13161B] border border-[#232830] rounded-2xl p-5 space-y-4">
      <p className="text-zinc-400 text-sm font-semibold">New Resolution</p>

      {/* Type selector */}
      <div className="flex gap-2">
        {[{v:'MEETING',l:'Voting Resolution'},{v:'NOTING',l:'Noting Item (on record)'}].map(t => (
          <button key={t.v} type="button" onClick={() => { setType(t.v as any); if (t.v === 'NOTING') setText('The Board takes note of '); else setText('RESOLVED THAT the Board of Directors of [Company] hereby '); }}
            className={`flex-1 py-2 text-[11px] font-semibold rounded-lg border transition-all ${type === t.v
              ? 'bg-blue-950/60 border-blue-700 text-blue-300'
              : 'bg-transparent border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {t.l}
          </button>
        ))}
      </div>

      <div>
        <label className="text-zinc-600 text-[10px] uppercase tracking-widest block mb-1.5">Title</label>
        <input value={title} onChange={e => setTitle((e as any).target.value)} placeholder="e.g. Take Note of Certificate of Incorporation" required
          className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"/>
      </div>
      <div>
        <label className="text-zinc-600 text-[10px] uppercase tracking-widest block mb-1.5">
          {type === 'NOTING' ? 'Item Description' : 'Resolution Text'}
        </label>
        <Textarea value={text} onChange={e => setText((e as any).target.value)} rows={4} required minLength={20} placeholder={type === 'NOTING' ? 'The Board takes note of...' : 'RESOLVED THAT...'} />
        {type === 'MEETING' && <p className="text-zinc-700 text-[10px] mt-1">Must begin with "RESOLVED THAT". Minimum 50 characters.</p>}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={loading}>Add {type === 'NOTING' ? 'Noting Item' : 'Resolution'}</Button>
      </div>
    </form>
  );
}

function VotePill({ value }: { value: string }) {
  const map: Record<string,string> = {
    APPROVE: 'bg-green-950 text-green-400 border-green-800/50',
    REJECT:  'bg-red-950 text-red-400 border-red-800/50',
    ABSTAIN: 'bg-amber-950 text-amber-400 border-amber-800/50',
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
    <div className="h-screen bg-[#0D0F12] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="w-8 h-8" />
        <p className="text-zinc-600 text-sm">Loading meeting…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-screen bg-[#0D0F12] flex items-center justify-center">
      <div className="bg-red-950/40 border border-red-800/40 rounded-2xl p-8 text-center max-w-sm">
        <p className="text-red-400 text-sm mb-4">{message}</p>
        <button onClick={() => window.location.reload()} className="text-blue-400 text-xs hover:underline">Retry</button>
      </div>
    </div>
  );
}

// ── Meeting Documents Panel ───────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'DRAFT_NOTICE',     label: 'Draft Notice' },
  { value: 'DRAFT_AGENDA',     label: 'Draft Agenda' },
  { value: 'SUPPORTING_PAPER', label: 'Supporting Paper' },
  { value: 'DRAFT_RESOLUTION', label: 'Draft Resolution' },
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
          <p className="text-sm text-zinc-500 mt-1">Upload draft notices, agenda, and supporting papers. Share via a secure link in your invitation.</p>
        </div>
        {canManage && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Upload
          </button>
        )}
      </div>

      {/* Share link banner */}
      <div className={`rounded-xl border p-4 mb-6 ${shareLink?.isActive ? 'bg-[#0D1A0D] border-green-900/50' : 'bg-[#13161B] border-[#232830]'}`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-bold ${shareLink?.isActive ? 'text-green-400' : 'text-zinc-400'}`}>
            {shareLink?.isActive ? '🔗 Share link is active' : '🔗 Share link'}
          </p>
          {canManage && (
            <button onClick={handleShareToggle}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${shareLink?.isActive ? 'bg-red-950 border-red-800 text-red-400 hover:bg-red-900' : 'bg-[#1E2530] border-[#374151] text-zinc-400 hover:text-zinc-200'}`}>
              {shareLink?.isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
        {shareUrl ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-blue-300 bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-2 truncate">{shareUrl}</code>
            <button onClick={copyShareUrl} className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-[#1E2530] border border-[#374151] rounded-lg px-3 py-2">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">Activate to generate a public link for sharing documents with meeting attendees.</p>
        )}
        {docs.filter(d => d.isShared).length === 0 && shareLink?.isActive && (
          <p className="text-xs text-amber-500 mt-2">⚠ No documents marked as shared yet — toggle documents below to include them in the link.</p>
        )}
      </div>

      {/* Upload form */}
      {showForm && pendingFile && (
        <div className="bg-[#13161B] border border-[#4F7FFF]/30 rounded-xl p-5 mb-6">
          <p className="text-sm font-bold text-zinc-300 mb-4">📎 {pendingFile.name}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1">Document Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-600"
                placeholder="e.g. Draft Agenda — Q1 2026 Board Meeting" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none">
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setIsShared(s => !s)}
                className={`w-10 h-5 rounded-full transition-colors relative ${isShared ? 'bg-blue-600' : 'bg-[#232830]'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${isShared ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-medium text-zinc-400">Include in share link</span>
            </label>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setShowForm(false); setPendingFile(null); }}
              className="flex-1 bg-[#232830] text-zinc-400 text-sm font-semibold py-2 rounded-lg">Cancel</button>
            <button onClick={handleUpload} disabled={!title.trim() || uploading}
              className="flex-2 bg-blue-600 text-white text-sm font-semibold px-6 py-2 rounded-lg disabled:opacity-50">
              {uploading ? `Uploading… ${uploadPct}%` : 'Save Document'}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-sm">No documents uploaded yet.</p>
          {canManage && <p className="text-xs mt-2">Upload a draft agenda or notice to get started.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="bg-[#13161B] border border-[#232830] rounded-xl px-5 py-4 flex items-center gap-4 hover:border-[#374151] transition-colors">
              <span className="text-2xl flex-shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-zinc-200 truncate">{doc.title}</p>
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide border border-[#232830] px-1.5 py-0.5 rounded flex-shrink-0">
                    {DOC_TYPES.find(t => t.value === doc.docType)?.label ?? doc.docType}
                  </span>
                </div>
                <p className="text-xs text-zinc-600">{doc.fileName} · {doc.uploader.name} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Shared toggle */}
                {canManage && (
                  <button onClick={() => toggleShared(doc)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${doc.isShared ? 'bg-blue-950 border-blue-800 text-blue-400' : 'bg-transparent border-[#232830] text-zinc-600 hover:text-zinc-400'}`}>
                    {doc.isShared ? '🔗 Shared' : 'Share'}
                  </button>
                )}
                {doc.downloadUrl && (
                  <a href={resolveDownloadUrl(doc.downloadUrl, token)} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300">View ↗</a>
                )}
                {canManage && (
                  <button onClick={() => removeDoc(doc.id)}
                    className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLL CALL PANEL
// SS-1 Rule 3(4): each director participating via video must state their name,
// location, confirm no third party present, and confirm materials received.
// Recorded in minutes automatically.
// ─────────────────────────────────────────────────────────────────────────────

function RollCallPanel({
  companyId, meetingId, jwt, currentUserId, rollCall, onComplete,
}: {
  companyId: string; meetingId: string; jwt: string;
  currentUserId: string; rollCall: any; onComplete: () => void;
}) {
  const [location,          setLocation]          = useState('');
  const [noThirdParty,      setNoThirdParty]       = useState(false);
  const [materialsReceived, setMaterialsReceived]  = useState(false);
  const [saving,            setSaving]             = useState(false);
  const [err,               setErr]                = useState('');

  const myResponse = rollCall?.responses?.find((r: any) => r.userId === currentUserId);
  const alreadyResponded = !!myResponse;

  async function submit() {
    if (!location.trim()) { setErr('Please enter your current location.'); return; }
    if (!noThirdParty)    { setErr('Please confirm no third party is present at your location.'); return; }
    if (!materialsReceived) { setErr('Please confirm you have received the meeting notice and agenda.'); return; }
    setSaving(true); setErr('');
    try {
      await meetings.submitRollCall(companyId, meetingId, { location: location.trim(), noThirdParty, materialsReceived }, jwt);
      onComplete();
    } catch (e: any) {
      setErr(e?.body?.message ?? 'Could not submit roll call. Please try again.');
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-[#191D24] border border-[#232830] rounded-2xl p-6 mb-6 fade-up">
      <div className="mb-5">
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-1">SS-1 Rule 3(4)</p>
        <h2 className="text-white font-bold text-lg" style={{ fontFamily: "'Playfair Display',serif" }}>Roll Call</h2>
        <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
          Each director attending via video conferencing must confirm their details before proceedings can begin.
          These responses are recorded in the minutes.
        </p>
      </div>

      {/* Who has responded */}
      {rollCall?.responses?.length > 0 && (
        <div className="mb-5 space-y-2">
          {rollCall.responses.map((r: any) => (
            <div key={r.userId} className="flex items-center gap-3 bg-green-950/20 border border-green-800/20 rounded-xl px-4 py-2.5">
              <span className="text-green-400 text-sm">✓</span>
              <div className="flex-1">
                <p className="text-zinc-200 text-xs font-semibold">{r.user?.name}</p>
                <p className="text-zinc-500 text-[10px]">Attending from {r.location} · No third party confirmed</p>
              </div>
              <span className="text-[9px] text-green-400 font-semibold bg-green-950 border border-green-800/30 px-2 py-0.5 rounded-full">Confirmed</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending directors */}
      {rollCall?.pendingDirectors?.length > 0 && (
        <div className="mb-5">
          <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wider mb-2">Pending response</p>
          <div className="flex flex-wrap gap-2">
            {rollCall.pendingDirectors.map((d: any) => (
              <span key={d.userId} className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/30 px-2.5 py-1 rounded-full">
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Current director's response form */}
      {!alreadyResponded ? (
        <div className="border-t border-[#232830] pt-5 space-y-4">
          <p className="text-zinc-400 text-xs font-semibold">Your roll call response</p>

          <div>
            <label className="text-zinc-500 text-[10px] uppercase tracking-widest block mb-1.5">
              Current location <span className="text-red-400">*</span>
            </label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Mumbai, Maharashtra"
              className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={noThirdParty}
              onChange={e => setNoThirdParty(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
              style={{ accentColor: '#34D399', width: 14, height: 14 }}
            />
            <span className="text-xs text-zinc-300 leading-relaxed">
              I confirm that no person other than myself is present at my location during this meeting
              <span className="text-zinc-600"> (SS-1 Rule 3(4)(ii))</span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={materialsReceived}
              onChange={e => setMaterialsReceived(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
              style={{ accentColor: '#34D399', width: 14, height: 14 }}
            />
            <span className="text-xs text-zinc-300 leading-relaxed">
              I confirm that I have received the notice of this meeting and all agenda papers
              <span className="text-zinc-600"> (SS-1 Rule 3(4)(iii))</span>
            </span>
          </label>

          {err && (
            <p className="text-red-400 text-xs bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">{err}</p>
          )}

          <Button size="sm" onClick={submit} loading={saving}>
            Submit Roll Call Response
          </Button>
        </div>
      ) : (
        <div className="border-t border-[#232830] pt-4">
          <p className="text-green-400 text-xs font-semibold">
            ✓ You have submitted your roll call response from {myResponse.location}
          </p>
          {rollCall?.allResponded && (
            <p className="text-zinc-400 text-xs mt-2">All present directors have responded. Roll call is complete.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENT TASK BLOCK
// Shows the single next required action for the current meeting status.
// One clear directive at a time — no guesswork.
// ─────────────────────────────────────────────────────────────────────────────

function CurrentTaskBlock({
  meeting, rollCall, members, noticeAckedCount, onShowRollCall, onSetPanel,
}: {
  meeting: any; rollCall: any; members: any[];
  noticeAckedCount: number; onShowRollCall: () => void; onSetPanel: (p: string) => void;
}) {
  const directorCount = members.filter((m: any) =>
    ['DIRECTOR', 'COMPANY_SECRETARY'].includes(m.role)
  ).length;

  type Task = { icon: string; label: string; description: string; action?: () => void; actionLabel?: string; variant?: 'amber' | 'blue' | 'green' };
  let task: Task | null = null;

  if (meeting.status === 'SCHEDULED') {
    const allAcked = noticeAckedCount >= directorCount;
    const rollCallDone = !!rollCall?.rollCallCompletedAt;

    if (!allAcked) {
      task = {
        icon: '📋',
        label: 'Notice Acknowledgement',
        description: `${noticeAckedCount} of ${directorCount} directors have acknowledged receipt of the meeting notice. All directors must confirm before the meeting can open (SS-1 Rule 3(4)).`,
        variant: 'amber',
      };
    } else if (!rollCallDone) {
      task = {
        icon: '🎙',
        label: 'Roll Call Required',
        description: 'All directors must complete the roll call — confirming their location and that no third party is present — before the meeting can be opened to business (SS-1 Rule 3(4)).',
        action: onShowRollCall,
        actionLabel: 'Open Roll Call',
        variant: 'amber',
      };
    } else {
      task = {
        icon: '✓',
        label: 'Ready to Start',
        description: 'Notice acknowledged and roll call complete. Click "Start Meeting" to open the meeting to business.',
        variant: 'green',
      };
    }
  } else if (meeting.status === 'IN_PROGRESS') {
    if (!meeting.chairpersonId) {
      task = {
        icon: '⚑',
        label: 'Elect Chairperson — Agenda Item 1',
        description: 'The first act of every board meeting is the election of a Chairperson (SS-1 Annexure B). No other business can proceed until the Chairperson is elected.',
        action: () => onSetPanel('resolutions'),
        actionLabel: 'Go to Agenda Item 1',
        variant: 'amber',
      };
    } else if (!meeting.quorumConfirmedAt) {
      task = {
        icon: '◎',
        label: 'Chairperson to Confirm Quorum — Agenda Item 2',
        description: 'The elected Chairperson must formally confirm that the required quorum is present before any business can be transacted (Sec. 174 Companies Act 2013).',
        action: () => onSetPanel('resolutions'),
        actionLabel: 'Go to Agenda Item 2',
        variant: 'amber',
      };
    } else {
      // Meeting is properly open — show progress info, no blocking task
      return null;
    }
  } else {
    return null;
  }

  if (!task) return null;

  const colors = {
    amber: { bg: 'bg-amber-950/20', border: 'border-amber-800/30', icon: 'text-amber-400', btn: 'bg-amber-600 hover:bg-amber-500' },
    blue:  { bg: 'bg-blue-950/20',  border: 'border-blue-800/30',  icon: 'text-blue-400',  btn: 'bg-blue-600  hover:bg-blue-500'  },
    green: { bg: 'bg-green-950/20', border: 'border-green-800/30', icon: 'text-green-400', btn: 'bg-green-600 hover:bg-green-500' },
  }[task.variant ?? 'blue'];

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-2xl p-5 mb-6 flex items-start gap-4`}>
      <span className={`text-xl flex-shrink-0 mt-0.5 ${colors.icon}`}>{task.icon}</span>
      <div className="flex-1">
        <p className={`text-sm font-semibold mb-1 ${colors.icon}`}>{task.label}</p>
        <p className="text-zinc-400 text-xs leading-relaxed">{task.description}</p>
        {task.action && (
          <button
            onClick={task.action}
            className={`mt-3 ${colors.btn} text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors`}
          >
            {task.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
