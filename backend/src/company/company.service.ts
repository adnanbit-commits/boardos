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
      isChairman: m.isChairman,
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
   * Creator is automatically added as ADMIN + Chairman.
   */
  async create(dto: CreateCompanyDto, userId: string) {
    // Check CIN uniqueness if provided
    if (dto.cin) {
      const existing = await this.prisma.company.findUnique({ where: { cin: dto.cin } });
      if (existing) throw new ConflictException('A company with this CIN already exists');
    }

    // Use a transaction so company + membership are always created together
    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: dto });

      await tx.companyUser.create({
        data: {
          companyId: company.id,
          userId,
          role: UserRole.ADMIN,
          isChairman: true,       // Founder is Chairman by default
          acceptedAt: new Date(), // No invite needed — they own it
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
   * Change a member's role or chairman flag.
   * Rules:
   *  - Can't demote yourself if you're the only ADMIN
   *  - Only one chairman is allowed at a time (swap atomically)
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

    // Guard: cannot demote the last admin
    if (dto.role && dto.role !== UserRole.ADMIN && target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.companyUser.count({
        where: { companyId, role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot demote the only admin. Promote another member first.');
      }
    }

    // Build explicit typed update payload to satisfy Prisma's strict enum types
    const updateData: { role?: UserRole; isChairman?: boolean } = {};
    if (dto.role !== undefined)       updateData.role       = dto.role as UserRole;
    if (dto.isChairman !== undefined) updateData.isChairman = dto.isChairman;

    // If making someone chairman, unset the existing chairman atomically
    if (dto.isChairman === true && !target.isChairman) {
      await this.prisma.$transaction([
        this.prisma.companyUser.updateMany({
          where: { companyId, isChairman: true },
          data: { isChairman: false },
        }),
        this.prisma.companyUser.update({
          where: { userId_companyId: { userId: targetUserId, companyId } },
          data: updateData,
        }),
      ]);
    } else {
      await this.prisma.companyUser.update({
        where: { userId_companyId: { userId: targetUserId, companyId } },
        data: updateData,
      });
    }

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

  /** Remove a member. Cannot remove yourself or the last admin. */
  async removeMember(companyId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('You cannot remove yourself from the company');
    }

    const target = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.companyUser.count({
        where: { companyId, role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the only admin');
      }
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
}
