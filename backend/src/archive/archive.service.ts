// backend/src/archive/archive.service.ts
//
// The archive is the company's statutory register of board meetings —
// the permanent, immutable record required under the Companies Act 2013.
//
// Once a meeting is LOCKED its record is complete and cannot be altered.
// The archive surfaces:
//   • Signed minutes with SHA-256 integrity proof
//   • Attendance register (who attended, in what mode)
//   • Director declarations (DIR-2, DIR-8, MBP-1) receipts
//   • Board resolutions with vote tally and dissent record
//   • Certified copies issued

import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService }   from '../prisma/prisma.service';
import { DocumentService } from '../document/document.service';
import { AuditService }    from '../audit/audit.service';
import * as crypto         from 'crypto';

@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly documents:  DocumentService,
    private readonly audit:      AuditService,
  ) {}

  // ── List archived meetings with full statutory register ──────────────────
  async listArchive(companyId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where:   { companyId, status: { in: ['SIGNED', 'LOCKED'] } },
      include: {
        minutes: {
          include: { document: true },
        },
        // Attendance register
        attendance: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { recordedAt: 'asc' },
        },
        // Director declarations (DIR-2, DIR-8, MBP-1)
        declarations: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ userId: 'asc' }, { formType: 'asc' }],
        },
        // Resolutions with votes
        resolutions: {
          include: {
            votes: { include: { user: { select: { id: true, name: true } } } },
            certifiedCopies: { select: { id: true, certifiedAt: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { resolutions: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    return meetings.map(m => {
      // Attendance summary
      const present = m.attendance.filter(a => a.mode !== 'ABSENT');
      const absent  = m.attendance.filter(a => a.mode === 'ABSENT');

      // Declarations summary — group by director
      const declarationsByDirector = m.declarations.reduce<Record<string, {
        name: string;
        forms: { formType: string; received: boolean; notes: string | null }[];
      }>>((acc, d) => {
        if (!acc[d.userId]) acc[d.userId] = { name: d.user.name, forms: [] };
        acc[d.userId].forms.push({ formType: d.formType, received: d.received, notes: d.notes });
        return acc;
      }, {});

      // Resolution summary
      const resolutionSummary = m.resolutions.map(r => ({
        id:     r.id,
        title:  r.title,
        type:   r.type,
        status: r.status,
        tally:  {
          APPROVE: r.votes.filter(v => v.value === 'APPROVE').length,
          REJECT:  r.votes.filter(v => v.value === 'REJECT').length,
          ABSTAIN: r.votes.filter(v => v.value === 'ABSTAIN').length,
        },
        dissenters: r.votes
          .filter(v => v.value === 'REJECT')
          .map(v => v.user.name),
        certifiedCopiesCount: r.certifiedCopies.length,
      }));

      return {
        // Core meeting fields
        id:             m.id,
        companyId:      m.companyId,
        title:          m.title,
        scheduledAt:    m.scheduledAt,
        status:         m.status,
        location:       m.location,
        videoProvider:  m.videoProvider,
        chairpersonId:  m.chairpersonId,

        // Minutes integrity
        signedAt:       m.minutes?.signedAt ?? null,
        signatureHash:  m.minutes?.signatureHash ?? null,
        minutesStatus:  m.minutes?.status ?? null,

        // Statutory register sections
        attendanceRegister: {
          present:      present.map(a => ({ userId: a.userId, name: a.user.name, mode: a.mode })),
          absent:       absent.map(a => ({ userId: a.userId, name: a.user.name })),
          presentCount: present.length,
          totalCount:   m.attendance.length,
          quorumMet:    present.length >= Math.max(2, Math.ceil(m.attendance.length / 3)),
        },

        declarations: Object.values(declarationsByDirector),

        resolutions: resolutionSummary,

        // Convenience counts
        documentCount:        m.minutes?.document ? 1 : 0,
        certifiedCopiesTotal: resolutionSummary.reduce((s, r) => s + r.certifiedCopiesCount, 0),
      };
    });
  }

  // ── Lock a SIGNED meeting (makes the record immutable) ───────────────────
  async lockMeeting(companyId: string, meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where:   { id: meetingId, companyId },
      include: { minutes: true },
    });

    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'SIGNED') {
      throw new BadRequestException(
        `Cannot lock a meeting in ${meeting.status} status. Only SIGNED meetings can be locked.`,
      );
    }
    if (!meeting.minutes?.signatureHash) {
      throw new BadRequestException(
        'Minutes must be signed before the meeting can be locked.',
      );
    }

    const locked = await this.prisma.meeting.update({
      where: { id: meetingId },
      data:  { status: 'LOCKED' },
    });

    await this.audit.log({
      companyId, userId: actorId,
      action:   'MEETING_LOCKED',
      entity:   'Meeting', entityId: meetingId,
      metadata: { signatureHash: meeting.minutes.signatureHash },
    });

    return locked;
  }

  // ── Issue a certified copy PDF of the minutes ────────────────────────────
  async issueCertifiedCopy(companyId: string, meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where:   { id: meetingId, companyId },
      include: { minutes: true },
    });

    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['SIGNED', 'LOCKED'].includes(meeting.status)) {
      throw new BadRequestException(
        'Only signed or locked meetings can have certified copies issued.',
      );
    }
    if (!meeting.minutes) {
      throw new BadRequestException('No minutes found for this meeting.');
    }

    const doc = await this.documents.generateMinutesPdf(companyId, meetingId, actorId);

    await this.audit.log({
      companyId, userId: actorId,
      action:   'CERTIFIED_COPY_ISSUED',
      entity:   'Document', entityId: doc.id,
      metadata: { meetingId },
    });

    return doc;
  }

  // ── Verify a document's SHA-256 integrity ────────────────────────────────
  async verifyDocument(companyId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where:   { id: documentId, companyId },
      include: { minutes: true },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (!doc.hash) {
      return { verified: false, reason: 'No hash recorded for this document.' };
    }
    if (!doc.minutes?.content) {
      return { verified: false, reason: 'Original minutes content not found.' };
    }

    const recomputed = crypto
      .createHash('sha256')
      .update(doc.minutes.content)
      .digest('hex');

    const verified = recomputed === doc.hash;

    return {
      verified,
      storedHash:   doc.hash,
      computedHash: recomputed,
      reason: verified
        ? 'Document integrity confirmed.'
        : 'Hash mismatch — document may have been tampered with.',
    };
  }

  // ── List certified copies for a meeting ──────────────────────────────────
  async listCertifiedCopies(companyId: string, meetingId: string) {
    const minutes = await this.prisma.minutes.findUnique({
      where:   { meetingId },
      include: { document: true },
    });
    return minutes?.document ? [minutes.document] : [];
  }
}
