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
  registeredAt?: string | null;  // registered office address
  myRole: 'DIRECTOR' | 'COMPANY_SECRETARY' | 'AUDITOR' | 'OBSERVER';
  isWorkspaceAdmin: boolean; createdAt: string;
  pendingVotes?: number; unsignedDocs?: number; live?: boolean;
}

export interface CompanyDetail extends CompanyWithMeta {
  _count: { meetings: number; resolutions: number; documents: number };
  firstBoardMeetingLockedId?: string | null;
  minutesCustodianId?: string | null;
}

export interface CompanyMember {
  id: string; userId: string; role: string; isWorkspaceAdmin: boolean;
  additionalDesignation?: string; designationLabel?: string;
  acceptedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface PendingInvite {
  id: string; email: string; role: string; expiresAt: string;
  invitedBy: { name: string };
}

export interface InvitePreview {
  company: CompanyWithMeta; role: string; email: string;
  expiresAt: string;
  invitedBy: { name: string };
}

export interface AgendaItem {
  id: string; meetingId: string; title: string;
  description: string | null; order: number;
  itemType?: string;
  legalBasis?: string | null;
  guidanceNote?: string | null;
  isAob?: boolean;
}

export type MeetingStatus =
  | 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'VOTING'
  | 'MINUTES_DRAFT' | 'MINUTES_CIRCULATED' | 'SIGNED' | 'LOCKED';

export interface Meeting {
  id: string; companyId: string; title: string; description?: string | null;
  status: MeetingStatus; scheduledAt: string; createdAt: string;
  location?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  videoMeetingId?: string | null;
  chairpersonId?: string | null;
  minutesRecorderId?: string | null;
  minutesCirculatedAt?: string | null;
}

export interface MeetingRollCallResponse {
  userId:            string;
  location:          string;
  noThirdParty:      boolean;
  materialsReceived: boolean;
  respondedAt:       string;
  user:              { id: string; name: string };
}

export interface RollCallStatus {
  responses:           MeetingRollCallResponse[];
  pendingDirectors:    { userId: string; name: string }[];
  allResponded:        boolean;
  rollCallCompletedAt: string | null;
}

export interface QuorumResult {
  confirmed:           boolean;
  presentCount:        number;
  totalMembers:        number;
  quorumRequired:      number;
  quorumConfirmedAt:   string;
}

export type MeetingDetail = Meeting & {
  agendaItems:             AgendaItem[];
  minutes?:                Minutes | null;
  isFirstMeeting?:         boolean;
  deemedVenue?:            string | null;
  noticeSentAt?:           string | null;
  noticeAcknowledgedBy?:   string[];
  rollCallCompletedAt?:    string | null;
  quorumConfirmedAt?:      string | null;
  quorumConfirmedBy?:      string | null;
};

// Chairperson nomination state — returned by GET /chairperson/nomination
export interface NominationState {
  chairpersonId:  string | null;   // set once elected, null while pending
  nomineeId:      string | null;   // current pending nominee
  proposedBy:     string | null;   // userId of proposer
  confirmedBy:    string[];        // userIds who confirmed
  confirmCount:   number;
  majorityNeeded: number;
  totalDirectors: number;
  isMajority:     boolean;
  directors:      { userId: string; name: string }[];
}

export interface Resolution {
  id: string; meetingId: string | null; agendaItemId: string | null;
  type?: 'MEETING' | 'CIRCULAR' | 'NOTING';
  title: string; text: string; status: string;
  tally?: { APPROVE: number; REJECT: number; ABSTAIN: number };
  votes?: Vote[];
  directorCount?: number;
  createdAt: string;
  vaultDocId?:   string | null;
  meetingDocId?: string | null;
  // Exhibit document — returned by findByMeeting, must be opened before noting
  exhibitDoc?: { fileName: string; downloadUrl: string } | null;
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


export type AttendanceMode = 'IN_PERSON' | 'VIDEO' | 'PHONE' | 'ABSENT';

export interface AttendanceRecord {
  userId:     string;
  name:       string;
  email:      string;
  role:       string;
  isWorkspaceAdmin: boolean;
  attendance: {
    id:           string;
    mode:         AttendanceMode;
    recordedAt:   string;
    location?:    string | null;
    noThirdParty?: boolean | null;
  } | null;
}


export type DeclarationFormType = 'DIR_2' | 'DIR_8' | 'MBP_1';

export interface DirectorDeclarationForm {
  formType:   DeclarationFormType;
  received:   boolean;
  notes:      string | null;
  recordedAt: string | null;
}

export interface DirectorDeclarationRecord {
  userId:     string;
  name:       string;
  email:      string;
  role:       string;
  isWorkspaceAdmin: boolean;
  forms:      DirectorDeclarationForm[];
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
  register: (body: { name: string; email: string; password: string; platformRoles?: string[] }) =>
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
  updateMemberRole: (companyId: string, userId: string, body: { role?: string; additionalDesignation?: string | null; designationLabel?: string | null }, token: string) =>
    patch<CompanyMember>(`/companies/${companyId}/members/${userId}`, body, token),
  transferAdmin: (companyId: string, newAdminUserId: string, token: string) =>
    post<{ message: string }>(`/companies/${companyId}/transfer-admin`, { newAdminUserId }, token),
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
  create: (companyId: string, body: { title: string; scheduledAt: string; deemedVenue?: string; location?: string; videoProvider?: string; videoUrl?: string }, token: string) =>
    post<Meeting>(`/companies/${companyId}/meetings`, body, token),
  remove: (companyId: string, meetingId: string, token: string) =>
    del<{ message: string }>(`/companies/${companyId}/meetings/${meetingId}`, token),
  update: (companyId: string, meetingId: string, body: Partial<{ title: string; scheduledAt: string }>, token: string) =>
    patch<Meeting>(`/companies/${companyId}/meetings/${meetingId}`, body, token),
  advance: (companyId: string, meetingId: string, status: string, token: string) =>
    patch<Meeting>(`/companies/${companyId}/meetings/${meetingId}/status/${status}`, undefined, token),
  addAgendaItem: (companyId: string, meetingId: string, body: { title: string; description?: string; itemType?: string; legalBasis?: string; guidanceNote?: string }, token: string) =>
    post<AgendaItem>(`/companies/${companyId}/meetings/${meetingId}/agenda`, body, token),
  getAttendance: (companyId: string, meetingId: string, token: string) =>
    get<AttendanceRecord[]>(`/companies/${companyId}/meetings/${meetingId}/attendance`, token),
  recordAttendance: (companyId: string, meetingId: string, body: { userId: string; mode: AttendanceMode; location?: string; noThirdParty?: boolean }, token: string) =>
    post<AttendanceRecord>(`/companies/${companyId}/meetings/${meetingId}/attendance`, body, token),
  requestAttendance: (companyId: string, meetingId: string, mode: 'VIDEO' | 'PHONE', token: string) =>
    post<{ message: string }>(`/companies/${companyId}/meetings/${meetingId}/attendance/request`, { mode }, token),
  // ── Chairperson nomination — persisted to DB so all directors see the same state ──
  getNomination: (companyId: string, meetingId: string, token: string) =>
    get<NominationState>(`/companies/${companyId}/meetings/${meetingId}/chairperson/nomination`, token),
  nominateChairperson: (companyId: string, meetingId: string, nomineeId: string, token: string) =>
    post<NominationState>(`/companies/${companyId}/meetings/${meetingId}/chairperson/nominate`, { nomineeId }, token),
  confirmChairperson: (companyId: string, meetingId: string, token: string) =>
    post<NominationState>(`/companies/${companyId}/meetings/${meetingId}/chairperson/confirm`, undefined, token),
  electChairperson: (companyId: string, meetingId: string, chairpersonId: string, token: string) =>
    post<Meeting>(`/companies/${companyId}/meetings/${meetingId}/chairperson`, { chairpersonId }, token),
  setRecorder: (companyId: string, meetingId: string, recorderId: string, token: string) =>
    post<Meeting>(`/companies/${companyId}/meetings/${meetingId}/recorder`, { recorderId }, token),
  getDeclarations: (companyId: string, meetingId: string, token: string) =>
    get<DirectorDeclarationRecord[]>(`/companies/${companyId}/meetings/${meetingId}/declarations`, token),
  recordDeclaration: (companyId: string, meetingId: string, body: { userId: string; formType: DeclarationFormType; received: boolean; notes?: string }, token: string) =>
    post<DirectorDeclarationRecord>(`/companies/${companyId}/meetings/${meetingId}/declarations`, body, token),

  // ── Guided first meeting flow ───────────────────────────────────────────────
  markAsFirstMeeting: (companyId: string, meetingId: string, token: string) =>
    post<Meeting>(`/companies/${companyId}/meetings/${meetingId}/mark-first-meeting`, undefined, token),
  acknowledgeNotice: (companyId: string, meetingId: string, token: string) =>
    post<{ acknowledged: boolean; noticeAcknowledgedBy: string[] }>(`/companies/${companyId}/meetings/${meetingId}/acknowledge-notice`, undefined, token),
  getRollCall: (companyId: string, meetingId: string, token: string) =>
    get<RollCallStatus>(`/companies/${companyId}/meetings/${meetingId}/roll-call`, token),
  submitRollCall: (companyId: string, meetingId: string, body: { location: string; noThirdParty: boolean; materialsReceived: boolean }, token: string) =>
    post<{ rollCall: MeetingRollCallResponse; allResponded: boolean }>(`/companies/${companyId}/meetings/${meetingId}/roll-call`, body, token),
  confirmQuorum: (companyId: string, meetingId: string, token: string) =>
    post<QuorumResult>(`/companies/${companyId}/meetings/${meetingId}/confirm-quorum`, undefined, token),
};

// ── Meeting Templates ─────────────────────────────────────────────────────────

export interface MeetingTemplate {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  category: string;
  agendaItems: { title: string; description?: string; order: number }[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export const meetingTemplates = {
  list: (companyId: string, token: string) =>
    get<MeetingTemplate[]>(`/companies/${companyId}/meeting-templates`, token),
  create: (companyId: string, body: { name: string; description?: string; category?: string; agendaItems: { title: string; description?: string; order: number }[] }, token: string) =>
    post<MeetingTemplate>(`/companies/${companyId}/meeting-templates`, body, token),
  update: (companyId: string, id: string, body: Partial<{ name: string; description: string; category: string; agendaItems: { title: string; description?: string; order: number }[] }>, token: string) =>
    patch<MeetingTemplate>(`/companies/${companyId}/meeting-templates/${id}`, body, token),
  remove: (companyId: string, id: string, token: string) =>
    del<void>(`/companies/${companyId}/meeting-templates/${id}`, token),
  recordUsage: (companyId: string, id: string, token: string) =>
    post<{ message: string }>(`/companies/${companyId}/meeting-templates/${id}/use`, {}, token),
};

// ── Resolutions ───────────────────────────────────────────────────────────────

export const resolutions = {
  list: (companyId: string, token: string, params?: { status?: string }) =>
    get<Resolution[]>(`/companies/${companyId}/resolutions${params?.status ? `?status=${params.status}` : ''}`, token),
  listForMeeting: (companyId: string, meetingId: string, token: string) =>
    get<Resolution[]>(`/companies/${companyId}/meetings/${meetingId}/resolutions`, token),
  create: (companyId: string, meetingId: string, body: { title: string; text: string; agendaItemId?: string; type?: 'MEETING' | 'NOTING'; vaultDocId?: string; meetingDocId?: string }, token: string) =>
    post<Resolution>(`/companies/${companyId}/meetings/${meetingId}/resolutions`, body, token),
  update: (companyId: string, resolutionId: string, body: Partial<{ title: string; text: string }>, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}`, body, token),
  remove: (companyId: string, resolutionId: string, token: string) =>
    del<{ message: string }>(`/companies/${companyId}/resolutions/${resolutionId}`, token),
  propose: (companyId: string, resolutionId: string, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}/propose`, undefined, token),
  note: (companyId: string, resolutionId: string, token: string) =>
    patch<Resolution>(`/companies/${companyId}/resolutions/${resolutionId}/note`, undefined, token),
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
    post<{ downloadUrl: string; objectPath: string }>(`/companies/${companyId}/meetings/${meetingId}/minutes/export`, undefined, token),
};

// ── Archive ───────────────────────────────────────────────────────────────────

// ── Archive entry type (full statutory register) ─────────────────────────────

export interface ArchiveAttendanceRecord {
  userId: string; name: string; mode: string;
}
export interface ArchiveDeclarationForm {
  formType: string; received: boolean; notes: string | null;
}
export interface ArchiveDeclaration {
  name: string;
  forms: ArchiveDeclarationForm[];
}
export interface ArchiveResolution {
  id: string; title: string; type: string; status: string;
  tally: { APPROVE: number; REJECT: number; ABSTAIN: number };
  dissenters: string[];
  certifiedCopiesCount: number;
}
export interface ArchiveEntry {
  id: string; companyId: string; title: string;
  scheduledAt: string; status: 'SIGNED' | 'LOCKED';
  location: string | null; videoProvider: string | null;
  chairpersonId: string | null;
  signedAt: string | null; signatureHash: string | null; minutesStatus: string | null;
  attendanceRegister: {
    present: ArchiveAttendanceRecord[];
    absent:  ArchiveAttendanceRecord[];
    presentCount: number; totalCount: number; quorumMet: boolean;
  };
  declarations: ArchiveDeclaration[];
  resolutions: ArchiveResolution[];
  documentCount: number; certifiedCopiesTotal: number;
}

export const archive = {
  list: (companyId: string, token: string) =>
    get<ArchiveEntry[]>(`/companies/${companyId}/archive`, token),
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

// ── Circular Resolutions ──────────────────────────────────────────────────────

export interface CircularSignature {
  id:          string;
  resolutionId: string;
  userId:      string;
  value:       'FOR' | 'OBJECT';
  remarks:     string | null;
  signedAt:    string;
  user:        { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface CircularResolution {
  id:                string;
  companyId:         string;
  title:             string;
  text:              string;
  circulationNote:   string | null;
  deadline:          string | null;
  serialNumber:      string | null;
  notedAtMeetingId:  string | null;
  status:            'DRAFT' | 'PROPOSED' | 'APPROVED' | 'REJECTED';
  createdAt:         string;
  signatures:        CircularSignature[];
}

export const circular = {
  list:           (companyId: string, token: string) =>
    get<CircularResolution[]>(`/companies/${companyId}/circular-resolutions`, token),
  findOne:        (companyId: string, id: string, token: string) =>
    get<CircularResolution>(`/companies/${companyId}/circular-resolutions/${id}`, token),
  create:         (companyId: string, body: { title: string; text: string; circulationNote?: string; deadline?: string }, token: string) =>
    post<CircularResolution>(`/companies/${companyId}/circular-resolutions`, body, token),
  update:         (companyId: string, id: string, body: Partial<{ title: string; text: string; circulationNote: string; deadline: string }>, token: string) =>
    patch<CircularResolution>(`/companies/${companyId}/circular-resolutions/${id}`, body, token),
  remove:         (companyId: string, id: string, token: string) =>
    del<{ message: string }>(`/companies/${companyId}/circular-resolutions/${id}`, token),
  circulate:      (companyId: string, id: string, token: string) =>
    post<CircularResolution>(`/companies/${companyId}/circular-resolutions/${id}/circulate`, undefined, token),
  sign:           (companyId: string, id: string, body: { value: 'FOR' | 'OBJECT'; remarks?: string }, token: string) =>
    post<CircularSignature>(`/companies/${companyId}/circular-resolutions/${id}/sign`, body, token),
  requestMeeting: (companyId: string, id: string, token: string) =>
    post<{ message: string; requestCount: number; threshold: number; thresholdMet: boolean }>(`/companies/${companyId}/circular-resolutions/${id}/request-meeting`, undefined, token),
  markNoted: (companyId: string, id: string, meetingId: string, token: string) =>
    post<CircularResolution>(`/companies/${companyId}/circular-resolutions/${id}/mark-noted`, { meetingId }, token),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  subject: string;
  body: string;
  sentAt: string | null;  // null = unread
  createdAt: string;
  companyId?: string | null;
}

export const notifications = {
  list:       (token: string) =>
    get<AppNotification[]>('/notifications', token),
  markRead:   (id: string, token: string) =>
    patch<unknown>(`/notifications/${id}/read`, undefined, token),
  markAllRead:(token: string) =>
    patch<unknown>('/notifications/read-all', undefined, token),
};

// ── Document Vault ─────────────────────────────────────────────────────────────

export interface VaultDocument {
  id: string; companyId: string; docType: string; label: string;
  fileUrl: string; fileName: string; fileSize: number | null;
  uploadedAt: string; uploadedBy: string;
  uploader: { id: string; name: string };
  downloadUrl?: string;
}

export interface ComplianceDoc {
  id: string; companyId: string; userId: string; formType: string;
  financialYear: string; fileUrl: string | null; fileName: string | null;
  submittedAt: string | null; receivedAt: string | null; notes: string | null;
}

export interface ComplianceMatrix {
  financialYear: string;
  matrix: {
    userId: string; name: string; email: string; role: string;
    forms: {
      formType: string; deadline: string; isOverdue: boolean;
      doc: ComplianceDoc | null;
    }[];
  }[];
}

export interface MeetingDocument {
  id: string; meetingId: string; companyId: string; title: string;
  docType: string; fileUrl: string; fileName: string;
  fileSize: number | null; isShared: boolean;
  uploadedAt: string; uploadedBy: string;
  uploader: { id: string; name: string };
  downloadUrl?: string;
}

export interface MeetingShareLink {
  id: string; meetingId: string; shareToken: string;
  isActive: boolean; createdAt: string;
}

export interface DocNote {
  id: string; meetingId: string; directorUserId: string;
  formType: string; status: 'NOTED' | 'NOTED_WITH_EXCEPTION' | 'PHYSICALLY_PRESENT';
  exception: string | null; notedBy: string; notedAt: string;
  chair: { name: string };
}

export interface DocNotesResult {
  meetingId: string; chairpersonId: string | null;
  allNoted: boolean; totalRequired: number; totalNoted: number;
  rows: {
    userId: string; name: string; email: string; role: string;
    forms: {
      formType: string;
      note: DocNote | null;
      complianceDoc: { id: string; fileName: string | null; submittedAt: string | null; downloadUrl: string | null } | null;
    }[];
  }[];
}

export const vault = {
  // ── Statutory vault ──────────────────────────────────────────────────────────
  list:   (companyId: string, token: string) =>
    get<VaultDocument[]>(`/companies/${companyId}/vault`, token),

  upload: async (companyId: string, file: File, docType: string, label: string, token: string): Promise<VaultDocument> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    fd.append('label', label);
    const res = await fetch(`/api/companies/${companyId}/vault/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.message ?? 'Upload failed'), { status: res.status, body: e }); }
    return res.json();
  },

  remove: (companyId: string, docId: string, token: string) =>
    del<void>(`/companies/${companyId}/vault/${docId}`, token),

  // ── Compliance register ───────────────────────────────────────────────────────
  compliance:   (companyId: string, token: string, fy?: string) =>
    get<ComplianceMatrix>(`/companies/${companyId}/compliance${fy ? `?fy=${fy}` : ''}`, token),

  uploadCompliance: async (companyId: string, file: File, body: { userId: string; formType: string; financialYear?: string; notes?: string }, token: string): Promise<ComplianceDoc> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('userId', body.userId);
    fd.append('formType', body.formType);
    if (body.financialYear) fd.append('financialYear', body.financialYear);
    if (body.notes) fd.append('notes', body.notes);
    const res = await fetch(`/api/companies/${companyId}/compliance/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.message ?? 'Upload failed'), { status: res.status, body: e }); }
    return res.json();
  },

  recordCompliance: (companyId: string, body: { userId: string; formType: string; financialYear?: string; notes?: string }, token: string) =>
    post<ComplianceDoc>(`/companies/${companyId}/compliance/record`, body, token),

  markReceived: (companyId: string, docId: string, body: { received: boolean; notes?: string }, token: string) =>
    patch<ComplianceDoc>(`/companies/${companyId}/compliance/${docId}/received`, body, token),

  // ── Meeting documents ─────────────────────────────────────────────────────────
  meetingDocs: (companyId: string, meetingId: string, token: string) =>
    get<MeetingDocument[]>(`/companies/${companyId}/meetings/${meetingId}/documents`, token),

  uploadMeetingDoc: async (companyId: string, meetingId: string, file: File, body: { title: string; docType: string; isShared?: boolean }, token: string): Promise<MeetingDocument> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', body.title);
    fd.append('docType', body.docType);
    fd.append('isShared', body.isShared ? 'true' : 'false');
    const res = await fetch(`/api/companies/${companyId}/meetings/${meetingId}/documents/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.message ?? 'Upload failed'), { status: res.status, body: e }); }
    return res.json();
  },

  toggleShared: (companyId: string, meetingId: string, docId: string, isShared: boolean, token: string) =>
    patch<MeetingDocument>(`/companies/${companyId}/meetings/${meetingId}/documents/${docId}/shared`, { isShared }, token),

  removeMeetingDoc: (companyId: string, meetingId: string, docId: string, token: string) =>
    del<void>(`/companies/${companyId}/meetings/${meetingId}/documents/${docId}`, token),

  // ── Share link ────────────────────────────────────────────────────────────────
  createShareLink:     (companyId: string, meetingId: string, token: string) =>
    post<MeetingShareLink>(`/companies/${companyId}/meetings/${meetingId}/share`, {}, token),
  deactivateShareLink: (companyId: string, meetingId: string, token: string) =>
    del<void>(`/companies/${companyId}/meetings/${meetingId}/share`, token),

  // ── Doc notes ─────────────────────────────────────────────────────────────────
  docNotes: (companyId: string, meetingId: string, token: string) =>
    get<DocNotesResult>(`/companies/${companyId}/meetings/${meetingId}/doc-notes`, token),
  noteDoc:  (companyId: string, meetingId: string, body: { directorUserId: string; formType: string; status: 'NOTED' | 'NOTED_WITH_EXCEPTION' | 'PHYSICALLY_PRESENT'; exception?: string }, token: string) =>
    post<DocNote>(`/companies/${companyId}/meetings/${meetingId}/doc-notes`, body, token),
};

// ── Public (no auth) ──────────────────────────────────────────────────────────

export const publicApi = {
  meetingPapers: (shareToken: string) => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return fetch(`${API}/public/meeting/${shareToken}`).then(r => r.json());
  },
};

// ── Download URL resolver ──────────────────────────────────────────────────────
// Backend returns either a real GCS signed URL, or '__proxy__:objectPath'
// when signed URLs aren't available. This converts the latter into an
// authenticated proxy URL with the JWT appended as a query param.
export function resolveDownloadUrl(raw: string | undefined, token: string): string {
  if (!raw) return '#';
  if (raw.startsWith('__proxy__:')) {
    const path = raw.slice('__proxy__:'.length);
    return `/api/storage/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
  }
  return raw; // real signed URL — use as-is
}
