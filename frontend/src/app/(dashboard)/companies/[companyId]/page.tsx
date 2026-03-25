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


// ── Light palette tokens ──────────────────────────────────────────────────────
const T = {
  pageBg:  '#F5F2EE', surface: '#FDFCFB', surface2: '#EBE6DF',
  border:  '#E0DAD2', borderDk:'#C8C0B5',
  ink:     '#231F1B', inkMid:  '#5C5750', inkMute: '#96908A',
  crimson: '#8B1A1A', crimsonLt:'#F5E6E6', crimsonMid:'rgba(139,26,26,0.10)', crimsonBdr:'#ECC9C9',
  gold:    '#C4973A', goldLt:  '#FBF5E6',  goldMid: 'rgba(196,151,58,0.10)',  goldBdr:  '#E8D499', goldText:'#9B7320',
  green:   '#166534', greenLt: '#DCFCE7',  greenBdr:'#BBF7D0',
  shadow:  '0 1px 3px rgba(35,31,27,0.07)',
  shadowMd:'0 4px 12px rgba(35,31,27,0.10)',
};

const ROLE_SHORT: Record<string, string> = {
  DIRECTOR:          'Director — votes on resolutions, signs minutes',
  COMPANY_SECRETARY: 'Company Secretary — records and certifies board actions',
  AUDITOR:           'Statutory Auditor — independent financial oversight',
  OBSERVER:          'Observer — attends meetings, no voting rights',
};

const ROLE_CLS: Record<string, string> = {
  DIRECTOR:          'border font-semibold',
  COMPANY_SECRETARY: 'border font-semibold',
  AUDITOR:           'border font-semibold',
  OBSERVER:          'border font-semibold',
};
const ROLE_STYLE: Record<string, {color:string;bg:string;border:string}> = {
  DIRECTOR:          {color:'#8B1A1A', bg:'#F5E6E6', border:'#ECC9C9'},
  COMPANY_SECRETARY: {color:'#9B7320', bg:'#FBF5E6', border:'#E8D499'},
  AUDITOR:           {color:'#166534', bg:'#DCFCE7', border:'#BBF7D0'},
  OBSERVER:          {color:'#5C5750', bg:'#EBE6DF', border:'#D6CFC6'},
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
        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide text-amber-400 bg-amber-950/60 border-amber-800/40">
          Admin
        </span>
      )}
      {additionalDesignation && (
        <span className="text-[10px] px-2 py-0.5 rounded-full border text-slate-400 bg-slate-900/40 border-slate-700/40 italic">
          {DESIGNATION_LABELS[additionalDesignation] ?? additionalDesignation}
        </span>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{ width:32, height:32, borderRadius:'50%', background:'#F5E6E6', border:'1px solid #ECC9C9', display:'flex', alignItems:'center', justifyContent:'center', color:'#8B1A1A', fontWeight:700, fontSize:11, flexShrink:0 }}>
      {initials}
    </div>
  );
}

function Spinner() {
  return <div style={{ width:20, height:20, border:"2px solid #E0DAD2", borderTopColor:"#8B1A1A", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string,{color:string;bg:string;border:string}> = {
    DRAFT:         {color:'#5C5750',bg:'#EBE6DF',border:'#D6CFC6'},
    SCHEDULED:     {color:'#1D4ED8',bg:'#EFF6FF',border:'#BFDBFE'},
    IN_PROGRESS:   {color:'#166534',bg:'#DCFCE7',border:'#BBF7D0'},
    VOTING:        {color:'#92400E',bg:'#FEF3C7',border:'#FDE68A'},
    MINUTES_DRAFT: {color:'#6B21A8',bg:'#F5F3FF',border:'#DDD6FE'},
    SIGNED:        {color:'#166534',bg:'#DCFCE7',border:'#BBF7D0'},
    LOCKED:        {color:'#5C5750',bg:'#EBE6DF',border:'#D6CFC6'},
  };
  const s = map[status]??map.DRAFT;
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:s.color, background:s.bg, border:`1px solid ${s.border}` }}>
      {status.replace('_',' ')}
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
    <div style={{ padding:'32px 40px', maxWidth:1060, fontFamily:"'Instrument Sans',system-ui,sans-serif", color:'#231F1B' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600&family=Instrument+Sans:wght@400;500;600&display=swap'); @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div style={{ width:48, height:48, borderRadius:12, background:"#F5E6E6", border:"1px solid #ECC9C9", display:"flex", alignItems:"center", justifyContent:"center", color:"#8B1A1A", fontWeight:800, fontSize:20 }}>
            {company?.name[0]}
          </div>
          <div>
            <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:24, fontWeight:600, color:"#231F1B", letterSpacing:"-0.02em" }}>
              {company?.name}
            </h1>
            {company?.cin && <p style={{ color:"#96908A", fontSize:11, margin:"2px 0 0", fontFamily:"monospace" }}>CIN: {company.cin}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/companies/${companyId}/meetings`}  style={{ fontSize:12, fontWeight:600, color:"#5C5750", background:"#FDFCFB", border:"1px solid #E0DAD2", padding:"7px 14px", borderRadius:8, textDecoration:"none", transition:"border-color 0.15s,color 0.15s" }}>◈ Meetings</Link>
          <Link href={`/companies/${companyId}/templates`} style={{ fontSize:12, fontWeight:600, color:"#5C5750", background:"#FDFCFB", border:"1px solid #E0DAD2", padding:"7px 14px", borderRadius:8, textDecoration:"none", transition:"border-color 0.15s,color 0.15s" }}>▦ Templates</Link>
          <Link href={`/companies/${companyId}/vault`}     style={{ fontSize:12, fontWeight:600, color:"#5C5750", background:"#FDFCFB", border:"1px solid #E0DAD2", padding:"7px 14px", borderRadius:8, textDecoration:"none", transition:"border-color 0.15s,color 0.15s" }}>⊟ Vault</Link>
          <Link href={`/companies/${companyId}/archive`}   style={{ fontSize:12, fontWeight:600, color:"#5C5750", background:"#FDFCFB", border:"1px solid #E0DAD2", padding:"7px 14px", borderRadius:8, textDecoration:"none", transition:"border-color 0.15s,color 0.15s" }}>▤ Archive</Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-7">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === t.id ? "bg-white text-[#231F1B] border border-[#E0DAD2] shadow-sm" : "text-[#96908A] hover:text-[#5C5750]"}`}>
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
            <p style={{ fontSize:10, fontWeight:700, color:"#96908A", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:12 }}>What you can do here</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '⬡', label: 'Board Meetings',      count: company?._count.meetings    ?? 0, desc: 'Schedule, conduct and sign off board meetings end-to-end. Attendance, voting, minutes — all in one place.',                                href: '/companies/' + companyId + '/meetings',              color: '#1D4ED8', bg: 'bg-[#EFF6FF] border-[#BFDBFE]' },
                { icon: '◎', label: 'Resolutions',          count: company?._count.resolutions ?? 0, desc: 'Track every board resolution with vote tallies, dissent records, and certified copies for banks and regulators.',                        href: '/companies/' + companyId + '/resolutions',            color: '#92400E', bg: 'bg-[#FEF3C7] border-[#FDE68A]' },
                { icon: '⬡', label: 'Document Vault',       count: company?._count.documents   ?? 0, desc: 'Secure storage for statutory documents — MOA, AOA, incorporation certificate, board papers, and compliance filings.',                    href: '/companies/' + companyId + '/vault',                  color: '#6B21A8', bg: 'bg-[#F5F3FF] border-[#DDD6FE]' },
                { icon: '↻', label: 'Circular Resolutions', count: 0,                               desc: 'Pass urgent resolutions without a meeting — circulate to all directors and collect approvals digitally per Sec. 175.',                    href: '/companies/' + companyId + '/circular-resolutions',   color: '#166534', bg: 'bg-[#DCFCE7] border-[#BBF7D0]' },
              ].map(mod => (
                <Link key={mod.label} href={mod.href}
                  className={'flex flex-col gap-3 p-5 rounded-2xl border ' + mod.bg + ' hover:shadow-md transition-all group'} style={{ background:'#FDFCFB', textDecoration:'none' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span style={{ color: mod.color }} className="text-lg">{mod.icon}</span>
                      <span style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>{mod.label}</span>
                    </div>
                    <span className="font-bold text-lg font-mono" style={{ color: mod.color }}>{mod.count}</span>
                  </div>
                  <p className="text-zinc-500 text-xs leading-relaxed">{mod.desc}</p>
                  <span className="text-xs font-semibold group-hover:translate-x-0.5 transition-transform" style={{ color: mod.color }}>Open →</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div style={{ gridColumn:"span 3", background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, padding:24, boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
              <div className="flex items-center justify-between mb-2">
                <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>Upcoming Meetings</h2>
                <Link href={'/companies/' + companyId + '/meetings'} style={{ fontSize:12, color:"#8B1A1A", background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>View all →</Link>
              </div>
              <p style={{ fontSize:12, color:"#96908A", marginBottom:16, lineHeight:1.6 }}>Board meetings managed end-to-end in full compliance with SS-1.</p>
              {upcoming.length === 0
                ? <p className="" style={{ fontSize:13, color:"#96908A", textAlign:"center" as const, padding:"24px 0" }}>No upcoming meetings. Schedule one to get started.</p>
                : upcoming.slice(0, 4).map(m => (
                  <Link key={m.id} href={'/companies/' + companyId + '/meetings/' + m.id}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#F5F2EE", border:"1px solid #E0DAD2", borderRadius:10, marginBottom:8, textDecoration:"none", transition:"border-color 0.15s" }}>
                    <div>
                      <p style={{ fontSize:13, fontWeight:500, color:"#231F1B" }}>{m.title}</p>
                      <p style={{ fontSize:11, color:"#96908A", marginTop:2 }}>{new Date(m.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <StatusPill status={m.status} />
                  </Link>
                ))
              }
            </div>
            <div style={{ gridColumn:"span 2", background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, padding:24, boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
              <div className="flex items-center justify-between mb-2">
                <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>Board Members</h2>
                <button onClick={() => setTab('members')} style={{ fontSize:12, color:"#8B1A1A", background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>Manage →</button>
              </div>
              <p style={{ fontSize:12, color:"#96908A", marginBottom:16, lineHeight:1.6 }}>Each role determines what appears in minutes and what they can do in meetings.</p>
              <div className="space-y-2">
                {members.slice(0, 6).map(m => (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"#F5F2EE", border:"1px solid #E0DAD2", borderRadius:10 }}>
                    <Avatar name={m.user.name} />
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize:12, fontWeight:600, color:"#231F1B", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {m.user.name}{m.userId === me?.id && <span style={{ marginLeft:6, fontSize:9, color:"#8B1A1A", fontWeight:600 }}>you</span>}
                      </p>
                      <p style={{ fontSize:10, color:"#96908A", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ROLE_SHORT[m.role as keyof typeof ROLE_SHORT] ?? m.role}</p>
                    </div>
                    {m.isWorkspaceAdmin && (
                      <span className="" style={{ fontSize:9, fontWeight:700, color:"#9B7320", background:"#FBF5E6", border:"1px solid #E8D499", padding:"1px 6px", borderRadius:4, flexShrink:0 }}>Admin</span>
                    )}
                  </div>
                ))}
                {members.length > 6 && <p className="text-zinc-600 text-xs text-center pt-1">+{members.length - 6} more</p>}
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
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:10, padding:"10px 14px" }}>
                  <span style={{ color:"#92400E", fontSize:14, marginTop:2, flexShrink:0 }}>⚠</span>
                  <p style={{ color:"#78350F", fontSize:12, lineHeight:1.6, margin:0 }}>{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Transfer admin button — only visible to current workspace admin */}
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => { setShowTransfer(true); setTransferErr(''); setTransferTarget(''); }}
                style={{ fontSize:12, fontWeight:600, color:"#92400E", background:"#FEF3C7", border:"1px solid #FDE68A", padding:"7px 14px", borderRadius:8, cursor:"pointer", transition:"background 0.15s" }}
              >
                ⇄ Transfer Workspace Admin
              </button>
            </div>
          )}

          <div style={{ background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
            {members.length === 0
              ? <p style={{ textAlign:"center" as const, color:"#96908A", padding:"48px 0" }}>No members yet.</p>
              : <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom:"1px solid #E0DAD2" }}>
                      {['Member', 'Email', 'Role & Designation', 'Joined', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      const isSelf = m.userId === me?.id;
                      return (
                        <tr key={m.id} className="" style={{ borderBottom:"1px solid #EBE6DF", transition:"background 0.15s" }}>
                          <td style={{ padding:"12px 20px" }}>
                            <div className="flex items-center gap-3">
                              <Avatar name={m.user.name} />
                              <p style={{ fontSize:13, fontWeight:600, color:"#231F1B" }}>
                                {m.user.name}
                                {isSelf && <span className="ml-2 text-blue-400 text-[10px]">(you)</span>}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-zinc-400 text-sm">{m.user.email}</td>
                          <td style={{ padding:"12px 20px" }}>
                            <RoleBadge role={m.role} isWorkspaceAdmin={m.isWorkspaceAdmin} additionalDesignation={m.additionalDesignation} />
                          </td>
                          <td className="px-5 py-4 text-zinc-500 text-xs">
                            {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}
                          </td>
                          <td style={{ padding:"12px 20px" }}>
                            {isAdmin && !isSelf && (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => openEditModal(m)}
                                  className="text-zinc-500 hover:text-blue-400 text-xs transition-colors px-2.5 py-1.5 rounded-lg hover:bg-blue-950/30 border border-transparent hover:border-blue-800/30"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => { if (confirm(`Remove ${m.user.name}?`)) companiesApi.removeMember(companyId, m.userId, jwt).then(load); }}
                                  className="text-zinc-600 hover:text-red-400 text-xs transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-950/30"
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
            <div style={{ background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, padding:24, boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
              <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", marginBottom:20 }}>Invite a Member</h2>
              <form onSubmit={sendInvite} className="flex items-end gap-3">
                <div className="flex-1">
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#96908A", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>Email Address</label>
                  <input type="email" required value={inviteEmail} onChange={e => setInviteEmail((e as any).target.value)}
                    placeholder="director@company.com"
                    style={{ width:"100%", background:"#F5F2EE", border:"1px solid #E0DAD2", borderRadius:10, padding:"9px 14px", fontSize:13, color:"#231F1B", outline:"none", fontFamily:"inherit" }} />
                </div>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#96908A", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole((e as any).target.value)}
                    style={{ background:"#F5F2EE", border:"1px solid #E0DAD2", borderRadius:10, padding:"9px 14px", fontSize:13, color:"#5C5750", outline:"none", cursor:"pointer", fontFamily:"inherit" }}>
                    {['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={inviting}
                  style={{ display:"flex", alignItems:"center", gap:8, background:"#8B1A1A", color:"#fff", fontWeight:600, padding:"9px 18px", borderRadius:10, fontSize:13, border:"none", cursor:"pointer", transition:"background 0.15s" }}>
                  {inviting ? '…' : '✉ Send Invite'}
                </button>
              </form>
              {inviteMsg.ok  && <p style={{ marginTop:10, fontSize:12, color:"#166534", background:"#DCFCE7", border:"1px solid #BBF7D0", borderRadius:8, padding:"8px 12px" }}>✓ {inviteMsg.ok}</p>}
              {inviteMsg.err && <p style={{ marginTop:10, fontSize:12, color:"#991B1B", background:"#FEE2E2", border:"1px solid #FECACA", borderRadius:8, padding:"8px 12px" }}>{inviteMsg.err}</p>}
            </div>
          )}
          <div style={{ background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #E0DAD2", background:"#F5F2EE" }}>
              <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>Pending Invitations</h2>
            </div>
            {pending.length === 0
              ? <p style={{ textAlign:"center" as const, color:"#96908A", padding:"40px 0", fontSize:13 }}>No pending invitations.</p>
              : pending.map(inv => {
                  const daysLeft = Math.max(0, Math.ceil((+new Date(inv.expiresAt) - Date.now()) / 86400000));
                  return (
                    <div key={inv.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"1px solid #EBE6DF" }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:500, color:"#231F1B" }}>{inv.email}</p>
                        <p style={{ fontSize:11, color:"#96908A", marginTop:2 }}>
                          {inv.role} · by {inv.invitedBy.name} ·{' '}
                          <span style={{ color:daysLeft<=1?'#991B1B':'#96908A' }}>expires in {daysLeft === 0 ? 'today' : `${daysLeft}d`}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, color:"#92400E", background:"#FEF3C7", border:"1px solid #FDE68A", textTransform:"uppercase" as const }}>Pending</span>
                        {isAdmin && (
                          <button onClick={() => invitationsApi.revoke(companyId, inv.id, jwt).then(() => setPending(p => p.filter(i => i.id !== inv.id)))}
                            style={{ fontSize:12, color:"#96908A", background:"none", border:"none", cursor:"pointer", transition:"color 0.15s" }}>Revoke</button>
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
        <div style={{ background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
          <div style={{ padding:"14px 20px", borderBottom:"1px solid #E0DAD2", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#F5F2EE" }}>
            <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>Audit Trail</h2>
            <p style={{ fontSize:12, color:"#96908A" }}>{audit.length} events</p>
          </div>
          {audit.length === 0
            ? <p style={{ textAlign:"center" as const, color:"#96908A", padding:"40px 0", fontSize:13 }}>No audit events yet.</p>
            : <div style={{ maxHeight:520, overflowY:"auto" as const }}>
                {audit.map((log, i) => (
                  <div key={log.id} className="flex items-start gap-4 px-6 py-3.5">
                    <div className="flex flex-col items-center pt-0.5 gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      {i < audit.length - 1 && <div className="w-px flex-1 bg-[#232830] min-h-[18px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#F0F2F5] text-xs font-semibold">{log.action}</span>
                        <span className="text-zinc-400 text-[10px] bg-[#13161B] border border-[#232830] px-2 py-0.5 rounded font-mono">{log.entity}</span>
                      </div>
                      {log.user && <p className="text-zinc-500 text-[11px] mt-0.5">by {log.user.name}</p>}
                    </div>
                    <span className="text-zinc-600 text-[10px] flex-shrink-0">
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
          <div style={{ background:"#FDFCFB", border:"1px solid #E0DAD2", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(35,31,27,0.06)" }}>
            <div className="px-6 py-5 border-b border-[#232830]">
              <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1">Company Profile</p>
              <h2 style={{ fontSize:14, fontWeight:600, color:"#231F1B", margin:0 }}>Company Details</h2>
              <p className="text-zinc-600 text-xs mt-1">These details appear on the letterhead of all generated documents — minutes, attendance register, and notices.</p>
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
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#96908A", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={f.value}
                    onChange={e => { f.set((e.target as any).value); setSettingsOk(false); setSettingsErr(''); }}
                    placeholder={f.placeholder}
                    className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                </div>
              ))}

              {settingsErr && (
                <div className="bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-2.5 text-red-400 text-xs">
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
          <div onClick={e => e.stopPropagation()} className="bg-[#191D24] border border-[#232830] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-[#232830]">
              <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1">Edit Member</p>
              <h3 className="text-[#F0F2F5] font-bold text-lg">{editMember.user.name}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Role */}
              <div>
                <label className="block text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Role</label>
                <select value={editRole} onChange={e => { setEditRole((e as any).target.value); setEditDesig(''); }}
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-600 cursor-pointer">
                  {['DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Designation */}
              {(DESIGNATIONS_BY_ROLE[editRole]?.length ?? 0) > 0 && (
                <div>
                  <label className="block text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-2">Designation</label>
                  <select value={editDesig} onChange={e => setEditDesig((e as any).target.value)}
                    className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-600 cursor-pointer">
                    <option value="">— None —</option>
                    {DESIGNATIONS_BY_ROLE[editRole].map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom label */}
              <div>
                <label className="block text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-2">
                  Custom Label <span className="text-zinc-600 normal-case font-normal">(optional — shown in minutes)</span>
                </label>
                <input
                  value={editDesigLabel}
                  onChange={e => setEditDesigLabel((e as any).target.value)}
                  placeholder="e.g. Nominee Director — Sequoia Capital"
                  className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-[#F0F2F5] placeholder:text-zinc-700 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setEditMember(null)}
                className="flex-1 bg-[#232830] text-zinc-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2a3040] transition-colors">
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
          <div onClick={e => e.stopPropagation()} className="bg-[#191D24] border border-[#232830] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-[#232830]">
              <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1">Workspace Admin</p>
              <h3 className="text-[#F0F2F5] font-bold text-lg">Transfer Admin Rights</h3>
              <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed">
                The new admin will be able to invite members, manage roles, and transfer admin again. You will retain your Director role.
              </p>
            </div>
            <div className="px-6 py-5">
              {transferCandidates.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No other Directors are available to transfer admin to.</p>
              ) : (
                <div className="space-y-2">
                  {transferCandidates.map(m => (
                    <button
                      key={m.userId}
                      onClick={() => setTransferTarget(m.userId)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${transferTarget === m.userId ? 'bg-amber-950/30 border-amber-700/50' : 'bg-[#13161B] border-[#232830] hover:border-[#374151]'}`}
                    >
                      <Avatar name={m.user.name} />
                      <div>
                        <p style={{ fontSize:13, fontWeight:600, color:"#231F1B" }}>{m.user.name}</p>
                        <p className="text-zinc-500 text-xs">{m.user.email}</p>
                      </div>
                      {transferTarget === m.userId && <span className="ml-auto text-amber-400 text-sm">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {transferErr && <p style={{ marginTop:10, fontSize:12, color:"#991B1B", background:"#FEE2E2", border:"1px solid #FECACA", borderRadius:8, padding:"8px 12px" }}>{transferErr}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setShowTransfer(false)}
                className="flex-1 bg-[#232830] text-zinc-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2a3040] transition-colors">
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
