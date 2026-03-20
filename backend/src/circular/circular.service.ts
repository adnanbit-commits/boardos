// src/circular/circular.service.ts
// Section 175 Companies Act 2013 — Resolution by Circulation

import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService }       from '../prisma/prisma.service';
import { AuditService }        from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { ResolutionStatus, ResolutionType, CircularSignatureValue, UserRole } from '@prisma/client';

export interface CreateCircularDto {
  title:           string;
  text:            string;   // motion text — maps to motionText on the model
  resolutionText?: string;   // enacted wording — optional
  circulationNote: string;   // Required — SS-1 mandates explanatory note
  deadline?:       string;
}

export interface SignCircularDto {
  value:    'FOR' | 'OBJECT';
  remarks?: string;
}

@Injectable()
export class CircularService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly audit:        AuditService,
    private readonly notification: NotificationService,
  ) {}

  async list(companyId: string) {
    return this.prisma.resolution.findMany({
      where:   { companyId, type: ResolutionType.CIRCULAR },
      include: {
        signatures: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          orderBy: { signedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const res = await this.prisma.resolution.findFirst({
      where:   { id, companyId, type: ResolutionType.CIRCULAR },
      include: {
        signatures: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          orderBy: { signedAt: 'asc' },
        },
      },
    });
    if (!res) throw new NotFoundException('Circular resolution not found');
    return res;
  }

  async create(companyId: string, userId: string, dto: CreateCircularDto) {
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);

    // Deadline stored if provided — hard cap enforced at circulate time, not create time
    // so drafts can hold any working deadline before it's circulated
    const deadline = dto.deadline
      ? new Date(dto.deadline)
      : null;

    const resolution = await this.prisma.resolution.create({
      data: {
        companyId,
        type:            ResolutionType.CIRCULAR,
        title:           dto.title,
        motionText:      dto.text,
        resolutionText:  dto.resolutionText ?? null,
        circulationNote: dto.circulationNote,
        deadline,
        status:          ResolutionStatus.DRAFT,
      },
    });

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_CREATED',
      entity: 'Resolution', entityId: resolution.id,
      metadata: { title: resolution.title },
    });

    return resolution;
  }

  async circulate(companyId: string, resolutionId: string, userId: string) {
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);

    const resolution = await this.findOne(companyId, resolutionId);
    if (resolution.status !== ResolutionStatus.DRAFT)
      throw new BadRequestException('Only DRAFT resolutions can be circulated');

    // SS-1: explanatory note is required before circulation
    if (!resolution.circulationNote?.trim())
      throw new BadRequestException(
        'An explanatory note (covering note) is required before circulating — SS-1 compliance'
      );

    // SS-1: deadline must not exceed 7 days from today
    const maxDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const deadline    = resolution.deadline && resolution.deadline < maxDeadline
      ? resolution.deadline
      : maxDeadline;

    // Assign serial number: CR/<YYYY>/<NNN> — scoped per company
    const serialNumber = await this.assignSerialNumber(companyId);

    const updated = await this.prisma.resolution.update({
      where: { id: resolutionId },
      data:  {
        status: ResolutionStatus.PROPOSED,
        deadline,
        serialNumber,
      },
    });

    // Notify all directors and admins who have accepted membership
    const directors = await this.prisma.companyUser.findMany({
      where:   { companyId, role: { in: [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY] }, acceptedAt: { not: null } },
      include: { user: true },
    });

    for (const d of directors) {
      await this.notification.send({
        userId:    d.userId,
        companyId,
        type:      'SIGNATURE_REQUEST',
        subject:   `Circular Resolution ${serialNumber}: ${resolution.title}`,
        body:      `A resolution by circulation requires your consent.\n\n${resolution.circulationNote}\n\nDeadline: ${deadline.toDateString()}.\n\nPlease log in to SafeMinutes to sign or object.`,
      }).catch(() => {});
    }

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_CIRCULATED',
      entity: 'Resolution', entityId: resolutionId,
      metadata: { serialNumber, directorsNotified: directors.length, deadline: deadline.toISOString() },
    });

    return updated;
  }

  async sign(companyId: string, resolutionId: string, userId: string, dto: SignCircularDto) {
    const resolution = await this.findOne(companyId, resolutionId);

    if (resolution.status !== ResolutionStatus.PROPOSED)
      throw new BadRequestException('This resolution is not open for signatures');
    if (resolution.deadline && new Date() > resolution.deadline)
      throw new BadRequestException('The deadline for this resolution has passed');

    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);

    const signature = await this.prisma.circularSignature.upsert({
      where:  { resolutionId_userId: { resolutionId, userId } },
      create: { resolutionId, userId, value: dto.value as CircularSignatureValue, remarks: dto.remarks },
      update: { value: dto.value as CircularSignatureValue, remarks: dto.remarks, signedAt: new Date() },
    });

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_SIGNED',
      entity: 'Resolution', entityId: resolutionId,
      metadata: { value: dto.value, serialNumber: resolution.serialNumber },
    });

    await this.checkMajority(companyId, resolutionId);
    return signature;
  }

  async requestMeeting(companyId: string, resolutionId: string, userId: string) {
    const resolution = await this.findOne(companyId, resolutionId);
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);

    // Sec. 175(2): 1/3rd of total directors must request before it becomes mandatory
    const totalDirectors = await this.prisma.companyUser.count({
      where: { companyId, role: { in: [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY] }, acceptedAt: { not: null } },
    });
    const threshold = Math.ceil(totalDirectors / 3);

    // Count unique meeting requests from audit log
    const existingRequests = await this.prisma.auditLog.count({
      where: {
        companyId,
        entityId: resolutionId,
        action:   'CIRCULAR_RESOLUTION_MEETING_REQUESTED',
      },
    });

    // Check if this user already requested
    const alreadyRequested = await this.prisma.auditLog.findFirst({
      where: {
        companyId,
        userId,
        entityId: resolutionId,
        action:   'CIRCULAR_RESOLUTION_MEETING_REQUESTED',
      },
    });
    if (alreadyRequested)
      throw new BadRequestException('You have already requested a meeting for this resolution');

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_MEETING_REQUESTED',
      entity: 'Resolution', entityId: resolutionId,
      metadata: { requestsAfterThis: existingRequests + 1, threshold },
    });

    const newCount = existingRequests + 1;
    const thresholdMet = newCount >= threshold;

    // If threshold met, notify admins
    if (thresholdMet) {
      const admins = await this.prisma.companyUser.findMany({
        where: { companyId, role: UserRole.DIRECTOR, acceptedAt: { not: null } },
        include: { user: true },
      });
      for (const admin of admins) {
        await this.notification.send({
          userId:    admin.userId,
          companyId,
          type:      'GENERAL',
          subject:   `Meeting Required: Circular Resolution ${resolution.serialNumber ?? resolution.title}`,
          body:      `${newCount} of ${totalDirectors} directors have requested this resolution be moved to a board meeting. The 1/3rd threshold has been met — a board meeting must be convened.`,
        }).catch(() => {});
      }
    }

    return {
      message:       thresholdMet
        ? `Meeting threshold met (${newCount}/${totalDirectors}). Admins have been notified to schedule a board meeting.`
        : `Meeting request recorded (${newCount}/${threshold} required to mandate a meeting).`,
      requestCount:  newCount,
      threshold,
      thresholdMet,
    };
  }

  // Mark a circular resolution as noted at a subsequent board meeting (Sec. 175(2))
  async markNoted(companyId: string, resolutionId: string, meetingId: string, userId: string) {
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);

    const resolution = await this.findOne(companyId, resolutionId);
    if (resolution.status !== ResolutionStatus.APPROVED)
      throw new BadRequestException('Only approved circular resolutions can be marked as noted');
    if (resolution.notedAtMeetingId)
      throw new BadRequestException('This resolution has already been noted at a meeting');

    // Verify the meeting belongs to this company
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const updated = await this.prisma.resolution.update({
      where: { id: resolutionId },
      data:  { notedAtMeetingId: meetingId },
    });

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_NOTED',
      entity: 'Resolution', entityId: resolutionId,
      metadata: { notedAtMeetingId: meetingId, serialNumber: resolution.serialNumber },
    });

    return updated;
  }

  // Edit a DRAFT circular — only allowed while still in DRAFT
  async update(companyId: string, resolutionId: string, userId: string, dto: Partial<CreateCircularDto>) {
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);
    const resolution = await this.findOne(companyId, resolutionId);
    if (resolution.status !== ResolutionStatus.DRAFT)
      throw new BadRequestException('Only DRAFT resolutions can be edited');

    const updated = await this.prisma.resolution.update({
      where: { id: resolutionId },
      data: {
        ...(dto.title           !== undefined && { title:           dto.title }),
        ...(dto.text            !== undefined && { motionText:      dto.text }),
        ...(dto.resolutionText  !== undefined && { resolutionText:  dto.resolutionText }),
        ...(dto.circulationNote !== undefined && { circulationNote: dto.circulationNote }),
        ...(dto.deadline        !== undefined && { deadline:        new Date(dto.deadline) }),
      },
    });

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_UPDATED',
      entity: 'Resolution', entityId: resolutionId, metadata: {},
    });

    return updated;
  }

  // Delete a DRAFT circular — only allowed while still in DRAFT
  async remove(companyId: string, resolutionId: string, userId: string) {
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY]);
    const resolution = await this.findOne(companyId, resolutionId);
    if (resolution.status !== ResolutionStatus.DRAFT)
      throw new BadRequestException('Only DRAFT resolutions can be deleted');

    await this.prisma.resolution.delete({ where: { id: resolutionId } });

    await this.audit.log({
      companyId, userId, action: 'CIRCULAR_RESOLUTION_DELETED',
      entity: 'Resolution', entityId: resolutionId,
      metadata: { title: resolution.title },
    });

    return { message: 'Resolution deleted' };
  }

  // Expire overdue circulars — called by cron job
  async expireOverdue() {
    const overdue = await this.prisma.resolution.findMany({
      where: {
        type:     ResolutionType.CIRCULAR,
        status:   ResolutionStatus.PROPOSED,
        deadline: { lt: new Date() },
      },
    });

    for (const res of overdue) {
      // Check if majority was reached — if so, already APPROVED, skip
      if (res.status !== ResolutionStatus.PROPOSED) continue;

      await this.prisma.resolution.update({
        where: { id: res.id },
        data:  { status: ResolutionStatus.REJECTED },
      });

      await this.audit.log({
        companyId: res.companyId, userId: 'system',
        action: 'CIRCULAR_RESOLUTION_EXPIRED',
        entity: 'Resolution', entityId: res.id,
        metadata: { deadline: res.deadline, serialNumber: res.serialNumber },
      });
    }

    return overdue.length;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async assignSerialNumber(companyId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.prisma.resolution.count({
      where: {
        companyId,
        type:         ResolutionType.CIRCULAR,
        serialNumber: { not: null },
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `CR/${year}/${seq}`;
  }

  private async checkMajority(companyId: string, resolutionId: string) {
    const totalDirectors = await this.prisma.companyUser.count({
      where: { companyId, role: { in: [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY] }, acceptedAt: { not: null } },
    });
    if (totalDirectors === 0) return;

    const forCount = await this.prisma.circularSignature.count({
      where: { resolutionId, value: CircularSignatureValue.FOR },
    });

    if (forCount > totalDirectors / 2) {
      await this.prisma.resolution.update({
        where: { id: resolutionId },
        data:  { status: ResolutionStatus.APPROVED },
      });
      await this.audit.log({
        companyId, userId: 'system', action: 'CIRCULAR_RESOLUTION_AUTO_APPROVED',
        entity: 'Resolution', entityId: resolutionId,
        metadata: { forCount, totalDirectors },
      });
    }
  }

  private async requireRole(companyId: string, userId: string, roles: UserRole[]) {
    const m = await this.prisma.companyUser.findFirst({
      where: { companyId, userId, role: { in: roles }, acceptedAt: { not: null } },
    });
    if (!m) throw new ForbiddenException('Insufficient permissions');
  }
}
