'use client';
// app/(dashboard)/companies/[companyId]/page.tsx
// Four-tab company workspace: Overview · Members · Invites · Audit Log

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  companies as companiesApi,
  invitations as invitationsApi,
  meetings   as meetingsApi,
  type CompanyDetail,
  type CompanyMember,
  type PendingInvite,
  type Meeting,
  type AuditLog,
} from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import ClaimSeatPrompt from '@/components/ClaimSeatPrompt';

// ── Designation config ────────────────────────────────────────────────────────

const DESIGNATIONS_BY_ROLE: Record<string, { value: string; label: string }[]> = {
  DIRECTOR: [
    { value: 'EXECUTIVE_DIRECTOR',     label: 'Executive Director' },
    { value: 'NON_EXECUTIVE_DIRECTOR', label: 'Non-Executive Director' },
    { value: 'INDEPENDENT_DIRECTOR',   label: 'Independent Director' },
    { value: 'NOMINEE_DIRECTOR',       label: 'Nominee Director' },
    { value: 'MANAGING_DIRECTOR',      label: 'Managing Director' },
    { value: 'DIRECTOR_SIMPLICITOR',   label: 'Director Simplicitor' },
  ],
  COMPANY_SECRETARY: [
    { value: 'WHOLE_TIME_CS', label: 'Whole-Time Company Secretary' },
    { value: 'CS_IN_PRACTICE', label: 'CS in Practice' },
    { value: 'CS_AS_KMP',     label: 'CS as KMP' },
  ],
  AUDITOR: [
    { value: 'STATUTORY_AUDITOR', label: 'Statutory Auditor' },
    { value: 'INTERNAL_AUDITOR',  label: 'Internal Auditor' },
    { value: 'COST_AUDITOR',      label: 'Cost Auditor' },
  ],
  OBSERVER: [],
};

const DESIGNATION_LABELS: Record<string, string> = {
  EXECUTIVE_DIRECTOR:     'Executive Director',
  NON_EXECUTIVE_DIRECTOR: 'Non-Executive Director',
  INDEPENDENT_DIRECTOR:   'Independent Director',
  NOMINEE_DIRECTOR:       'Nominee Director',
  MANAGING_DIRECTOR:      'Managing Director',
  DIRECTOR_SIMPLICITOR:   'Director Simplicitor',
  WHOLE_TIME_CS:          'Whole-Time CS',
  CS_IN_PRACTICE:         'CS in Practice',
  CS_AS_KMP:              'CS as KMP',
  STATUTORY_AUDITOR:      'Statutory Auditor',
  INTERNAL_AUDITOR:       'Internal Auditor',
  COST_AUDITOR:           'Cost Auditor',
};

// ── Conflict detection ────────────────────────────────────────────────────────

function detectConflicts(members: CompanyMember[]): string[] {
  const warnings: string[] = [];

  // Duplicate Managing Director
  const mds = members.filter(m => m.additionalDesignation === 'MANAGING_DIRECTOR');
  if (mds.length > 1) {
    warnings.push(`Multiple Managing Directors detected (${mds.map(m => m.user.name).join(', ')}). Only one MD is permitted under the Companies Act.`);
  }

  // Duplicate Whole-Time CS
  const wcs = members.filter(m => m.additionalDesignation === 'WHOLE_TIME_CS');
  if (wcs.length > 1) {
    warnings.push(`Multiple Whole-Time Company Secretaries detected. A company may appoint only one Whole-Time CS.`);
  }

  // Statutory Auditor also flagged as Director
  const auditorDirectors = members.filter(m =>
    m.role === 'AUDITOR' && (m.additionalDesignation === 'STATUTORY_AUDITOR') &&
    (m.user as any).platformRoles?.includes('DIRECTOR')
  );
  if (auditorDirectors.length > 0) {
    warnings.push(`${auditorDirectors[0].user.name} is a Statutory Auditor but has a Director platform role. Auditor independence may be compromised under Section 141 of the Companies Act.`);
  }

  // CS set as Director role (role mismatch)
  const csAsDirector = members.filter(m =>
    (m.user as any).platformRoles?.includes('CS') && m.role === 'DIRECTOR'
  );
  if (csAsDirector.length > 0) {
    csAsDirector.forEach(m => {
      warnings.push(`${m.user.name} holds a CS platform profile but is assigned the Director role. Verify this is intentional — a Whole-Time CS cannot simultaneously act as a Director under the Companies Act.`);
    });
  }

  return warnings;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

const ROLE_SHORT: Record<string, string> = {
  DIRECTOR:          'Director — votes on resolutions, signs minutes',
  COMPANY_SECRETARY: 'Company Secretary — records and certifies board actions',
  AUDITOR:           'Statutory Auditor — independent financial oversight',
  OBSERVER:          'Observer — attends meetings, no voting rights',
};

const ROLE_CLS: Record<string, string> = {
  DIRECTOR:          'text-[#1D4ED8] bg-[#EFF6FF]/60 border-[#BFDBFE]/40',
  COMPANY_SECRETARY: 'text-[#6B21A8] bg-[#FAF5FF] border-[#D8B4FE]',
  AUDITOR:           'text-[#166534] bg-[#F0FDF4] border-[#86EFAC]',
  OBSERVER:          'text-[#5C5750] bg-[#EBE6DF] border-[#E0DAD2]',
};

function RoleBadge({ role, isWorkspaceAdmin, additionalDesignation }: {
  role: string; isWorkspaceAdmin?: boolean; additionalDesignation?: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${ROLE_CLS[role] ?? ROLE_CLS.OBSERVER}`}>
        {role === 'COMPANY_SECRETARY' ? 'CS' : role}
      </span>
      {isWorkspaceAdmin && (
        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide text-amber-800 bg-amber-50 border-amber-200">
          Admin
        </span>
      )}
      {additionalDesignation && (
        <span className="text-[10px] px-2 py-0.5 rounded-full border text-[#5C5750] bg-[#EBE6DF] border-[#E0DAD2] italic">
          {DESIGNATION_LABELS[additionalDesignation] ?? additionalDesignation}
        </span>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-[#EBE6DF] border border-[#E0DAD2] flex items-center justify-center text-[#5C5750] font-bold text-[11px] flex-shrink-0">
      {initials}
    </div>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-[#E0DAD2] border-t-[#8B1A1A] rounded-full animate-spin" />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'text-[#5C5750] bg-[#EBE6DF]', SCHEDULED: 'text-[#1D4ED8] bg-[#EFF6FF]',
    IN_PROGRESS: 'text-[#166534] bg-[#F0FDF4]', VOTING: 'text-[#92400E] bg-amber-50',
    MINUTES_DRAFT: 'text-[#6B21A8] bg-purple-50', SIGNED: 'text-[#166534] bg-[#F0FDF4]',
    LOCKED: 'text-[#5C5750] bg-[#EBE6DF]',
  };
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${map[status] ?? map.DRAFT}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

type TabId = 'overview' | 'members' | 'audit' | 'settings';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompanyWorkspacePage() {
  const { companyId } = useParams<{ companyId: string }>();
  if (companyId === 'new') return null;
  const jwt = getToken()!;
  const me  = getUser();

  const [tab,      setTab]      = useState<TabId>('overview');
  const [company,  setCompany]  = useState<CompanyDetail | null>(null);
  const [members,  setMembers]  = useState<CompanyMember[]>([]);
  const [pending,  setPending]  = useState<PendingInvite[]>([]);
  const [audit,    setAudit]    = useState<AuditLog[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('DIRECTOR');
  const [inviting,    setInviting]    = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState({ ok: '', err: '' });

  // Designation edit modal
  const [editMember,      setEditMember]      = useState<CompanyMember | null>(null);
  // Company settings form state
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsErr,    setSettingsErr]    = useState('');
  const [settingsOk,     setSettingsOk]     = useState(false);
  const [sfName,         setSfName]         = useState('');
  const [sfCin,          setSfCin]          = useState('');
  const [sfPan,          setSfPan]          = useState('');
  const [sfAddress,      setSfAddress]      = useState('');
  const [sfEmail,        setSfEmail]        = useState('');
  const [sfWebsite,      setSfWebsite]      = useState('');
  const [editDesig,       setEditDesig]       = useState('');
  const [editDesigLabel,  setEditDesigLabel]  = useState('');
  const [editRole,        setEditRole]        = useState('');
  const [savingDesig,     setSavingDesig]     = useState(false);

  // Transfer admin modal
  const [showTransfer,    setShowTransfer]    = useState(false);
  const [claimDismissed,  setClaimDismissed]  = useState(false);
  const [transferTarget,  setTransferTarget]  = useState('');
  const [transferring,    setTransferring]    = useState(false);
  const [transferErr,     setTransferErr]     = useState('');

  const myMem   = members.find(m => m.userId === me?.id);
  const isAdmin = myMem?.isWorkspaceAdmin === true;
  const conflicts = detectConflicts(members);

  const load = useCallback(async () => {
    const [co, mems, mtgs] = await Promise.all([
      companiesApi.findOne(companyId, jwt),
      companiesApi.listMembers(companyId, jwt),
      meetingsApi.list(companyId, jwt),
    ]);
    setCompany(co); setMembers(mems); setMeetings(mtgs);
    // Populate settings form fields from loaded company data
    setSfName(co.name ?? '');
    setSfCin(co.cin ?? '');
    setSfPan((co as any).pan ?? '');
    setSfAddress(co.registeredAt ?? '');
    setSfEmail(co.email ?? '');
    setSfWebsite(co.website ?? '');
    if (isAdmin) {
      const [inv, al] = await Promise.all([
        invitationsApi.listPending(companyId, jwt),
        companiesApi.getAuditLog(companyId, jwt),
      ]);
      setPending(inv); setAudit(al);
    }
    setLoading(false);
  }, [companyId, jwt, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── Invite ──────────────────────────────────────────────────────────────────
  async function sendInvite(e: React.FormEvent) {
    (e as any).preventDefault();
    setInviting(true); setInviteMsg({ ok: '', err: '' });
    try {
      await invitationsApi.send(companyId, { email: inviteEmail, role: inviteRole }, jwt);
      setInviteMsg({ ok: `Invite sent to ${inviteEmail}.`, err: '' });
      setInviteEmail(''); await load();
    } catch (err: any) {
      setInviteMsg({ ok: '', err: err?.body?.message ?? 'Failed to send invite.' });
    } finally { setInviting(false); }
  }

  // ── Designation modal ───────────────────────────────────────────────────────
  function openEditModal(m: CompanyMember) {
    setEditMember(m);
    setEditRole(m.role);
    setEditDesig(m.additionalDesignation ?? '');
    setEditDesigLabel(m.designationLabel ?? '');
  }

  async function saveDesignation() {
    if (!editMember) return;
    setSavingDesig(true);
    try {
      await companiesApi.updateMemberRole(companyId, editMember.userId, {
        role: editRole !== editMember.role ? editRole : undefined,
        additionalDesignation: editDesig || null,
        designationLabel: editDesigLabel || null,
      }, jwt);
      await load();
      setEditMember(null);
    } catch (err: any) {
      alert(err?.body?.message ?? 'Failed to save.');
    } finally { setSavingDesig(false); }
  }

  // ── Transfer admin ──────────────────────────────────────────────────────────
  async function doTransfer() {
    if (!transferTarget) return;
    setTransferring(true); setTransferErr('');
    try {
      await companiesApi.transferAdmin(companyId, transferTarget, jwt);
      await load();
      setShowTransfer(false); setTransferTarget('');
    } catch (err: any) {
      setTransferErr(err?.body?.message ?? 'Transfer failed.');
    } finally { setTransferring(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  const upcoming = meetings
    .filter(m => !['SIGNED','LOCKED'].includes(m.status))
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: '⬡ Overview' },
    { id: 'members',  label: `◈ People & Access` },
    { id: 'audit',    label: '▣ Audit Log' },
    ...(isAdmin ? [{ id: 'settings' as TabId, label: '⚙ Settings' }] : []),
  ];

  // Directors eligible for admin transfer (not self, not already admin, must be DIRECTOR role)
  const transferCandidates = members.filter(m =>
    m.userId !== me?.id && !m.isWorkspaceAdmin && m.role === 'DIRECTOR'
  );

  return (
    <div className="px-10 py-8 max-w-5xl" style={{ fontFamily: "'Instrument Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');`}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#EBE6DF] border border-[#E0DAD2] flex items-center justify-center text-[#5C5750] font-black text-xl">
            {company?.name[0]}
          </div>
          <div>
            <h1 className="text-[#231F1B] font-bold text-2xl" style={{ fontFamily: "'Playfair Display',serif", letterSpacing: '-0.02em' }}>
              {company?.name}
            </h1>
            {company?.cin && <p className="text-[#96908A] text-xs mt-1">CIN: {company.cin}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/companies/${companyId}/meetings`}  className="text-sm font-semibold text-[#231F1B] bg-[#FDFCFB] border border-[#E0DAD2] px-4 py-2 rounded-lg hover:border-[#8B1A1A]/30 hover:text-[#8B1A1A] transition-colors">◈ Meetings</Link>
          <Link href={`/companies/${companyId}/templates`} className="text-sm font-semibold text-[#231F1B] bg-[#FDFCFB] border border-[#E0DAD2] px-4 py-2 rounded-lg hover:border-[#8B1A1A]/30 hover:text-[#8B1A1A] transition-colors">▦ Templates</Link>
          <Link href={`/companies/${companyId}/vault`}     className="text-sm font-semibold text-[#231F1B] bg-[#FDFCFB] border border-[#E0DAD2] px-4 py-2 rounded-lg hover:border-[#8B1A1A]/30 hover:text-[#8B1A1A] transition-colors">⊟ Vault</Link>
          <Link href={`/companies/${companyId}/archive`}   className="text-sm font-semibold text-[#231F1B] bg-[#FDFCFB] border border-[#E0DAD2] px-4 py-2 rounded-lg hover:border-[#8B1A1A]/30 hover:text-[#8B1A1A] transition-colors">▤ Archive</Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-7">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === t.id ? 'bg-[#FDFCFB] text-[#231F1B] border border-[#E0DAD2]' : 'text-[#96908A] hover:text-[#231F1B]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {!claimDismissed && myMem && !(myMem as any).din && company && (
            <ClaimSeatPrompt
              companyId={companyId}
              currentUserName={me?.name ?? ''}
              mcaDirectors={(company as any).mcaDirectors ?? null}
              onClaimed={() => { setClaimDismissed(true); load(); }}
              onDismiss={() => setClaimDismissed(true)}
            />
          )}
          <div>
            <p className="text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-3">What you can do here</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '⬡', label: 'Board Meetings',      count: company?._count.meetings    ?? 0, desc: 'Schedule, conduct and sign off board meetings end-to-end. Attendance, voting, minutes — all in one place.',                                href: '/companies/' + companyId + '/meetings',              color: '#8B1A1A', bg: 'bg-[#FDFCFB] border-[#E0DAD2]' },
                { icon: '◎', label: 'Resolutions',          count: company?._count.resolutions ?? 0, desc: 'Track every board resolution with vote tallies, dissent records, and certified copies for banks and regulators.',                        href: '/companies/' + companyId + '/resolutions',            color: '#92400E', bg: 'bg-amber-50 border-amber-200' },
                { icon: '⬡', label: 'Document Vault',       count: company?._count.documents   ?? 0, desc: 'Secure storage for statutory documents — MOA, AOA, incorporation certificate, board papers, and compliance filings.',                    href: '/companies/' + companyId + '/vault',                  color: '#6B21A8', bg: 'bg-purple-50 border-purple-200' },
                { icon: '↻', label: 'Circular Resolutions', count: 0,                               desc: 'Pass urgent resolutions without a meeting — circulate to all directors and collect approvals digitally per Sec. 175.',                    href: '/companies/' + companyId + '/circular-resolutions',   color: '#166534', bg: 'bg-green-50 border-green-200' },
              ].map(mod => (
                <Link key={mod.label} href={mod.href}
                  className={'flex flex-col gap-3 p-5 rounded-2xl border ' + mod.bg + ' hover:brightness-110 transition-all group'}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span style={{ color: mod.color }} className="text-lg">{mod.icon}</span>
                      <span className="text-[#231F1B] font-semibold text-sm">{mod.label}</span>
                    </div>
                    <span className="font-bold text-lg font-mono" style={{ color: mod.color }}>{mod.count}</span>
                  </div>
                  <p className="text-[#96908A] text-xs leading-relaxed">{mod.desc}</p>
                  <span className="text-xs font-semibold group-hover:translate-x-0.5 transition-transform" style={{ color: mod.color }}>Open →</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3 bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[#231F1B] font-semibold text-sm">Upcoming Meetings</h2>
                <Link href={'/companies/' + companyId + '/meetings'} className="text-[#8B1A1A] text-xs font-medium hover:underline">View all →</Link>
              </div>
              <p className="text-[#96908A] text-xs mb-4 leading-relaxed">Board meetings managed end-to-end in full compliance with SS-1.</p>
              {upcoming.length === 0
                ? <p className="text-[#96908A] text-sm text-center py-6">No upcoming meetings. Schedule one to get started.</p>
                : upcoming.slice(0, 4).map(m => (
                  <Link key={m.id} href={'/companies/' + companyId + '/meetings/' + m.id}
                    className="flex items-center justify-between px-4 py-3 bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl hover:border-[#8B1A1A]/25 transition-colors mb-2 group">
                    <div>
                      <p className="text-[#231F1B] text-sm font-medium group-hover:text-[#8B1A1A] transition-colors">{m.title}</p>
                      <p className="text-[#96908A] text-xs mt-0.5">{new Date(m.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <StatusPill status={m.status} />
                  </Link>
                ))
              }
            </div>
            <div className="col-span-2 bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[#231F1B] font-semibold text-sm">Board Members</h2>
                <button onClick={() => setTab('members')} className="text-[#8B1A1A] text-xs font-medium hover:underline">Manage →</button>
              </div>
              <p className="text-[#96908A] text-xs mb-4 leading-relaxed">Each role determines what appears in minutes and what they can do in meetings.</p>
              <div className="space-y-2">
                {members.slice(0, 6).map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl">
                    <Avatar name={m.user.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#231F1B] text-xs font-semibold truncate">
                        {m.user.name}{m.userId === me?.id && <span className="ml-1.5 text-[#7A5C18] text-[9px]">you</span>}
                      </p>
                      <p className="text-[#96908A] text-[10px] truncate">{ROLE_SHORT[m.role as keyof typeof ROLE_SHORT] ?? m.role}</p>
                    </div>
                    {m.isWorkspaceAdmin && (
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">Admin</span>
                    )}
                  </div>
                ))}
                {members.length > 6 && <p className="text-[#96908A] text-xs text-center pt-1">+{members.length - 6} more</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MEMBERS ──────────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              {conflicts.map((w, i) => (
                <div key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <span className="text-amber-700 text-sm mt-0.5 flex-shrink-0">⚠</span>
                  <p className="text-amber-700 text-xs leading-relaxed">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Transfer admin button — only visible to current workspace admin */}
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => { setShowTransfer(true); setTransferErr(''); setTransferTarget(''); }}
                className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg hover:bg-amber-100 transition-colors"
              >
                ⇄ Transfer Workspace Admin
              </button>
            </div>
          )}

          <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl overflow-hidden">
            {members.length === 0
              ? <p className="text-center text-[#96908A] py-12">No members yet.</p>
              : <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E0DAD2]">
                      {['Member', 'Email', 'Role & Designation', 'Joined', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-[#96908A] uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      const isSelf = m.userId === me?.id;
                      return (
                        <tr key={m.id} className="border-b border-[#E0DAD2] last:border-0 hover:bg-[#F5F2EE] transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={m.user.name} />
                              <p className="text-[#231F1B] text-sm font-semibold">
                                {m.user.name}
                                {isSelf && <span className="ml-2 text-[#1D4ED8] text-[10px]">(you)</span>}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-[#5C5750] text-sm">{m.user.email}</td>
                          <td className="px-5 py-4">
                            <RoleBadge role={m.role} isWorkspaceAdmin={m.isWorkspaceAdmin} additionalDesignation={m.additionalDesignation} />
                          </td>
                          <td className="px-5 py-4 text-[#96908A] text-xs">
                            {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}
                          </td>
                          <td className="px-5 py-4">
                            {isAdmin && !isSelf && (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => openEditModal(m)}
                                  className="text-[#96908A] hover:text-[#1D4ED8] text-xs transition-colors px-2.5 py-1.5 rounded-lg hover:bg-[#EFF6FF]/30 border border-transparent hover:border-[#BFDBFE]/30"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => { if (confirm(`Remove ${m.user.name}?`)) companiesApi.removeMember(companyId, m.userId, jwt).then(load); }}
                                  className="text-[#96908A] hover:text-[#8B1A1A] text-xs transition-colors px-2.5 py-1.5 rounded-lg hover:bg-[rgba(139,26,26,0.06)]"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>
      )}

      {/* ── INVITES ───────────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-5">
          {isAdmin && (
            <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl p-6">
              <h2 className="text-[#231F1B] font-semibold text-sm mb-5">Invite a Member</h2>
              <form onSubmit={sendInvite} className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1.5">Email Address</label>
                  <input type="email" required value={inviteEmail} onChange={e => setInviteEmail((e as any).target.value)}
                    placeholder="director@company.com"
                    className="w-full bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] placeholder:text-[#96908A] focus:outline-none focus:border-[#8B1A1A] transition-colors" />
                </div>
                <div>
                  <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1.5">Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole((e as any).target.value)}
                    className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] focus:outline-none cursor-pointer">
                    {['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={inviting}
                  className="flex items-center gap-2 bg-[#8B1A1A] hover:bg-[#A52020] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
                  {inviting ? '…' : '✉ Send Invite'}
                </button>
              </form>
              {inviteMsg.ok  && <p className="mt-3 text-[#166534] text-xs bg-[#F0FDF4] border border-[#86EFAC] rounded-lg px-3 py-2">✓ {inviteMsg.ok}</p>}
              {inviteMsg.err && <p className="mt-3 text-[#8B1A1A] text-xs bg-[rgba(139,26,26,0.06)] border border-[rgba(139,26,26,0.2)] rounded-lg px-3 py-2">{inviteMsg.err}</p>}
            </div>
          )}
          <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E0DAD2]">
              <h2 className="text-[#231F1B] font-semibold text-sm">Pending Invitations</h2>
            </div>
            {pending.length === 0
              ? <p className="text-center text-[#96908A] py-10 text-sm">No pending invitations.</p>
              : pending.map(inv => {
                  const daysLeft = Math.max(0, Math.ceil((+new Date(inv.expiresAt) - Date.now()) / 86400000));
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-6 py-4 border-b border-[#E0DAD2] last:border-0">
                      <div>
                        <p className="text-[#231F1B] text-sm font-medium">{inv.email}</p>
                        <p className="text-[#96908A] text-xs mt-0.5">
                          {inv.role} · by {inv.invitedBy.name} ·{' '}
                          <span className={daysLeft <= 1 ? 'text-red-400' : 'text-[#96908A]'}>expires in {daysLeft === 0 ? 'today' : `${daysLeft}d`}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full text-amber-800 bg-amber-50 border border-amber-200 uppercase">Pending</span>
                        {isAdmin && (
                          <button onClick={() => invitationsApi.revoke(companyId, inv.id, jwt).then(() => setPending(p => p.filter(i => i.id !== inv.id)))}
                            className="text-[#96908A] hover:text-[#8B1A1A] text-xs transition-colors">Revoke</button>
                        )}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* ── AUDIT ─────────────────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E0DAD2] flex items-center justify-between">
            <h2 className="text-[#231F1B] font-semibold text-sm">Audit Trail</h2>
            <p className="text-[#96908A] text-xs">{audit.length} events</p>
          </div>
          {audit.length === 0
            ? <p className="text-center text-[#96908A] py-10 text-sm">No audit events yet.</p>
            : <div className="divide-y divide-[#232830] max-h-[520px] overflow-y-auto">
                {audit.map((log, i) => (
                  <div key={log.id} className="flex items-start gap-4 px-6 py-3.5">
                    <div className="flex flex-col items-center pt-0.5 gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#C4973A] flex-shrink-0" />
                      {i < audit.length - 1 && <div className="w-px flex-1 bg-[#E0DAD2] min-h-[18px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#231F1B] text-xs font-semibold">{log.action}</span>
                        <span className="text-[#5C5750] text-[10px] bg-[#EBE6DF] border border-[#E0DAD2] px-2 py-0.5 rounded font-mono">{log.entity}</span>
                      </div>
                      {log.user && <p className="text-[#96908A] text-[11px] mt-0.5">by {log.user.name}</p>}
                    </div>
                    <span className="text-[#96908A] text-[10px] flex-shrink-0">
                      {new Date(log.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                      {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}


      {/* ── SETTINGS ─────────────────────────────────────────────────────────── */}
      {tab === 'settings' && isAdmin && (
        <div className="max-w-xl space-y-6">
          <div className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E0DAD2]">
              <p className="text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1">Company Profile</p>
              <h2 className="text-[#231F1B] font-semibold text-sm">Company Details</h2>
              <p className="text-[#96908A] text-xs mt-1">These details appear on the letterhead of all generated documents — minutes, attendance register, and notices.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Company Name',          value: sfName,    set: setSfName,    type: 'text',  placeholder: 'Full registered company name' },
                { label: 'CIN',                   value: sfCin,     set: setSfCin,     type: 'text',  placeholder: 'U12345MH2020PTC123456' },
                { label: 'PAN',                   value: sfPan,     set: setSfPan,     type: 'text',  placeholder: 'AAAAA0000A' },
                { label: 'Registered Office',     value: sfAddress, set: setSfAddress, type: 'text',  placeholder: '123, Street Name, City, State - PIN' },
                { label: 'Company Email',         value: sfEmail,   set: setSfEmail,   type: 'email', placeholder: 'info@company.com' },
                { label: 'Website (optional)',    value: sfWebsite, set: setSfWebsite, type: 'url',   placeholder: 'https://company.com' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={f.value}
                    onChange={e => { f.set((e.target as any).value); setSettingsOk(false); setSettingsErr(''); }}
                    placeholder={f.placeholder}
                    className="w-full bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] placeholder:text-[#96908A] focus:outline-none focus:border-[#8B1A1A] transition-colors"
                  />
                </div>
              ))}

              {settingsErr && (
                <div className="bg-[rgba(139,26,26,0.06)] border border-[rgba(139,26,26,0.18)] rounded-lg px-4 py-2.5 text-[#8B1A1A] text-xs">
                  {settingsErr}
                </div>
              )}
              {settingsOk && (
                <div className="bg-green-950/30 border border-green-800/30 rounded-lg px-4 py-2.5 text-green-400 text-xs">
                  Company details saved successfully.
                </div>
              )}

              <button
                disabled={settingsSaving}
                onClick={async () => {
                  const jwt = getToken();
                  if (!jwt || !company) return;
                  setSettingsSaving(true); setSettingsErr(''); setSettingsOk(false);
                  try {
                    await companiesApi.update(companyId, {
                      name:         sfName.trim(),
                      cin:          sfCin.trim() || undefined,
                      pan:          sfPan.trim() || undefined,
                      registeredAt: sfAddress.trim() || undefined,
                      email:        sfEmail.trim() || undefined,
                      website:      sfWebsite.trim() || undefined,
                    }, jwt);
                    await load();
                    setSettingsOk(true);
                  } catch (err: any) {
                    setSettingsErr(err?.body?.message ?? 'Could not save. Please try again.');
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {settingsSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Designation Edit Modal ────────────────────────────────────────────── */}
      {editMember && (
        <div onClick={() => setEditMember(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E0DAD2]">
              <p className="text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1">Edit Member</p>
              <h3 className="text-[#231F1B] font-bold text-lg">{editMember.user.name}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Role */}
              <div>
                <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-2">Role</label>
                <select value={editRole} onChange={e => { setEditRole((e as any).target.value); setEditDesig(''); }}
                  className="w-full bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] focus:outline-none focus:border-[#8B1A1A] cursor-pointer">
                  {['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Designation */}
              {(DESIGNATIONS_BY_ROLE[editRole]?.length ?? 0) > 0 && (
                <div>
                  <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-2">Designation</label>
                  <select value={editDesig} onChange={e => setEditDesig((e as any).target.value)}
                    className="w-full bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] focus:outline-none focus:border-[#8B1A1A] cursor-pointer">
                    <option value="">— None —</option>
                    {DESIGNATIONS_BY_ROLE[editRole].map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom label */}
              <div>
                <label className="block text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-2">
                  Custom Label <span className="text-[#96908A] normal-case font-normal">(optional — shown in minutes)</span>
                </label>
                <input
                  value={editDesigLabel}
                  onChange={e => setEditDesigLabel((e as any).target.value)}
                  placeholder="e.g. Nominee Director — Sequoia Capital"
                  className="w-full bg-[#FDFCFB] border border-[#E0DAD2] rounded-xl px-4 py-2.5 text-sm text-[#231F1B] placeholder:text-[#96908A] focus:outline-none focus:border-[#8B1A1A]"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setEditMember(null)}
                className="flex-1 bg-[#232830] text-[#5C5750] text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2a3040] transition-colors">
                Cancel
              </button>
              <button onClick={saveDesignation} disabled={savingDesig}
                className="flex-2 flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                {savingDesig ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Admin Modal ──────────────────────────────────────────────── */}
      {showTransfer && (
        <div onClick={() => setShowTransfer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="bg-[#FDFCFB] border border-[#E0DAD2] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E0DAD2]">
              <p className="text-[#96908A] text-[10px] font-semibold uppercase tracking-widest mb-1">Workspace Admin</p>
              <h3 className="text-[#231F1B] font-bold text-lg">Transfer Admin Rights</h3>
              <p className="text-[#96908A] text-xs mt-1.5 leading-relaxed">
                The new admin will be able to invite members, manage roles, and transfer admin again. You will retain your Director role.
              </p>
            </div>
            <div className="px-6 py-5">
              {transferCandidates.length === 0 ? (
                <p className="text-[#96908A] text-sm text-center py-4">No other Directors are available to transfer admin to.</p>
              ) : (
                <div className="space-y-2">
                  {transferCandidates.map(m => (
                    <button
                      key={m.userId}
                      onClick={() => setTransferTarget(m.userId)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${transferTarget === m.userId ? 'bg-amber-50 border-amber-700/50' : 'bg-[#FDFCFB] border-[#E0DAD2] hover:border-[#374151]'}`}
                    >
                      <Avatar name={m.user.name} />
                      <div>
                        <p className="text-[#231F1B] text-sm font-semibold">{m.user.name}</p>
                        <p className="text-[#96908A] text-xs">{m.user.email}</p>
                      </div>
                      {transferTarget === m.userId && <span className="ml-auto text-amber-700 text-sm">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {transferErr && <p className="mt-3 text-[#8B1A1A] text-xs bg-[rgba(139,26,26,0.06)] border border-[rgba(139,26,26,0.2)] rounded-lg px-3 py-2">{transferErr}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setShowTransfer(false)}
                className="flex-1 bg-[#232830] text-[#5C5750] text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2a3040] transition-colors">
                Cancel
              </button>
              <button
                onClick={doTransfer}
                disabled={!transferTarget || transferring || transferCandidates.length === 0}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {transferring ? 'Transferring…' : 'Transfer Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
