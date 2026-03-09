// ─── audit/audit.service.ts ───────────────────────────────────────────────────
// Append-only audit trail. Every critical action in the system calls this.
// Logs are NEVER updated or deleted — enforced at DB level via lack of update methods.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogParams {
  companyId?: string;
  userId?: string;
  action: string;         // e.g. 'VOTE_CAST', 'MINUTES_SIGNED'
  entity: string;         // e.g. 'Resolution', 'Meeting'
  entityId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        userId:    params.userId,
        action:    params.action,
        entity:    params.entity,
        entityId:  params.entityId,
        metadata:  params.metadata,
        ipAddress: params.ipAddress,
      },
    });
  }

  // Read audit trail for a company (paginated)
  async getCompanyLog(companyId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where: { companyId } }),
    ]);
    return { logs, total, page, pages: Math.ceil(total / limit) };
  }

  // Read audit trail for a specific entity (e.g. all events on a resolution)
  async getEntityLog(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true } } },
    });
  }
}
