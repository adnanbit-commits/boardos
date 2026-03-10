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
//   • Opening voting requires the parent meeting to be in VOTING status
//   • APPROVED/REJECTED resolutions are immutable — no edits, no deletes
//   • Opening voting fires director notifications via BullMQ (non-blocking)
//   • Every state transition is written to the audit log

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ResolutionStatus, MeetingStatus } from '@prisma/client';
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
        agendaItem: { select: { id: true, title: true, order: true } },
        votes: {
          include: { user: { select: { id: true, name: true } } },
        },
        certifiedCopies: { select: { id: true, certifiedAt: true, documentUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Attach computed tally to each resolution — saves the frontend an extra call
    return resolutions.map(r => ({
      ...r,
      tally: this.computeTally(r.votes),
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
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
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
        agendaItemId: dto.agendaItemId,
        title: dto.title,
        text: dto.text,
        status: ResolutionStatus.DRAFT,
      },
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

    const updated = await this.prisma.resolution.update({
      where: { id },
      data: { status: targetStatus as ResolutionStatus },
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

    if (meeting?.status !== MeetingStatus.VOTING) {
      throw new BadRequestException(
        `The parent meeting must be in VOTING status before opening a resolution for votes. ` +
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

    if (meeting.status !== MeetingStatus.VOTING) {
      throw new BadRequestException(
        `Meeting must be in VOTING status to open resolutions. ` +
        `Current: ${meeting.status}`,
      );
    }

    // Determine which resolutions to open
    const where: any = {
      companyId,
      meetingId,
      status: ResolutionStatus.PROPOSED,
    };
    if (dto.resolutionIds?.length) {
      where.id = { in: dto.resolutionIds };
    }

    const candidates = await this.prisma.resolution.findMany({ where });

    if (candidates.length === 0) {
      throw new BadRequestException(
        'No PROPOSED resolutions found for this meeting. ' +
        'Resolutions must be in PROPOSED status before voting can open.',
      );
    }

    // Open all in a single update
    await this.prisma.resolution.updateMany({
      where: { id: { in: candidates.map(r => r.id) } },
      data: { status: ResolutionStatus.VOTING },
    });

    // One notification batch — notify directors once with list of resolutions
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
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
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
      where: { companyId, role: { in: ['ADMIN', 'DIRECTOR'] } },
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
}
