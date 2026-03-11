'use client';
// app/(dashboard)/companies/[companyId]/meetings/[meetingId]/page.tsx

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { meetings, resolutions as resApi, voting, minutesApi } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import type { MeetingDetail, Resolution, AgendaItem, MeetingStatus, AttendanceRecord, AttendanceMode } from '@/lib/api';
import {
  StatusBadge, VoteBar, Avatar, Spinner, Button, Card, Textarea
} from '@/components/ui';

// ── Workflow helpers ──────────────────────────────────────────────────────────

const STATUS_ORDER: MeetingStatus[] = [
  'DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'VOTING', 'MINUTES_DRAFT', 'SIGNED', 'LOCKED',
];

const NEXT_STATUS_LABEL: Partial<Record<MeetingStatus, string>> = {
  DRAFT:         'Mark Scheduled',
  SCHEDULED:     'Start Meeting',
  IN_PROGRESS:   'Open Voting',
  VOTING:        'Close Voting',
  MINUTES_DRAFT: 'Sign Minutes',
};

function nextStatus(current: MeetingStatus): MeetingStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MeetingWorkspacePage() {
  const { companyId, meetingId } = useParams<{ companyId: string; meetingId: string }>();
  const jwt   = getToken()!;
  const me    = getUser();

  const [meeting,     setMeeting]     = useState<MeetingDetail | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [attendance,  setAttendance]  = useState<AttendanceRecord[]>([]);
  const [myRole,      setMyRole]      = useState<string>('OBSERVER');
  const [loading,     setLoading]     = useState(true);
  const [activeAgenda, setActiveAgenda] = useState<string | null>(null);
  const [panel,       setPanel]       = useState<'resolutions' | 'attendance' | 'minutes'>('resolutions');
  const [advancing,   setAdvancing]   = useState(false);
  const [error,       setError]       = useState('');

  const reload = useCallback(async () => {
    try {
      const [m, r, memberList] = await Promise.all([
        meetings.findOne(companyId, meetingId, jwt),
        resApi.listForMeeting(companyId, meetingId, jwt),
        import('@/lib/api').then(api => api.companies.listMembers(companyId, jwt)),
      ]);
      setMeeting(m);
      setResolutions(r);
      const me2 = memberList.find((mem: any) => mem.user.id === (me?.id ?? ''));
      if (me2) setMyRole(me2.role);
      if (!activeAgenda && m.agendaItems[0]) {
        setActiveAgenda(m.agendaItems[0].id);
      }
      // Load attendance for any status past DRAFT
      if (m.status !== 'DRAFT') {
        try {
          const att = await meetings.getAttendance(companyId, meetingId, jwt);
          setAttendance(att);
        } catch { /* attendance not critical */ }
      }
    } catch {
      setError('Failed to load meeting. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [companyId, meetingId, jwt]);

  useEffect(() => { reload(); }, [reload]);

  // Switch to attendance panel automatically when meeting goes IN_PROGRESS
  useEffect(() => {
    if (meeting?.status === 'IN_PROGRESS') setPanel('attendance');
  }, [meeting?.status]);

  async function advanceMeeting() {
    if (!meeting) return;
    const target = nextStatus(meeting.status as MeetingStatus);
    if (!target) return;

    setAdvancing(true);
    setError('');
    try {
      if (target === 'SIGNED') {
        await minutesApi.sign(companyId, meetingId, jwt);
      } else {
        await meetings.advance(companyId, meetingId, target, jwt);

        if (target === 'VOTING') {
          try { await resApi.bulkOpenVoting(companyId, meetingId, jwt); } catch { }
          setPanel('resolutions');
        }

        if (target === 'MINUTES_DRAFT') {
          await minutesApi.generate(companyId, meetingId, jwt);
          setPanel('minutes');
        }
      }
      await reload();
    } catch (err: any) {
      setError((err as any).body?.message ?? 'Could not advance meeting status.');
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!meeting) return null;

  const next    = nextStatus(meeting.status as MeetingStatus);
  const isAdmin = myRole === 'ADMIN' || myRole === 'DIRECTOR';

  const visibleResolutions = activeAgenda
    ? resolutions.filter(r => r.agendaItemId === activeAgenda)
    : resolutions;

  // Attendance summary for header indicator
  const presentCount = attendance.filter(a => a.attendance?.mode !== 'ABSENT').length;
  const totalCount   = attendance.length;

  return (
    <div className="flex flex-col h-screen bg-[#0D0F12] overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a303a; border-radius: 10px; }
      `}</style>

      {/* ── Meeting Header ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-[#13161B] border-b border-[#232830] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="text-zinc-600 text-xs flex items-center gap-1.5 flex-shrink-0">
              <a href={`/companies/${companyId}`} className="hover:text-zinc-400 transition-colors">Workspace</a>
              <span>›</span>
              <a href={`/companies/${companyId}/meetings`} className="hover:text-zinc-400 transition-colors">Meetings</a>
              <span>›</span>
            </div>
            <h1 className="text-white font-bold text-lg truncate"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              {meeting.title}
            </h1>
            <StatusBadge status={meeting.status.toLowerCase()} />
            {/* Attendance summary pill — shown when IN_PROGRESS or beyond */}
            {totalCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                {presentCount}/{totalCount} present
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {meeting.videoUrl && (
              <a href={meeting.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 bg-blue-950 border border-blue-800/50 px-3 py-1.5 rounded-lg hover:bg-blue-900 transition-colors">
                <span>▶</span>
                Join {meeting.videoProvider ?? 'Video Call'}
              </a>
            )}
            {isAdmin && (
              <a href={`/companies/${companyId}`}
                className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-950/40 border border-purple-800/40 px-3 py-1.5 rounded-lg hover:bg-purple-950 transition-colors">
                <span>◎</span> Invite Members
              </a>
            )}
            <span className="text-zinc-500 text-xs">
              {new Date(meeting.scheduledAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
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

        {/* ── Agenda Rail ─────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-[#13161B] border-r border-[#232830] flex flex-col overflow-y-auto">
          <div className="px-4 pt-5 pb-2">
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold">Agenda</p>
          </div>

          <nav className="flex flex-col gap-0.5 px-2 pb-4">
            {meeting.agendaItems.length === 0 ? (
              <p className="text-zinc-600 text-xs px-2 py-3">No agenda items yet.</p>
            ) : (
              meeting.agendaItems.map((item, idx) => {
                const itemResolutions = resolutions.filter(r => r.agendaItemId === item.id);
                const hasVoting = itemResolutions.some(r => r.status === 'VOTING');
                const allDone   = itemResolutions.length > 0 &&
                  itemResolutions.every(r => ['APPROVED', 'REJECTED'].includes(r.status));
                return (
                  <button key={item.id}
                    onClick={() => { setActiveAgenda(item.id === activeAgenda ? null : item.id); setPanel('resolutions'); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group
                      ${activeAgenda === item.id && panel === 'resolutions'
                        ? 'bg-blue-950/60 border border-blue-800/50'
                        : 'hover:bg-[#191D24] border border-transparent'}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full border text-[10px] font-bold
                        flex items-center justify-center mt-0.5
                        ${allDone   ? 'bg-green-950 border-green-700 text-green-400'
                        : hasVoting ? 'bg-amber-950 border-amber-700 text-amber-400'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                        {allDone ? '✓' : idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium leading-tight ${
                          activeAgenda === item.id && panel === 'resolutions' ? 'text-blue-300' : 'text-zinc-300'}`}>
                          {item.title}
                        </p>
                        {itemResolutions.length > 0 && (
                          <p className="text-zinc-600 text-[10px] mt-0.5">
                            {itemResolutions.length} resolution{itemResolutions.length !== 1 ? 's' : ''}
                            {hasVoting && ' · voting open'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </nav>

          {isAdmin && !['VOTING', 'MINUTES_DRAFT', 'SIGNED', 'LOCKED'].includes(meeting.status) && (
            <div className="px-3 pb-4 pt-2 border-t border-[#232830]">
              <AddAgendaForm companyId={companyId} meetingId={meetingId} jwt={jwt} onAdded={reload} />
            </div>
          )}

          {/* Panel switcher */}
          <div className="px-3 pb-4 pt-1 border-t border-[#232830] space-y-1">
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold mb-2 px-1">View</p>

            <button onClick={() => setPanel('resolutions')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                ${panel === 'resolutions' ? 'bg-[#191D24] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
              ◇ Resolutions
            </button>

            {/* Attendance — shown from SCHEDULED onwards */}
            {!['DRAFT'].includes(meeting.status) && (
              <button onClick={() => setPanel('attendance')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${panel === 'attendance' ? 'bg-[#191D24] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                ◎ Attendance
                {meeting.status === 'IN_PROGRESS' && (
                  <span className="ml-2 text-[9px] bg-amber-900/60 text-amber-400 border border-amber-700/40 px-1.5 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </button>
            )}

            {meeting.minutes && (
              <button onClick={() => setPanel('minutes')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${panel === 'minutes' ? 'bg-[#191D24] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                ▣ Minutes
              </button>
            )}
          </div>
        </aside>

        {/* ── Main Panel ──────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-8 py-7">

          {panel === 'resolutions' && (
            <ResolutionsPanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} resolutions={visibleResolutions}
              activeAgendaItem={meeting.agendaItems.find(a => a.id === activeAgenda)}
              currentUserId={me?.id ?? ''} onRefresh={reload} isAdmin={isAdmin}
            />
          )}

          {panel === 'attendance' && (
            <AttendancePanel
              companyId={companyId} meetingId={meetingId} jwt={jwt}
              meeting={meeting} attendance={attendance}
              isAdmin={isAdmin} onRefresh={reload}
            />
          )}

          {panel === 'minutes' && meeting.minutes && (
            <MinutesPanel minutes={meeting.minutes} />
          )}

        </main>
      </div>
    </div>
  );
}

// ── Workflow Progress Bar ─────────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: MeetingStatus }) {
  const steps = [
    { key: 'DRAFT',         label: 'Draft' },
    { key: 'SCHEDULED',     label: 'Scheduled' },
    { key: 'IN_PROGRESS',   label: 'In Meeting' },
    { key: 'VOTING',        label: 'Voting' },
    { key: 'MINUTES_DRAFT', label: 'Minutes' },
    { key: 'SIGNED',        label: 'Signed' },
    { key: 'LOCKED',        label: 'Archived' },
  ];
  const currentIdx = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((step, idx) => {
        const done    = idx < currentIdx;
        const current = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-0.5 w-full rounded-full transition-all duration-500 ${
                done ? 'bg-blue-500' : current ? 'bg-blue-500/50' : 'bg-[#232830]'}`} />
              <span className={`text-[9px] font-medium tracking-wide whitespace-nowrap ${
                current ? 'text-blue-400' : done ? 'text-zinc-500' : 'text-zinc-700'}`}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Attendance Panel ──────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: AttendanceMode; label: string; icon: string }[] = [
  { value: 'IN_PERSON', label: 'In Person',  icon: '◉' },
  { value: 'VIDEO',     label: 'Video',      icon: '▶' },
  { value: 'PHONE',     label: 'Phone',      icon: '◌' },
  { value: 'ABSENT',    label: 'Absent',     icon: '✕' },
];

interface AttendancePanelProps {
  companyId: string; meetingId: string; jwt: string;
  meeting: MeetingDetail;
  attendance: AttendanceRecord[];
  isAdmin: boolean;
  onRefresh: () => void;
}

function AttendancePanel({
  companyId, meetingId, jwt, meeting, attendance, isAdmin, onRefresh,
}: AttendancePanelProps) {
  const [saving, setSaving] = useState<string | null>(null); // userId being saved
  const [err,    setErr]    = useState('');

  const canEdit = isAdmin && ['SCHEDULED', 'IN_PROGRESS'].includes(meeting.status);

  async function record(userId: string, mode: AttendanceMode) {
    setSaving(userId);
    setErr('');
    try {
      await meetings.recordAttendance(companyId, meetingId, { userId, mode }, jwt);
      await onRefresh();
    } catch (e: any) {
      setErr((e as any).body?.message ?? 'Could not save attendance');
    } finally {
      setSaving(null);
    }
  }

  const present = attendance.filter(a => a.attendance && a.attendance.mode !== 'ABSENT');
  const absent  = attendance.filter(a => a.attendance?.mode === 'ABSENT');
  const unset   = attendance.filter(a => !a.attendance);

  // Quorum calc (Sec. 174) — 1/3rd or 2, whichever higher
  const total          = attendance.length;
  const quorumRequired = Math.max(2, Math.ceil(total / 3));
  const quorumMet      = present.length >= quorumRequired;

  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">
            Section 174 · Companies Act 2013
          </p>
          <h2 className="text-white text-xl font-bold"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.01em' }}>
            Attendance
          </h2>
        </div>
        {/* Quorum status */}
        {total > 0 && (
          <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${
            quorumMet
              ? 'bg-green-950/40 border-green-800/40 text-green-400'
              : 'bg-red-950/40 border-red-800/40 text-red-400'}`}>
            {quorumMet ? '✓ Quorum Met' : '✕ Quorum Not Met'}
            <span className="block text-[10px] font-normal opacity-70 mt-0.5">
              {present.length} of {total} present · min {quorumRequired} required
            </span>
          </div>
        )}
      </div>

      {err && <p className="text-red-400 text-xs mb-4">{err}</p>}

      {attendance.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-3xl mb-3">◎</p>
          <p className="text-sm">No directors found in this company.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {attendance.map(record => {
            const currentMode = record.attendance?.mode ?? null;
            const isSaving    = saving === record.userId;

            return (
              <div key={record.userId}
                className="bg-[#191D24] border border-[#232830] rounded-xl p-4 flex items-center gap-4">

                {/* Director info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-200 truncate">{record.name}</p>
                    {record.isChairman && (
                      <span className="text-[9px] font-bold bg-amber-900/40 text-amber-400 border border-amber-700/30 px-1.5 py-0.5 rounded-full">
                        Chairman
                      </span>
                    )}
                    <span className="text-[9px] text-zinc-600">{record.role}</span>
                  </div>
                  <p className="text-zinc-600 text-[11px] mt-0.5 truncate">{record.email}</p>
                </div>

                {/* Mode selector */}
                {canEdit ? (
                  <div className="flex gap-1.5">
                    {MODE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        disabled={isSaving}
                        onClick={() => record(record.userId, opt.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all
                          ${currentMode === opt.value
                            ? opt.value === 'ABSENT'
                              ? 'bg-red-950/60 border-red-700/60 text-red-400'
                              : 'bg-blue-950/60 border-blue-700/60 text-blue-300'
                            : 'bg-transparent border-zinc-700/50 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400'}
                          ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {isSaving && currentMode === opt.value ? '…' : `${opt.icon} ${opt.label}`}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Read-only badge after meeting moves past IN_PROGRESS */
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                    !currentMode
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-500'
                      : currentMode === 'ABSENT'
                        ? 'bg-red-950/40 border-red-800/40 text-red-400'
                        : 'bg-green-950/40 border-green-800/40 text-green-400'}`}>
                    {currentMode
                      ? MODE_OPTIONS.find(m => m.value === currentMode)?.label ?? currentMode
                      : 'Not recorded'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unset warning when IN_PROGRESS */}
      {meeting.status === 'IN_PROGRESS' && unset.length > 0 && (
        <div className="mt-4 bg-amber-950/20 border border-amber-800/30 rounded-xl p-3.5 text-xs text-amber-400">
          <strong>{unset.length} director{unset.length > 1 ? 's' : ''}</strong> not yet marked.
          Please record attendance for all directors before opening voting.
        </div>
      )}
    </div>
  );
}

// ── Resolutions Panel ─────────────────────────────────────────────────────────

interface ResolutionsPanelProps {
  companyId: string; meetingId: string; jwt: string;
  meeting: MeetingDetail; resolutions: Resolution[];
  activeAgendaItem?: AgendaItem; currentUserId: string;
  onRefresh: () => void; isAdmin: boolean;
}

function ResolutionsPanel({
  companyId, meetingId, jwt, meeting, resolutions,
  activeAgendaItem, currentUserId, onRefresh, isAdmin,
}: ResolutionsPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const canAdd = !['VOTING', 'MINUTES_DRAFT', 'SIGNED', 'LOCKED'].includes(meeting.status);

  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">
            {activeAgendaItem ? `Agenda — ${activeAgendaItem.title}` : 'All Resolutions'}
          </p>
          <h2 className="text-white text-xl font-bold"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '-0.01em' }}>
            Board Resolutions
          </h2>
        </div>
        {isAdmin && canAdd && (
          <Button size="sm" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? '✕ Cancel' : '+ New Resolution'}
          </Button>
        )}
      </div>

      {showAdd && (
        <div className="mb-5 fade-up">
          <AddResolutionForm
            companyId={companyId} meetingId={meetingId}
            agendaItemId={activeAgendaItem?.id} jwt={jwt}
            onAdded={() => { setShowAdd(false); onRefresh(); }}
          />
        </div>
      )}

      {resolutions.length === 0 && (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-3xl mb-3">◇</p>
          <p className="text-sm">No resolutions yet for this agenda item.</p>
          {isAdmin && canAdd && (
            <button onClick={() => setShowAdd(true)} className="mt-3 text-blue-400 text-xs hover:text-blue-300">
              + Add first resolution
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {resolutions.map((res, idx) => (
          <ResolutionCard
            key={res.id} resolution={res} index={idx + 1}
            companyId={companyId} jwt={jwt} currentUserId={currentUserId}
            meeting={meeting} isAdmin={isAdmin} onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}

// ── Resolution Card ───────────────────────────────────────────────────────────

interface ResolutionCardProps {
  resolution: Resolution; index: number;
  companyId: string; jwt: string; currentUserId: string;
  meeting: MeetingDetail; isAdmin: boolean; onRefresh: () => void;
}

function ResolutionCard({
  resolution, index, companyId, jwt, currentUserId, meeting, isAdmin, onRefresh,
}: ResolutionCardProps) {
  const [expanded,  setExpanded]  = useState(resolution.status === 'VOTING');
  const [isVoting,  setIsVoting]  = useState(false);
  const [myVote,    setMyVote]    = useState<'APPROVE' | 'REJECT' | 'ABSTAIN' | null>(null);
  const [castError, setCastError] = useState('');
  const [proposing, setProposing] = useState(false);

  const existingVote = resolution.votes?.find(v => v.user.id === currentUserId);
  const hasVoted     = !!existingVote;

  const borderColor =
    resolution.status === 'APPROVED' ? 'border-green-800/50' :
    resolution.status === 'REJECTED' ? 'border-red-800/50'   :
    resolution.status === 'VOTING'   ? 'border-amber-800/40' :
    'border-[#232830]';

  const accentBar =
    resolution.status === 'APPROVED' ? 'bg-green-500' :
    resolution.status === 'REJECTED' ? 'bg-red-500'   :
    resolution.status === 'VOTING'   ? 'bg-amber-500' :
    'bg-blue-600';

  async function propose() {
    setProposing(true);
    try {
      await resApi.propose(companyId, resolution.id, jwt);
      onRefresh();
    } catch (e: any) {
      setCastError((e as any).body?.message ?? 'Could not propose resolution');
    } finally { setProposing(false); }
  }

  async function castVote(value: 'APPROVE' | 'REJECT' | 'ABSTAIN') {
    setMyVote(value);
    setIsVoting(true);
    setCastError('');
    try {
      await voting.castVote(companyId, resolution.id, { value }, jwt);
      onRefresh();
    } catch (e: any) {
      setCastError((e as any).body?.message ?? 'Could not cast vote');
      setMyVote(null);
    } finally { setIsVoting(false); }
  }

  const totalVotes = (resolution.tally?.APPROVE ?? 0) +
                     (resolution.tally?.REJECT  ?? 0) +
                     (resolution.tally?.ABSTAIN ?? 0);

  return (
    <div className={`bg-[#191D24] border ${borderColor} rounded-2xl overflow-hidden transition-all duration-200`}>
      <div className={`h-0.5 ${accentBar}`} />
      <button
        className="w-full text-left px-6 py-4 flex items-start justify-between gap-4 hover:bg-[#1d2229] transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
            {index}
          </span>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-snug">{resolution.title}</p>
            {resolution.status === 'VOTING' && (
              <p className="text-amber-400 text-[11px] mt-0.5">
                {totalVotes} of {resolution.directorCount ?? '?'} voted
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={resolution.status.toLowerCase()} />
          <span className="text-zinc-600 text-xs">{expanded ? '▴' : '▾'}</span>
        </div>
      </button>

      {['VOTING', 'APPROVED', 'REJECTED'].includes(resolution.status) && (
        <div className="px-6 pb-3">
          <VoteBar
            approve={resolution.tally?.APPROVE ?? 0}
            reject={resolution.tally?.REJECT  ?? 0}
            abstain={resolution.tally?.ABSTAIN ?? 0}
            total={resolution.directorCount ?? 5}
          />
        </div>
      )}

      {expanded && (
        <div className="px-6 pb-5 fade-up space-y-4 border-t border-[#232830] pt-4">
          <div className="bg-[#13161B] border-l-2 border-zinc-700 pl-4 py-3 pr-3 rounded-r-xl">
            <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap">{resolution.text}</p>
          </div>

          {isAdmin && resolution.status === 'DRAFT' && meeting.status === 'IN_PROGRESS' && (
            <Button size="sm" onClick={propose} loading={proposing}>Propose Resolution</Button>
          )}

          {resolution.status === 'VOTING' && !hasVoted && (
            <div>
              <p className="text-zinc-500 text-xs mb-2 font-medium">Cast your vote</p>
              <div className="flex gap-2">
                {[
                  { value: 'APPROVE' as const, label: '✓ Approve', idle: 'border-zinc-700 text-zinc-400 hover:border-green-700 hover:text-green-400', active: 'bg-green-950/60 border-green-700 text-green-400' },
                  { value: 'REJECT'  as const, label: '✕ Reject',  idle: 'border-zinc-700 text-zinc-400 hover:border-red-700 hover:text-red-400',   active: 'bg-red-950/60 border-red-700 text-red-400' },
                  { value: 'ABSTAIN' as const, label: '— Abstain', idle: 'border-zinc-700 text-zinc-400 hover:border-amber-700 hover:text-amber-400', active: 'bg-amber-950/60 border-amber-700 text-amber-400' },
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

          {resolution.status === 'VOTING' && hasVoted && (
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

function MinutesPanel({ minutes }: { minutes: NonNullable<MeetingDetail['minutes']> }) {
  return (
    <div className="max-w-2xl fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-1">Generated Document</p>
          <h2 className="text-white text-xl font-bold"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Meeting Minutes
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={minutes.status.toLowerCase()} />
          {minutes.status === 'SIGNED' && (
            <Button size="sm" variant="outline">⬇ Download PDF</Button>
          )}
        </div>
      </div>

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
        style={{ fontSize: '13px', lineHeight: '1.8' }}
        dangerouslySetInnerHTML={{ __html: minutes.content }}
      />
    </div>
  );
}

// ── Add Agenda Form ───────────────────────────────────────────────────────────

function AddAgendaForm({
  companyId, meetingId, jwt, onAdded,
}: { companyId: string; meetingId: string; jwt: string; onAdded: () => void }) {
  const [open,    setOpen]    = useState(false);
  const [title,   setTitle]   = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await meetings.addAgendaItem(companyId, meetingId, { title }, jwt);
      setTitle('');
      setOpen(false);
      onAdded();
    } finally { setLoading(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors w-full text-left">
      + Add agenda item
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-2 fade-up">
      <input autoFocus value={title} onChange={e => setTitle((e as any).target.value)}
        placeholder="Agenda item title"
        className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="text-[11px] text-blue-400 font-medium disabled:opacity-50">
          {loading ? '…' : 'Add'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-600">Cancel</button>
      </div>
    </form>
  );
}

// ── Add Resolution Form ───────────────────────────────────────────────────────

function AddResolutionForm({
  companyId, meetingId, agendaItemId, jwt, onAdded,
}: {
  companyId: string; meetingId: string; agendaItemId?: string;
  jwt: string; onAdded: () => void;
}) {
  const [title,   setTitle]   = useState('');
  const [text,    setText]    = useState('RESOLVED THAT the Board of Directors of [Company] hereby ');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function submit(e: React.FormEvent) {
    (e as any).preventDefault();
    if (!title.trim() || !text.trim()) return;
    setLoading(true);
    setError('');
    try {
      await resApi.create(companyId, meetingId, { title, text, agendaItemId }, jwt);
      onAdded();
    } catch (err: any) {
      setError((err as any).body?.message ?? 'Could not create resolution');
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="bg-[#13161B] border border-[#232830] rounded-2xl p-5 space-y-4">
      <p className="text-zinc-400 text-sm font-semibold">New Resolution</p>
      <div>
        <label className="text-zinc-600 text-[10px] uppercase tracking-widest block mb-1.5">Title</label>
        <input value={title} onChange={e => setTitle((e as any).target.value)}
          placeholder="e.g. Approve Series A Investment" required
          className="w-full bg-[#0D0F12] border border-[#232830] rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"
        />
      </div>
      <div>
        <label className="text-zinc-600 text-[10px] uppercase tracking-widest block mb-1.5">Resolution Text</label>
        <Textarea value={text} onChange={e => setText((e as any).target.value)}
          rows={4} required minLength={50}
          placeholder="RESOLVED THAT the Board of Directors hereby..." />
        <p className="text-zinc-700 text-[10px] mt-1">Must begin with "RESOLVED THAT". Minimum 50 characters.</p>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={loading}>Add Resolution</Button>
      </div>
    </form>
  );
}

// ── Vote Pill ─────────────────────────────────────────────────────────────────

function VotePill({ value }: { value: 'APPROVE' | 'REJECT' | 'ABSTAIN' }) {
  const map = {
    APPROVE: 'bg-green-950 text-green-400 border-green-800/50',
    REJECT:  'bg-red-950 text-red-400 border-red-800/50',
    ABSTAIN: 'bg-amber-950 text-amber-400 border-amber-800/50',
  };
  const labels = { APPROVE: '✓ Approve', REJECT: '✕ Reject', ABSTAIN: '— Abstain' };
  return (
    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[value]}`}>
      {labels[value]}
    </span>
  );
}

// ── Loading / Error states ────────────────────────────────────────────────────

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
        <button onClick={() => window.location.reload()} className="text-blue-400 text-xs hover:underline">
          Retry
        </button>
      </div>
    </div>
  );
}
