// src/lib/api.ts
// Typed API client. All requests go through the Next.js /api rewrite → backend.

const BASE = '/api';

async function req<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let errBody: any = {};
    try { errBody = await res.json(); } catch {}
    const err: any = new Error(errBody.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.body = errBody;
    throw err;
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

const get   = <T>(path: string, token?: string) => req<T>('GET',    path, undefined, token);
const post  = <T>(path: string, body?: unknown, token?: string) => req<T>('POST',  path, body, token);
const patch = <T>(path: string, body?: unknown, token?: string) => req<T>('PATCH', path, body, token);
const del   = <T>(path: string, token?: string) => req<T>('DELETE', path, undefined, token);

// ── Error type ────────────────────────────────────────────────────────────────

export interface ApiError extends Error {
  status: number;
  body:   { message?: string; statusCode?: number };
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface User {
  id: string; name: string; email: string; createdAt: string;
}

export interface CompanyWithMeta {
  id: string; name: string; cin?: string;
  myRole: 'ADMIN' | 'DIRECTOR' | 'OBSERVER' | 'PARTNER';
  isChairman: boolean; createdAt: string;
  pendingVotes?: number; unsignedDocs?: number; live?: boolean;
}

export interface CompanyDetail extends CompanyWithMeta {
  _count: { meetings: number; resolutions: number; documents: number };
}

export interface CompanyMember {
  id: string; userId: string; role: string; isChairman: boolean;
  acceptedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface PendingInvite {
  id: string; email: string; role: string; expiresAt: string;
  invitedBy: { name: string };
}

export interface InvitePreview {
  company: CompanyWithMeta; role: string; email: string;
  expiresAt: string; isChairman: boolean;
  invitedBy: { name: string };
}

export interface AgendaItem {
  id: string; meetingId: string; title: string;
  description: string | null; order: number;
}

export type MeetingStatus =
  | 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'VOTING'
  | 'MINUTES_DRAFT' | 'SIGNED' | 'LOCKED';

export interface Meeting {
  id: string; companyId: string; title: string; description?: string | null;
  status: MeetingStatus; scheduledAt: string; createdAt: string;
  location?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  videoMeetingId?: string | null;
}

export type MeetingDetail = Meeting & {
  agendaItems: AgendaItem[];
  minutes?: Minutes | null;
};

export interface Resolution {
  id: string; meetingId: string; agendaItemId: string | null;
  title: string; text: string; status: string;
  tally?: { APPROVE: number; REJECT: number; ABSTAIN: number };
  votes?: Vote[];
  directorCount?: number;
  createdAt: string;
}

export type ResolutionWithTally = Resolution & {
  tally: { APPROVE: number; REJECT: number; ABSTAIN: number };
};

export interface Vote {
  id: string; resolutionId: string; userId: string;
  value: 'APPROVE' | 'REJECT' | 'ABSTAIN'; remarks?: string;
  user: { id: string; name: string }; createdAt: string;
}

export interface Minutes {
  id: string; meetingId: string; content: string; status: string;
  signatureHash?: string; signedAt?: string;
}

export interface Document {
  id: string; companyId: string; minutesId?: string | null;
  name: string; type: string; s3Key: string; s3Url: string;
  mimeType: string; sizeBytes?: number | null;
  hash?: string | null;      // SHA-256 for integrity verification
  isImmutable: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string; action: string; entity: string;
  entityId?: string; createdAt: string;
  user?: { name: string };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (body: { name: string; email: string; password: string }) =>
    post<{ token: string; user: User }>('/auth/register', body),
  login: (body: { email: string; password: string }) =>
    post<{ token: string; user: User }>('/auth/login', body),
};

// ── Companies ─────────────────────────────────────────────────────────────────

export const companies = {
  list: (token: string) =>
    get<CompanyWithMeta[]>('/companies', token),
  findOne: (id: string, token: string) =>
    get<CompanyDetail>(`/companies/${id}`, token),
  create: (body: { name: string; cin?: string }, token: string) =>
    post<CompanyWithMeta>('/companies', body, token),
  update: (id: string, body: Partial<{ name: string; cin: string }>, token: string) =>
    patch<CompanyWithMeta>(`/companies/${id}`, body, token),
  listMembers: (companyId: string, token: string) =>
    get<CompanyMember[]>(`/companies/${companyId}/members`, token),
  updateMemberRole: (companyId: string, userId: string, body: { role: string }, token: string) =>
    patch<CompanyMember>(`/companies/${companyId}/members/${userId}`, body, token),
  removeMember: (companyId: string, userId: string, token: string) =>
    del<void>(`/companies/${companyId}/members/${userId}`, token),
  getAuditLog: (companyId: string, token: string) =>
    get<AuditLog[]>(`/companies/${companyId}/audit`, token),
};

// ── Invitations ───────────────────────────────────────────────────────────────

export const invitations = {
  send: (companyId: string, body: { email: string; role: string }, token: string) =>
    post<PendingInvite>(`/companies/${companyId}/invitations`, body, token),
  listPending: (companyId: string, token: string) =>
    get<PendingInvite[]>(`/companies/${companyId}/invitations`, token),
  revoke: (companyId: string, inviteId: string, token: string) =>
    del<void>(`/companies/${companyId}/invitations/${inviteId}`, token),
  preview: (token: string) =>
    get<InvitePreview>(`/companies/invitations/${token}`),
  accept: (token: string, jwt: string) =>
    post<{ company: CompanyWithMeta }>(`/companies/invitations/${token}/accept`, undefined, jwt),
};

// ── Meetings ──────────────────────────────────────────────────────────────────

export const meetings = {
  list: (companyId: string, token: string) =>
    get<Meeting[]>(`/companies/${companyId}/meetings`, token),
  findOne: (companyId: string, meetingId: string, token: string) =>
    get<MeetingDetail>(`/companies/${companyId}/meetings/${meetingId}`, token),
  create: (companyId: string, body: { title: string; scheduledAt: string }, token: string) =>
    post<Meeting>(`/companies/${companyId}/meetings`, body, token),
  update: (companyId: string, meetingId: string, body: Partial<{ title: string; scheduledAt: string }>, token: string) =>
    patch<Meeting>(`/companies/${companyId}/meetings/${meetingId}`, body, token),
  advance: (companyId: string, meetingId: string, status: string, token: string) =>
    patch<Meeting>(`/companies/${companyId}/meetings/${meetingId}/status/${status}`, undefined, token),
  addAgendaItem: (companyId: string, meetingId: string, body: { title: string; description?: string }, token: string) =>
    post<AgendaItem>(`/companies/${companyId}/meetings/${meetingId}/agenda`, body, token),
};

// ── Resolutions ───────────────────────────────────────────────────────────────

export const resolutions = {
  list: (companyId: string, token: string, params?: { status?: string }) =>
    get<Resolution[]>(`/companies/${companyId}/resolutions${params?.status ? `?status=${params.status}` : ''}`, token),
  listForMeeting: (companyId: string, meetingId: string, token: string) =>
    get<Resolution[]>(`/companies/${companyId}/meetings/${meetingId}/resolutions`, token),
  create: (companyId: string, meetingId: string, body: { title: string; text: string; agendaItemId?: string }, token: string) =>
    post<Resolution>(`/companies/${companyId}/meetings/${meetingId}/resolutions`, body, token),
  update: (companyId: string, resolutionId: string, body: Partial<{ title: string; text: string }>, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}`, body, token),
  propose: (companyId: string, resolutionId: string, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}/propose`, undefined, token),
  openVoting: (companyId: string, resolutionId: string, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}/open-voting`, undefined, token),
  withdraw: (companyId: string, resolutionId: string, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}/withdraw`, undefined, token),
  bulkOpenVoting: (companyId: string, meetingId: string, token: string) =>
    post<{ opened: number }>(`/companies/${companyId}/meetings/${meetingId}/resolutions/bulk-open-voting`, undefined, token),
};

// ── Voting ────────────────────────────────────────────────────────────────────

export const voting = {
  getTally: (companyId: string, resolutionId: string, token: string) =>
    get<{ tally: { APPROVE: number; REJECT: number; ABSTAIN: number }; votes: Vote[] }>(
      `/companies/${companyId}/resolutions/${resolutionId}/votes`, token,
    ),
  castVote: (companyId: string, resolutionId: string, body: { value: 'APPROVE' | 'REJECT' | 'ABSTAIN'; remarks?: string }, token: string) =>
    post<Vote>(`/companies/${companyId}/resolutions/${resolutionId}/votes`, body, token),
};

// ── Minutes ───────────────────────────────────────────────────────────────────

export const minutesApi = {
  get: (companyId: string, meetingId: string, token: string) =>
    get<Minutes>(`/companies/${companyId}/meetings/${meetingId}/minutes`, token),
  generate: (companyId: string, meetingId: string, token: string) =>
    post<Minutes>(`/companies/${companyId}/meetings/${meetingId}/minutes`, undefined, token),
  sign: (companyId: string, meetingId: string, token: string) =>
    post<Minutes>(`/companies/${companyId}/meetings/${meetingId}/minutes/sign`, undefined, token),
  exportPdf: (companyId: string, meetingId: string, token: string) =>
    post<{ s3Url: string; s3Key: string }>(`/companies/${companyId}/meetings/${meetingId}/minutes/export`, undefined, token),
};

// ── Archive ───────────────────────────────────────────────────────────────────

export const archive = {
  list: (companyId: string, token: string) =>
    get<(Meeting & { signatureHash?: string; documentCount: number; certifiedCopies: number })[]>(
      `/companies/${companyId}/archive`, token,
    ),
  lock: (companyId: string, meetingId: string, token: string) =>
    post<Meeting>(`/companies/${companyId}/archive/meetings/${meetingId}/lock`, undefined, token),
  certify: (companyId: string, meetingId: string, token: string) =>
    post<Document>(`/companies/${companyId}/archive/meetings/${meetingId}/certify`, undefined, token),
  verify: (companyId: string, documentId: string, token: string) =>
    get<{ verified: boolean; storedHash?: string; computedHash?: string; reason: string }>(
      `/companies/${companyId}/archive/documents/${documentId}/verify`, token,
    ),
  listCopies: (companyId: string, meetingId: string, token: string) =>
    get<Document[]>(`/companies/${companyId}/archive/meetings/${meetingId}/copies`, token),
};

// ── Dashboard helper ──────────────────────────────────────────────────────────

export async function fetchDashboardData(companyId: string, token: string) {
  const [allMeetings, allResolutions, members] = await Promise.all([
    meetings.list(companyId, token),
    resolutions.list(companyId, token),
    companies.listMembers(companyId, token),
  ]);
  const votingResolutions = allResolutions.filter(r => r.status === 'VOTING');
  return {
    upcoming:          allMeetings.filter(m => !['SIGNED', 'LOCKED'].includes(m.status)),
    votingResolutions,
    signedDocs:        allMeetings.filter(m => ['SIGNED', 'LOCKED'].includes(m.status)),
    totalMeetings:     allMeetings.length,
    pendingVotes:      votingResolutions.length,
    memberCount:       members.length,
    documentCount:     allMeetings.filter(m => m.status === 'LOCKED').length,
    allMeetings,
    allResolutions,
  };
}

// ── CIN Lookup ────────────────────────────────────────────────────────────────

export interface CinDirector {
  din: string;
  name: string;
  designation: string;
  appointedOn: string | null;
}

export interface CinLookupResult {
  cin: string;
  companyName: string;
  status: string;
  incorporatedOn: string | null;
  registeredAddress: string | null;
  companyEmail: string | null;
  directors: CinDirector[];
}

export const cinApi = {
  lookup: (cinNumber: string, token: string) =>
    get<CinLookupResult>(`/cin/lookup?cin=${encodeURIComponent(cinNumber)}`, token),
};
