// src/company/company.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** All companies a user belongs to, with their role in each */
  async listForUser(userId: string) {
    const memberships = await this.prisma.companyUser.findMany({
      where: { userId },
      include: {
        company: {
          include: {
            _count: { select: { meetings: true, companyUsers: true } },
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return memberships.map(m => ({
      ...m.company,
      myRole: m.role,
      isWorkspaceAdmin: m.isWorkspaceAdmin,
      joinedAt: m.acceptedAt ?? m.invitedAt,
    }));
  }

  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        companyUsers: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          orderBy: { invitedAt: 'asc' },
        },
        _count: { select: { meetings: true, resolutions: true, documents: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  /**
   * Create a new company workspace.
   * Creator becomes DIRECTOR + isWorkspaceAdmin:true.
   * Chairperson is NOT auto-assigned — elected per meeting (SS-1) or per AOA.
   */
  async create(dto: CreateCompanyDto, userId: string) {
    // Check CIN uniqueness if provided
    if (dto.cin) {
      const existing = await this.prisma.company.findUnique({ where: { cin: dto.cin } });
      if (existing) throw new ConflictException('A company with this CIN already exists');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Strip mcaDirectors from the main dto before creating — it's stored separately
      const { mcaDirectors, ...companyData } = dto as any;
      const company = await tx.company.create({
        data: {
          ...companyData,
          ...(mcaDirectors?.length ? { mcaDirectors } : {}),
        },
      });

      await tx.companyUser.create({
        data: {
          companyId:        company.id,
          userId,
          role:             UserRole.DIRECTOR,
          isWorkspaceAdmin: true,   // Workspace creator — platform privilege only
          acceptedAt:       new Date(),
        },
      });

      return company;
    });

    await this.audit.log({
      companyId: result.id,
      userId,
      action: 'COMPANY_CREATED',
      entity: 'Company',
      entityId: result.id,
      metadata: { name: result.name },
    });

    return result;
  }

  async update(companyId: string, dto: UpdateCompanyDto, userId: string) {
    await this.ensureExists(companyId);

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });

    await this.audit.log({
      companyId, userId,
      action: 'COMPANY_UPDATED',
      entity: 'Company',
      entityId: companyId,
      metadata: dto,
    });

    return updated;
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  async listMembers(companyId: string) {
    return this.prisma.companyUser.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } },
      },
      orderBy: [{ role: 'asc' }, { invitedAt: 'asc' }],
    });
  }

  /**
   * Change a member's role or designation.
   * Workspace admin transfer is handled separately via transferWorkspaceAdmin().
   */
  async updateMemberRole(
    companyId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    requestingUserId: string,
  ) {
    const target = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });
    if (!target) throw new NotFoundException('Member not found in this company');

    const updateData: Record<string, any> = {};
    if (dto.role !== undefined)                  updateData.role                  = dto.role as UserRole;
    if (dto.additionalDesignation !== undefined) updateData.additionalDesignation = dto.additionalDesignation || null;
    if (dto.designationLabel !== undefined)      updateData.designationLabel      = dto.designationLabel || null;

    await this.prisma.companyUser.update({
      where: { userId_companyId: { userId: targetUserId, companyId } },
      data: updateData,
    });

    await this.audit.log({
      companyId,
      userId: requestingUserId,
      action: 'MEMBER_ROLE_UPDATED',
      entity: 'CompanyUser',
      entityId: targetUserId,
      metadata: dto,
    });

    return this.listMembers(companyId);
  }

  /**
   * Transfer workspace admin to another DIRECTOR — atomic, one holder at a time.
   * Only the current workspace admin can invoke this.
   */
  async transferWorkspaceAdmin(
    companyId: string,
    newAdminUserId: string,
    requestingUserId: string,
  ) {
    const target = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: newAdminUserId, companyId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role !== UserRole.DIRECTOR) {
      throw new BadRequestException('Workspace admin can only be transferred to a Director.');
    }

    await this.prisma.$transaction([
      this.prisma.companyUser.updateMany({
        where: { companyId, isWorkspaceAdmin: true },
        data: { isWorkspaceAdmin: false },
      }),
      this.prisma.companyUser.update({
        where: { userId_companyId: { userId: newAdminUserId, companyId } },
        data: { isWorkspaceAdmin: true },
      }),
    ]);

    await this.audit.log({
      companyId,
      userId: requestingUserId,
      action: 'WORKSPACE_ADMIN_TRANSFERRED',
      entity: 'CompanyUser',
      entityId: newAdminUserId,
      metadata: { from: requestingUserId, to: newAdminUserId },
    });

    return this.listMembers(companyId);
  }

  /** Remove a member. Cannot remove yourself or the last workspace admin. */
  async removeMember(companyId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('You cannot remove yourself from the company');
    }

    const target = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (target.isWorkspaceAdmin) {
      throw new BadRequestException(
        'Cannot remove the workspace admin. Transfer workspace admin to another Director first.',
      );
    }

    await this.prisma.companyUser.delete({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });

    await this.audit.log({
      companyId,
      userId: requestingUserId,
      action: 'MEMBER_REMOVED',
      entity: 'CompanyUser',
      entityId: targetUserId,
    });
  }

  // ── Audit ────────────────────────────────────────────────────────────────────

  async getAuditLog(companyId: string) {
    return this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async ensureExists(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /** Used by CompanyGuard — returns the membership or null */
  async getMembership(userId: string, companyId: string) {
    return this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
  }
  // ── First meeting tracking ────────────────────────────────────────────────────
  // Called by archive.service when a meeting is locked.
  // Sets firstBoardMeetingLockedId on the company — this suppresses all
  // "first meeting only" items from subsequent meeting templates.

  /**
   * Claim a director seat — links the current user to an MCA director record.
   * Stores the DIN against the CompanyUser record.
   * If a name is provided and no mcaDirectors exist, stores it as a freeform claim.
   */
  async claimSeat(
    companyId: string,
    userId: string,
    din: string,
  ) {
    // Verify user is a member
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) throw new NotFoundException('You are not a member of this company');

    // Check DIN not already claimed by another member
    const alreadyClaimed = await this.prisma.companyUser.findFirst({
      where: { companyId, din, userId: { not: userId } },
    });
    if (alreadyClaimed) throw new ConflictException('This director seat has already been claimed by another member');

    const updated = await this.prisma.companyUser.update({
      where: { userId_companyId: { userId, companyId } },
      data: { din },
    });

    await this.audit.log({
      companyId, userId,
      action: 'DIRECTOR_SEAT_CLAIMED',
      entity: 'CompanyUser', entityId: updated.id,
      metadata: { din },
    });

    return updated;
  }

  async setFirstMeetingLocked(companyId: string, meetingId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return;
    // Only set once — don't overwrite with a later locked meeting
    if ((company as any).firstBoardMeetingLockedId) return;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { firstBoardMeetingLockedId: meetingId } as any,
    });
  }

  // ── Custodian of statutory registers ─────────────────────────────────────────
  // Designated by board resolution at first meeting under Rule 28.

  async setCustodian(companyId: string, custodianUserId: string, actorId: string) {
    const member = await this.prisma.companyUser.findFirst({
      where: { companyId, userId: custodianUserId, role: { in: ['DIRECTOR', 'COMPANY_SECRETARY'] } },
    });
    if (!member) throw new Error('Custodian must be a Director or Company Secretary of this company');

    await this.prisma.company.update({
      where: { id: companyId },
      data: { minutesCustodianId: custodianUserId },
    });
  }

}