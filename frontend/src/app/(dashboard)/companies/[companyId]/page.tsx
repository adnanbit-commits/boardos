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

// ── Shared atoms ──────────────────────────────────────────────────────────────

const ROLE_CLS: Record<string, string> = {
  DIRECTOR:           'text-blue-400 bg-blue-950/60 border-blue-800/40',
  COMPANY_SECRETARY:  'text-purple-400 bg-purple-950/60 border-purple-800/40',
  AUDITOR:            'text-green-400 bg-green-950/60 border-green-800/40',
  OBSERVER:           'text-slate-400 bg-slate-900/60 border-slate-700/40',
  DIRECTOR: 'text-blue-400  bg-blue-950/60  border-blue-800/40',
  OBSERVER: 'text-zinc-400  bg-zinc-800/60  border-zinc-700/40',
  COMPANY_SECRETARY:  'text-purple-400 bg-purple-950/60 border-purple-800/40',
};

function RoleBadge({ role, isWorkspaceAdmin, designationLabel }: { role: string; isWorkspaceAdmin?: boolean; designationLabel?: string }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${ROLE_CLS[role] ?? ROLE_CLS.OBSERVER}`}>
        {role}
      </span>
      {isWorkspaceAdmin && (
        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide text-amber-400 bg-amber-950/60 border-amber-800/40">
          Chairman
        </span>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-800/40 flex items-center justify-center text-blue-400 font-bold text-[11px] flex-shrink-0">
      {initials}
    </div>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'text-zinc-400 bg-zinc-800', SCHEDULED: 'text-blue-400 bg-blue-950',
    IN_PROGRESS: 'text-green-400 bg-green-950', VOTING: 'text-amber-400 bg-amber-950',
    MINUTES_DRAFT: 'text-purple-400 bg-purple-950', SIGNED: 'text-green-400 bg-green-950',
    LOCKED: 'text-zinc-500 bg-zinc-800',
  };
  const label = status.replace('_', ' ');
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${map[status] ?? map.DRAFT}`}>
      {label}
    </span>
  );
}

type TabId = 'overview' | 'members' | 'invites' | 'audit';

export default function CompanyWorkspacePage() {
  const { companyId } = useParams<{ companyId: string }>();
  if (companyId === 'new') return null; // handled by /companies/new/page.tsx
  const jwt = getToken()!;
  const me  = getUser();

  const [tab,     setTab]     = useState<TabId>('overview');
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [audit,   setAudit]   = useState<AuditLog[]>([]);
  const [meetings,setMeetings]= useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('DIRECTOR');
  const [inviting,    setInviting]    = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState({ ok: '', err: '' });

  const myMem  = members.find(m => m.userId === me?.id);
  const isAdmin = myMem?.isWorkspaceAdmin === true;

  const load = useCallback(async () => {
    const [co, mems, mtgs] = await Promise.all([
      companiesApi.findOne(companyId, jwt),
      companiesApi.listMembers(companyId, jwt),
      meetingsApi.list(companyId, jwt),
    ]);
    setCompany(co); setMembers(mems); setMeetings(mtgs);
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

  async function sendInvite(e: React.FormEvent) {
    (e as any).preventDefault(); setInviting(true); setInviteMsg({ ok:'', err:'' });
    try {
      await invitationsApi.send(companyId, { email: inviteEmail, role: inviteRole }, jwt);
      setInviteMsg({ ok: `Invite sent to ${inviteEmail}.`, err: '' });
      setInviteEmail(''); await load();
    } catch (err: any) {
      setInviteMsg({ ok: '', err: err?.body?.message ?? 'Failed to send invite.' });
    } finally { setInviting(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  const upcoming = meetings.filter(m => !['SIGNED','LOCKED'].includes(m.status))
    .sort((a,b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  const TABS: { id: TabId; label: string }[] = [
    { id:'overview', label:'⬡ Overview' },
    { id:'members',  label:`◈ Members (${members.length})` },
    { id:'invites',  label:`✉ Invites${pending.length ? ` (${pending.length})` : ''}` },
    { id:'audit',    label:'▣ Audit Log' },
  ];

  return (
    <div className="px-10 py-8 max-w-5xl" style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');`}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-950 border border-blue-800/40 flex items-center justify-center text-blue-400 font-black text-xl">
            {company?.name[0]}
          </div>
          <div>
            <h1 className="text-[#F0F2F5] font-bold text-2xl" style={{ fontFamily:"'Playfair Display',serif", letterSpacing:'-0.02em' }}>
              {company?.name}
            </h1>
            {company?.cin && <p className="text-zinc-500 text-xs mt-1">CIN: {company.cin}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/companies/${companyId}/meetings`} className="text-sm font-semibold text-zinc-300 bg-[#191D24] border border-[#232830] px-4 py-2 rounded-lg hover:border-blue-800/40 transition-colors">◈ Meetings</Link>
          <Link href={`/companies/${companyId}/archive`}  className="text-sm font-semibold text-zinc-300 bg-[#191D24] border border-[#232830] px-4 py-2 rounded-lg hover:border-blue-800/40 transition-colors">▤ Archive</Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-7">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab===t.id ? 'bg-[#191D24] text-[#F0F2F5] border border-[#232830]' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==='overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            {[
              { l:'Meetings',    v: company?._count.meetings    ?? 0, a:'#4F7FFF' },
              { l:'Resolutions', v: company?._count.resolutions ?? 0, a:'#F59E0B' },
              { l:'Directors',   v: members.length,                   a:'#22C55E' },
              { l:'Documents',   v: company?._count.documents   ?? 0, a:'#A78BFA' },
            ].map(s => (
              <div key={s.l} className="bg-[#191D24] border border-[#232830] rounded-2xl p-5">
                <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-3">{s.l}</p>
                <p className="font-bold text-3xl" style={{ color:s.a, fontFamily:'monospace' }}>{s.v}</p>
              </div>
            ))}
          </div>
          <div className="bg-[#191D24] border border-[#232830] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[#F0F2F5] font-semibold text-sm">Upcoming Meetings</h2>
              <Link href={`/companies/${companyId}/meetings`} className="text-blue-400 text-xs hover:text-blue-300">View all →</Link>
            </div>
            {upcoming.length === 0
              ? <p className="text-zinc-600 text-sm text-center py-8">No upcoming meetings.</p>
              : upcoming.slice(0,4).map(m => (
                <Link key={m.id} href={`/companies/${companyId}/meetings/${m.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-[#13161B] border border-[#232830] rounded-xl hover:border-blue-800/30 transition-colors mb-2.5 group">
                  <div>
                    <p className="text-[#F0F2F5] text-sm font-medium group-hover:text-blue-300 transition-colors">{m.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{new Date(m.scheduledAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</p>
                  </div>
                  <StatusPill status={m.status} />
                </Link>
              ))
            }
          </div>
        </div>
      )}

      {/* MEMBERS */}
      {tab==='members' && (
        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          {members.length === 0
            ? <p className="text-center text-zinc-600 py-12">No members yet.</p>
            : <table className="w-full">
                <thead>
                  <tr className="border-b border-[#232830]">
                    {['Director','Email','Role','Joined',''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => {
                    const isSelf = m.userId === me?.id;
                    return (
                      <tr key={m.id} className="border-b border-[#232830] last:border-0 hover:bg-[#13161B] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.user.name} />
                            <p className="text-[#F0F2F5] text-sm font-semibold">
                              {m.user.name}
                              {isSelf && <span className="ml-2 text-blue-400 text-[10px]">(you)</span>}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-zinc-400 text-sm">{m.user.email}</td>
                        <td className="px-5 py-4"><RoleBadge role={m.role} isWorkspaceAdmin={m.isWorkspaceAdmin} designationLabel={m.designationLabel} /></td>
                        <td className="px-5 py-4 text-zinc-500 text-xs">
                          {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Pending'}
                        </td>
                        <td className="px-5 py-4">
                          {isAdmin && !isSelf && (
                            <div className="flex items-center gap-2 justify-end">
                              <select defaultValue={m.role}
                                onChange={e => companiesApi.updateMemberRole(companyId, m.userId, { role: (e as any).target.value }, jwt).then(load)}
                                className="bg-[#13161B] border border-[#232830] text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 cursor-pointer">
                                {['DIRECTOR','COMPANY_SECRETARY','AUDITOR','OBSERVER'].map(r => <option key={r}>{r}</option>)}
                              </select>
                              <button
                                onClick={() => { if(confirm('Remove this member?')) companiesApi.removeMember(companyId, m.userId, jwt).then(load); }}
                                className="text-zinc-600 hover:text-red-400 text-xs transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-950/30">
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
      )}

      {/* INVITES */}
      {tab==='invites' && (
        <div className="space-y-5">
          {isAdmin && (
            <div className="bg-[#191D24] border border-[#232830] rounded-2xl p-6">
              <h2 className="text-[#F0F2F5] font-semibold text-sm mb-5">Invite a Director</h2>
              <form onSubmit={sendInvite} className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1.5">Email Address</label>
                  <input type="email" required value={inviteEmail} onChange={e=>setInviteEmail((e as any).target.value)}
                    placeholder="director@company.com"
                    className="w-full bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-[#F0F2F5] placeholder:text-zinc-700 focus:outline-none focus:border-blue-600 transition-colors" />
                </div>
                <div>
                  <label className="block text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1.5">Role</label>
                  <select value={inviteRole} onChange={e=>setInviteRole((e as any).target.value)}
                    className="bg-[#13161B] border border-[#232830] rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none cursor-pointer">
                    {['DIRECTOR','COMPANY_SECRETARY','AUDITOR','OBSERVER'].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={inviting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
                  {inviting ? '…' : '✉ Send Invite'}
                </button>
              </form>
              {inviteMsg.ok  && <p className="mt-3 text-green-400 text-xs bg-green-950/30 border border-green-800/30 rounded-lg px-3 py-2">✓ {inviteMsg.ok}</p>}
              {inviteMsg.err && <p className="mt-3 text-red-400 text-xs bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">{inviteMsg.err}</p>}
            </div>
          )}
          <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#232830]">
              <h2 className="text-[#F0F2F5] font-semibold text-sm">Pending Invitations</h2>
            </div>
            {pending.length === 0
              ? <p className="text-center text-zinc-600 py-10 text-sm">No pending invitations.</p>
              : pending.map(inv => {
                  const daysLeft = Math.max(0, Math.ceil((+new Date(inv.expiresAt) - Date.now()) / 86400000));
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-6 py-4 border-b border-[#232830] last:border-0">
                      <div>
                        <p className="text-[#F0F2F5] text-sm font-medium">{inv.email}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {inv.role} · by {inv.invitedBy.name} ·{' '}
                          <span className={daysLeft <= 1 ? 'text-red-400' : 'text-zinc-500'}>expires in {daysLeft === 0 ? 'today' : `${daysLeft}d`}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full text-amber-400 bg-amber-950 border border-amber-800/30 uppercase">Pending</span>
                        {isAdmin && <button onClick={() => invitationsApi.revoke(companyId, inv.id, jwt).then(() => setPending(p=>p.filter(i=>i.id!==inv.id)))}
                          className="text-zinc-600 hover:text-red-400 text-xs transition-colors">Revoke</button>}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* AUDIT */}
      {tab==='audit' && (
        <div className="bg-[#191D24] border border-[#232830] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#232830] flex items-center justify-between">
            <h2 className="text-[#F0F2F5] font-semibold text-sm">Audit Trail</h2>
            <p className="text-zinc-600 text-xs">{audit.length} events</p>
          </div>
          {audit.length === 0
            ? <p className="text-center text-zinc-600 py-10 text-sm">No audit events yet.</p>
            : <div className="divide-y divide-[#232830] max-h-[520px] overflow-y-auto">
                {audit.map((log, i) => (
                  <div key={log.id} className="flex items-start gap-4 px-6 py-3.5">
                    <div className="flex flex-col items-center pt-0.5 gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      {i < audit.length-1 && <div className="w-px flex-1 bg-[#232830] min-h-[18px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#F0F2F5] text-xs font-semibold">{log.action}</span>
                        <span className="text-zinc-400 text-[10px] bg-[#13161B] border border-[#232830] px-2 py-0.5 rounded font-mono">{log.entity}</span>
                      </div>
                      {log.user && <p className="text-zinc-500 text-[11px] mt-0.5">by {log.user.name}</p>}
                    </div>
                    <span className="text-zinc-600 text-[10px] flex-shrink-0">
                      {new Date(log.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}{' '}
                      {new Date(log.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}
