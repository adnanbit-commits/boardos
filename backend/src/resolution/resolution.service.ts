// src/resolution/resolution.service.ts
//
// Owns the Resolution lifecycle:
//
//   DRAFT ──► PROPOSED ──► VOTING ──► APPROVED
//     ▲           │                └──► REJECTED
//     └───────────┘  (withdraw)
//
// Key invariants enforced here:
//   • Resolution text can only be edited in DRAFT or PROPOSED
//   • Opening voting requires the parent meeting to be in IN_PROGRESS or VOTING status
//   • APPROVED/REJECTED resolutions are immutable — no edits, no deletes
//   • Opening voting fires director notifications via BullMQ (non-blocking)
//   • Every state transition is written to the audit log

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ResolutionStatus, ResolutionType, MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { CreateResolutionDto } from './dto/create-resolution.dto';
import { UpdateResolutionDto } from './dto/update-resolution.dto';
import { BulkOpenVotingDto } from './dto/bulk-open-voting.dto';

// Legal forward-only transitions. Withdraw (PROPOSED → DRAFT) is handled separately.
const ALLOWED_TRANSITIONS: Partial<Record<ResolutionStatus, ResolutionStatus[]>> = {
  DRAFT:    ['PROPOSED'],
  PROPOSED: ['VOTING', 'DRAFT'],   // DRAFT = withdraw
  VOTING:   ['APPROVED', 'REJECTED'],
};

// Statuses in which content is frozen
const IMMUTABLE_STATUSES: ResolutionStatus[] = ['VOTING', 'APPROVED', 'REJECTED'];

@Injectable()
export class ResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notification: NotificationService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    filters: { meetingId?: string; status?: string } = {},
  ) {
    const where: any = { companyId };
    if (filters.meetingId) where.meetingId = filters.meetingId;
    if (filters.status)   where.status = filters.status as ResolutionStatus;

    return this.prisma.resolution.findMany({
      where,
      include: {
        meeting:     { select: { id: true, title: true, scheduledAt: true, status: true } },
        agendaItem:  { select: { id: true, title: true, order: true } },
        _count:      { select: { votes: true, certifiedCopies: true } },
      },
      orderBy: [{ meeting: { scheduledAt: 'desc' } }, { createdAt: 'asc' }],
    });
  }

  async findByMeeting(companyId: string, meetingId: string) {
    await this.assertMeetingBelongsToCompany(companyId, meetingId);

    const resolutions = await this.prisma.resolution.findMany({
      where: { companyId, meetingId },
      include: {
        agendaItem:      { select: { id: true, title: true, order: true } },
        votes:           { include: { user: { select: { id: true, name: true } } } },
        certifiedCopies: { select: { id: true, certifiedAt: true, documentUrl: true } },
        // Exhibit document — vault slot linked to this NOTING resolution
        vaultDoc:        { select: { id: true, fileName: true, fileUrl: true, docType: true, label: true } },
        // Exhibit document — meeting paper linked to this NOTING resolution
        meetingDoc:      { select: { id: true, fileName: true, fileUrl: true, title: true, docType: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Attach computed tally + exhibit download URLs
    return Promise.all(resolutions.map(async r => {
      const exhibitDoc = await this.resolveExhibitDoc(r);
      return {
        ...r,
        tally:      this.computeTally(r.votes),
        exhibitDoc, // { fileName, downloadUrl } | null
      };
    }));
  }

  async findOne(companyId: string, id: string) {
    const resolution = await this.prisma.resolution.findFirst({
      where: { id, companyId },
      include: {
        meeting:    { select: { id: true, title: true, scheduledAt: true, status: true } },
        agendaItem: { select: { id: true, title: true, order: true } },
        votes: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        certifiedCopies: true,
      },
    });
    if (!resolution) throw new NotFoundException('Resolution not found');

    // Attach director count for the company so frontend can show X/Y voted
    const directorCount = await this.prisma.companyUser.count({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
    });

    return {
      ...resolution,
      tally: this.computeTally(resolution.votes),
      directorCount,
    };
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  async create(
    companyId: string,
    meetingId: string,
    dto: CreateResolutionDto,
    userId: string,
  ) {
    // Meeting must exist and belong to this company
    const meeting = await this.assertMeetingBelongsToCompany(companyId, meetingId);

    // Block creating resolutions on a locked/signed meeting
    const blockedMeetingStatuses: MeetingStatus[] = ['SIGNED', 'LOCKED'];
    if (blockedMeetingStatuses.includes(meeting.status)) {
      throw new BadRequestException(
        `Cannot add resolutions to a meeting with status ${meeting.status}`,
      );
    }

    // Validate agenda item belongs to this meeting if provided
    if (dto.agendaItemId) {
      const agendaItem = await this.prisma.agendaItem.findFirst({
        where: { id: dto.agendaItemId, meetingId },
      });
      if (!agendaItem) {
        throw new BadRequestException('Agenda item does not belong to this meeting');
      }
    }

    const resolution = await this.prisma.resolution.create({
      data: {
        companyId,
        meetingId,
        agendaItemId:   dto.agendaItemId ?? null,
        title:          dto.title,
        text:           dto.text,            // motion text
        resolutionText: (dto as any).resolutionText ?? null,  // enacted text
        type:           dto.type ?? 'MEETING',
        status:         ResolutionStatus.DRAFT,
        vaultDocId:     dto.vaultDocId    ?? null,
        meetingDocId:   dto.meetingDocId  ?? null,
      } as any,
      include: {
        meeting:   { select: { title: true } },
        agendaItem: { select: { title: true } },
      },
    });

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_CREATED',
      entity: 'Resolution',
      entityId: resolution.id,
      metadata: { title: dto.title, meetingId },
    });

    return resolution;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateResolutionDto,
    userId: string,
  ) {
    const resolution = await this.assertExists(companyId, id);

    if (IMMUTABLE_STATUSES.includes(resolution.status)) {
      throw new BadRequestException(
        `Resolution cannot be edited in ${resolution.status} status. ` +
        `Editing is only allowed in DRAFT or PROPOSED.`,
      );
    }

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_UPDATED',
      entity: 'Resolution',
      entityId: id,
      metadata: dto,
    });

    return updated;
  }

  async remove(companyId: string, id: string, userId: string) {
    const resolution = await this.assertExists(companyId, id);

    if (resolution.status !== ResolutionStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT resolutions can be deleted. ` +
        `This resolution is ${resolution.status} — use withdraw instead.`,
      );
    }

    await this.prisma.resolution.delete({ where: { id } });

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_DELETED',
      entity: 'Resolution',
      entityId: id,
      metadata: { title: resolution.title },
    });
  }

  // ── Status Transitions ────────────────────────────────────────────────────────

  async transition(
    companyId: string,
    id: string,
    targetStatus: string,
    userId: string,
  ) {
    const resolution = await this.assertExists(companyId, id);
    const allowed = ALLOWED_TRANSITIONS[resolution.status] ?? [];

    if (!allowed.includes(targetStatus as ResolutionStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${resolution.status} → ${targetStatus}. ` +
        `Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    // When motion passes → store resolutionText as the enacted record
    // If resolutionText was pre-set (from template), keep it. Otherwise use text field.
    const extraData: any = { status: targetStatus as ResolutionStatus };
    if (targetStatus === 'APPROVED' && !(resolution as any).resolutionText) {
      extraData.resolutionText = resolution.text;
    }

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: extraData,
    });

    await this.audit.log({
      companyId, userId,
      action: `RESOLUTION_${targetStatus}`,
      entity: 'Resolution',
      entityId: id,
      metadata: { from: resolution.status, to: targetStatus },
    });

    return updated;
  }

  /**
   * Open a single resolution for voting.
   *
   * Guards:
   *  1. Resolution must be PROPOSED
   *  2. Parent meeting must be in VOTING status
   *     (admin drives the meeting to VOTING via the meeting state machine first)
   *
   * Side-effect:
   *  Notifies all directors asynchronously via BullMQ.
   */
  async openVoting(companyId: string, id: string, userId: string) {
    const resolution = await this.assertExists(companyId, id);

    if (resolution.status !== ResolutionStatus.PROPOSED) {
      throw new BadRequestException(
        `Only PROPOSED resolutions can be opened for voting. ` +
        `Current status: ${resolution.status}`,
      );
    }

    // Meeting must be in VOTING phase
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: resolution.meetingId ?? undefined },
      select: { status: true, title: true },
    });

    // Allow voting during IN_PROGRESS (per-motion voting) or legacy VOTING status
    if (!['IN_PROGRESS', 'VOTING'].includes(meeting?.status ?? '')) {
      throw new BadRequestException(
        `Motions can only be put to vote while the meeting is in progress. ` +
        `Current meeting status: ${meeting?.status}`,
      );
    }

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: { status: ResolutionStatus.VOTING },
    });

    // Fire-and-forget — doesn't block the response
    await this.notifyDirectorsToVote(companyId, resolution.title, id);

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_VOTING_OPENED',
      entity: 'Resolution',
      entityId: id,
      metadata: { meetingId: resolution.meetingId },
    });

    return updated;
  }

  /**
   * Open ALL proposed resolutions in a meeting for voting at once.
   *
   * Typical use: chairman clicks "Open All for Voting" at the start of the voting phase.
   * Optionally accepts a list of specific resolution IDs to open selectively.
   * Returns a summary: how many opened, how many skipped (wrong status), errors.
   */
  async bulkOpenVoting(
    companyId: string,
    meetingId: string,
    dto: BulkOpenVotingDto,
    userId: string,
  ) {
    const meeting = await this.assertMeetingBelongsToCompany(companyId, meetingId);

    if (!['IN_PROGRESS', 'VOTING'].includes(meeting.status)) {
      throw new BadRequestException(
        `Meeting must be in progress to open motions for voting. ` +
        `Current: ${meeting.status}`,
      );
    }

    // Pick up DRAFT and PROPOSED resolutions — NOTING type never votes
    const where: any = {
      companyId,
      meetingId,
      type:   { not: ResolutionType.NOTING },
      status: { in: [ResolutionStatus.DRAFT, ResolutionStatus.PROPOSED] },
    };
    if (dto.resolutionIds?.length) {
      where.id = { in: dto.resolutionIds };
    }

    const candidates = await this.prisma.resolution.findMany({ where });

    if (candidates.length === 0) {
      // Silently succeed — meeting may only have NOTING items, that's valid
      return { opened: 0, resolutions: [] };
    }

    await this.prisma.resolution.updateMany({
      where: { id: { in: candidates.map(r => r.id) } },
      data: { status: ResolutionStatus.VOTING },
    });

    await this.notifyDirectorsBulk(companyId, meeting.title, candidates.length);

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTIONS_BULK_VOTING_OPENED',
      entity: 'Meeting',
      entityId: meetingId,
      metadata: {
        count: candidates.length,
        resolutionIds: candidates.map(r => r.id),
      },
    });

    return {
      opened: candidates.length,
      resolutions: candidates.map(r => ({ id: r.id, title: r.title })),
    };
  }


  // ── Document Evidence ────────────────────────────────────────────────────────
  //
  // Chairperson sets one of three evidence paths before placing on record:
  //   A. vault/meeting doc already linked via vaultDocId (no action needed here)
  //   B. external platform URL (MCA21, Google Drive, etc.)
  //   C. physical presence at deemed venue
  //
  // Called via PATCH /resolutions/:id/set-evidence

  async setEvidence(
    companyId: string,
    id: string,
    dto: {
      externalDocUrl?: string;
      externalDocPlatform?: string;
      physicallyPresent?: boolean;
      physicalEvidence?: string;
    },
    userId: string,
  ) {
    const resolution = await this.assertExists(companyId, id);

    if (resolution.type !== 'NOTING') {
      throw new BadRequestException('Evidence can only be set on NOTING-type resolutions');
    }
    if (resolution.status !== 'DRAFT') {
      throw new BadRequestException('Evidence can only be set while resolution is in DRAFT status');
    }

    // Validate Path B: URL required with platform
    if (dto.externalDocUrl !== undefined && !dto.externalDocUrl.trim()) {
      throw new BadRequestException('External document URL cannot be empty');
    }
    if (dto.externalDocUrl && !dto.externalDocPlatform) {
      throw new BadRequestException('Platform must be specified when providing an external URL');
    }

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: {
        externalDocUrl:      dto.externalDocUrl      ?? null,
        externalDocPlatform: dto.externalDocPlatform ?? null,
        physicallyPresent:   dto.physicallyPresent   ?? null,
        physicalEvidence:    dto.physicalEvidence    ?? null,
      } as any,
    });

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_EVIDENCE_SET',
      entity: 'Resolution', entityId: id,
      metadata: {
        path: dto.physicallyPresent ? 'C_PHYSICAL'
              : dto.externalDocUrl  ? 'B_EXTERNAL'
              : 'A_VAULT',
        externalDocPlatform: dto.externalDocPlatform,
        physicallyPresent: dto.physicallyPresent,
      },
    });

    return updated;
  }

  /**
   * Place a NOTING-type resolution on record.
   * NOTING resolutions bypass the PROPOSED → VOTING → APPROVED flow entirely.
   * They represent documents taken on record (COI, MoA, DIR-2, DIR-8, MBP-1).
   * DRAFT → NOTED in one step.
   */
  async noteResolution(companyId: string, id: string, userId: string) {
    const resolution = await this.assertExists(companyId, id);

    if (resolution.type !== 'NOTING') {
      throw new BadRequestException(
        'Only NOTING-type resolutions can be placed on record. ' +
        'Voting resolutions must follow the PROPOSED → VOTING → APPROVED flow.',
      );
    }

    if (resolution.status !== 'DRAFT') {
      throw new BadRequestException(`Resolution is already ${resolution.status}`);
    }

    // At least one evidence path must be confirmed before placing on record
    const hasVaultDoc    = !!(resolution as any).vaultDocId || !!(resolution as any).meetingDocId;
    const hasExternalDoc = !!(resolution as any).externalDocUrl;
    const hasPhysical    = !!(resolution as any).physicallyPresent;

    if (!hasVaultDoc && !hasExternalDoc && !hasPhysical) {
      throw new BadRequestException(
        'Document evidence must be confirmed before placing on record. ' +
        'Link the document from BoardOS vault, provide an external URL, ' +
        'or confirm physical presence at the deemed venue.',
      );
    }

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: { status: 'NOTED' as any },
    });

    await this.audit.log({
      companyId, userId,
      action: 'RESOLUTION_NOTED',
      entity: 'Resolution', entityId: id,
      metadata: {
        title: resolution.title,
        evidencePath: hasPhysical ? 'physical' : hasExternalDoc ? 'external' : 'vault',
      },
    });

    return updated;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private computeTally(votes: Array<{ value: string }>) {
    return votes.reduce(
      (acc, v) => {
        acc[v.value] = (acc[v.value] ?? 0) + 1;
        return acc;
      },
      { APPROVE: 0, REJECT: 0, ABSTAIN: 0 } as Record<string, number>,
    );
  }

  private async assertExists(companyId: string, id: string) {
    const resolution = await this.prisma.resolution.findFirst({
      where: { id, companyId },
    });
    if (!resolution) throw new NotFoundException('Resolution not found');
    return resolution;
  }

  private async assertMeetingBelongsToCompany(companyId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, companyId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found in this company');
    return meeting;
  }

  private async notifyDirectorsToVote(
    companyId: string,
    resolutionTitle: string,
    resolutionId: string,
  ) {
    const directors = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
    });

    await Promise.all(
      directors.map(d =>
        this.notification.send({
          userId: d.userId,
          companyId,
          type: 'VOTE_REQUEST',
          subject: `Vote Required: "${resolutionTitle}"`,
          body:
            `A board resolution has been opened for your vote.\n\n` +
            `Resolution: "${resolutionTitle}"\n\n` +
            `Log in to BoardOS to cast your vote. Your vote is required to proceed.`,
        }),
      ),
    );
  }

  private async notifyDirectorsBulk(
    companyId: string,
    meetingTitle: string,
    count: number,
  ) {
    const directors = await this.prisma.companyUser.findMany({
      where: { companyId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
    });

    await Promise.all(
      directors.map(d =>
        this.notification.send({
          userId: d.userId,
          companyId,
          type: 'VOTE_REQUEST',
          subject: `Voting Open — ${count} resolution${count > 1 ? 's' : ''} in "${meetingTitle}"`,
          body:
            `${count} board resolution${count > 1 ? 's have' : ' has'} been opened for voting ` +
            `in the meeting "${meetingTitle}".\n\n` +
            `Log in to BoardOS to review and cast your votes.`,
        }),
      ),
    );
  }
  // ── Exhibit document resolver ─────────────────────────────────────────────────
  // Returns a short-lived signed download URL for the exhibit document linked to
  // a NOTING resolution. This is the document the chairperson must open before
  // placing the resolution on record — vault docs (COI, MOA, AOA etc.) or
  // meeting papers (supporting documents, director declarations).

  // ── Exhibit resolver ─────────────────────────────────────────────────────────
  //
  // Returns the full evidence payload for a NOTING resolution:
  //   - vaultDoc: signed download URL for Path A (BoardOS vault)
  //   - externalDoc: URL + platform label for Path B
  //   - physical: boolean + evidence text for Path C
  //
  // The frontend uses this to render the correct evidence UI and gate
  // "Place on Record" until one path is confirmed.

  private async resolveExhibitDoc(resolution: any): Promise<{
    // Path A — vault/meeting document
    fileName?:      string;
    downloadUrl?:   string;
    vaultDocType?:  string;
    vaultDocLabel?: string;
    vaultDocId?:    string;
    // Path B — external platform
    externalDocUrl?:      string;
    externalDocPlatform?: string;
    // Path C — physical presence
    physicallyPresent?: boolean;
    physicalEvidence?:  string;
  } | null> {
    if (resolution.type !== 'NOTING') return null;

    const result: any = {};

    // Path A: vault document (statutory docs — COI, MOA, AOA, etc.)
    if (resolution.vaultDoc?.fileUrl) {
      try {
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
        const bucket  = process.env.GCS_BUCKET_NAME ?? 'boardos-vault';
        const [url]   = await storage.bucket(bucket).file(resolution.vaultDoc.fileUrl).getSignedUrl({
          version: 'v4', action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
        });
        result.fileName      = resolution.vaultDoc.fileName;
        result.downloadUrl   = url;
        result.vaultDocType  = resolution.vaultDoc.docType;
        result.vaultDocLabel = resolution.vaultDoc.label;
        result.vaultDocId    = resolution.vaultDoc.id;
      } catch {
        result.fileName    = resolution.vaultDoc.fileName;
        result.downloadUrl = `__proxy__:${resolution.vaultDoc.fileUrl}`;
        result.vaultDocId  = resolution.vaultDoc.id;
      }
    } else if (resolution.meetingDoc?.fileUrl) {
      // Path A fallback: meeting paper
      try {
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
        const bucket  = process.env.GCS_BUCKET_NAME ?? 'boardos-vault';
        const [url]   = await storage.bucket(bucket).file(resolution.meetingDoc.fileUrl).getSignedUrl({
          version: 'v4', action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
        });
        result.fileName    = resolution.meetingDoc.fileName;
        result.downloadUrl = url;
      } catch {
        result.fileName    = resolution.meetingDoc.fileName;
        result.downloadUrl = `__proxy__:${resolution.meetingDoc.fileUrl}`;
      }
    }

    // Path B: external platform URL
    if (resolution.externalDocUrl) {
      result.externalDocUrl      = resolution.externalDocUrl;
      result.externalDocPlatform = resolution.externalDocPlatform ?? 'Other';
    }

    // Path C: physical presence
    if (resolution.physicallyPresent) {
      result.physicallyPresent = true;
      result.physicalEvidence  = resolution.physicalEvidence ?? null;
    }

    // Return null only if no evidence path has any data at all
    const hasAny = result.fileName || result.externalDocUrl || result.physicallyPresent;
    return hasAny ? result : null;
  }

}