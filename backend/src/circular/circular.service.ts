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
  title:            string;
  text:             string;
  circulationNote?: string;
  deadline?:        string; // ISO — defaults to 7 days from now
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

  // ── List ──────────────────────────────────────────────────────────────────

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

  // ── Create ────────────────────────────────────────────────────────────────

  async create(companyId: string, userId: string, dto: CreateCircularDto) {
    await this.requireRole(companyId, userId, [UserRole.ADMIN, UserRole.PARTNER]);

    const deadline = dto.deadline
      ? new Date(dto.deadline)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const resolution = await this.prisma.resolution.create({
      data: {
        companyId,
        type:            ResolutionType.CIRCULAR,
        title:           dto.title,
        text:            dto.text,
        circulationNote: dto.circulationNote,
        deadline,
        status:          ResolutionStatus.DRAFT,
      },
    });

    await this.audit.log(companyId, userId, 'CIRCULAR_RESOLUTION_CREATED', { resolutionId: resolution.id, title: resolution.title });
    return resolution;
  }

  // ── Circulate (DRAFT → PROPOSED) ─────────────────────────────────────────

  async circulate(companyId: string, resolutionId: string, userId: string) {
    await this.requireRole(companyId, userId, [UserRole.ADMIN, UserRole.PARTNER]);

    const resolution = await this.findOne(companyId, resolutionId);
    if (resolution.status !== ResolutionStatus.DRAFT)
      throw new BadRequestException('Only DRAFT resolutions can be circulated');

    const updated = await this.prisma.resolution.update({
      where: { id: resolutionId },
      data:  { status: ResolutionStatus.PROPOSED },
    });

    // Notify all active directors
    const directors = await this.prisma.companyUser.findMany({
      where:   { companyId, role: { in: [UserRole.DIRECTOR, UserRole.ADMIN] }, acceptedAt: { not: null } },
      include: { user: true },
    });

    for (const d of directors) {
      await this.notification.send({
        userId:    d.userId,
        companyId,
        type:      'SIGNATURE_REQUEST',
        subject:   `Circular Resolution: ${resolution.title}`,
        body:      `A resolution by circulation requires your consent.\n\n${resolution.circulationNote ?? ''}\n\nDeadline: ${updated.deadline?.toDateString() ?? '7 days'}.\n\nPlease log in to BoardOS to sign or object.`,
      }).catch(() => {});
    }

    await this.audit.log(companyId, userId, 'CIRCULAR_RESOLUTION_CIRCULATED', { resolutionId, directorsNotified: directors.length });
    return updated;
  }

  // ── Sign ──────────────────────────────────────────────────────────────────

  async sign(companyId: string, resolutionId: string, userId: string, dto: SignCircularDto) {
    const resolution = await this.findOne(companyId, resolutionId);

    if (resolution.status !== ResolutionStatus.PROPOSED)
      throw new BadRequestException('This resolution is not open for signatures');
    if (resolution.deadline && new Date() > resolution.deadline)
      throw new BadRequestException('The deadline for this resolution has passed');

    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.ADMIN, UserRole.PARTNER]);

    const signature = await this.prisma.circularSignature.upsert({
      where:  { resolutionId_userId: { resolutionId, userId } },
      create: { resolutionId, userId, value: dto.value as CircularSignatureValue, remarks: dto.remarks },
      update: { value: dto.value as CircularSignatureValue, remarks: dto.remarks, signedAt: new Date() },
    });

    await this.audit.log(companyId, userId, 'CIRCULAR_RESOLUTION_SIGNED', { resolutionId, value: dto.value });
    await this.checkMajority(companyId, resolutionId);
    return signature;
  }

  // ── Request meeting conversion ────────────────────────────────────────────

  async requestMeeting(companyId: string, resolutionId: string, userId: string) {
    await this.findOne(companyId, resolutionId);
    await this.requireRole(companyId, userId, [UserRole.DIRECTOR, UserRole.ADMIN]);
    await this.audit.log(companyId, userId, 'CIRCULAR_RESOLUTION_MEETING_REQUESTED', { resolutionId });
    return { message: 'Meeting request recorded. Admin will be notified to schedule a meeting.' };
  }

  // ── Majority check ────────────────────────────────────────────────────────

  private async checkMajority(companyId: string, resolutionId: string) {
    const totalDirectors = await this.prisma.companyUser.count({
      where: { companyId, role: { in: [UserRole.DIRECTOR, UserRole.ADMIN] }, acceptedAt: { not: null } },
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
      await this.audit.log(companyId, 'system', 'CIRCULAR_RESOLUTION_AUTO_APPROVED', {
        resolutionId, forCount, totalDirectors,
      });
    }
  }

  // ── Role guard ────────────────────────────────────────────────────────────

  private async requireRole(companyId: string, userId: string, roles: UserRole[]) {
    const m = await this.prisma.companyUser.findFirst({
      where: { companyId, userId, role: { in: roles }, acceptedAt: { not: null } },
    });
    if (!m) throw new ForbiddenException('Insufficient permissions');
  }
}
