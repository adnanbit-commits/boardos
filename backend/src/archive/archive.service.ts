// Archive service — rewritten to match Prisma schema
// Schema facts:
//   - Document links to Minutes via minutesId (not directly to Meeting)
//   - Meeting has no documents relation
//   - Document uses 'hash' field (not signatureHash)
//   - CertifiedCopy links to Resolution (not Meeting)
//   - Minutes has signatureHash

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
    private readonly prisma:    PrismaService,
    private readonly documents: DocumentService,
    private readonly audit:     AuditService,
  ) {}

  // ── List archived meetings (SIGNED or LOCKED) ────────────────────────────
  async listArchive(companyId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: { companyId, status: { in: ['SIGNED', 'LOCKED'] } },
      include: {
        minutes: {
          include: { document: true },
        },
        _count: { select: { resolutions: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    return meetings.map(m => ({
      ...m,
      signedAt:       m.minutes?.signedAt ?? null,
      signatureHash:  m.minutes?.signatureHash ?? null,
      documentCount:  m.minutes?.document ? 1 : 0,
      certifiedCopies: 0, // CertifiedCopy is per-resolution, listed separately
    }));
  }

  // ── Lock a SIGNED meeting ─────────────────────────────────────────────────
  async lockMeeting(companyId: string, meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
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
      companyId,
      userId:   actorId,
      action:   'MEETING_LOCKED',
      entity:   'Meeting',
      entityId: meetingId,
      metadata: { signatureHash: meeting.minutes.signatureHash },
    });

    return locked;
  }

  // ── Issue a certified copy (PDF) of the minutes ───────────────────────────
  async issueCertifiedCopy(companyId: string, meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
      include: { minutes: true },
    });

    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!['SIGNED', 'LOCKED'].includes(meeting.status)) {
      throw new BadRequestException('Only signed or locked meetings can have certified copies issued.');
    }
    if (!meeting.minutes) {
      throw new BadRequestException('No minutes found for this meeting.');
    }

    // generateMinutesPdf creates the Document record in DB and returns it
    const doc = await this.documents.generateMinutesPdf(companyId, meetingId, actorId);

    await this.audit.log({
      companyId,
      userId:   actorId,
      action:   'CERTIFIED_COPY_ISSUED',
      entity:   'Document',
      entityId: doc.id,
      metadata: { meetingId },
    });

    return doc;
  }

  // ── Verify a document's integrity ────────────────────────────────────────
  async verifyDocument(companyId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
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

  // ── List documents for a meeting (via minutes relation) ──────────────────
  async listCertifiedCopies(companyId: string, meetingId: string) {
    const minutes = await this.prisma.minutes.findUnique({
      where: { meetingId },
      include: { document: true },
    });
    return minutes?.document ? [minutes.document] : [];
  }
}
