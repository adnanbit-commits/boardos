// src/company/guards/company.guard.ts
//
// Applied to every route under /companies/:companyId/*.
// Checks two things:
//   1. The authenticated user is a member of that company
//   2. (Optional) The user holds the required role — via @RequireRole()
//
// This is what prevents data leaks across tenants.

import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { UserRole } from '@prisma/client';

// Role hierarchy — higher index = more permissions
const ROLE_RANK: Record<UserRole, number> = {
  OBSERVER: 0,
  DIRECTOR: 1,
  PARTNER:  2,
  ADMIN:    3,
};

@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId;
    const companyId = req.params?.companyId;

    if (!companyId) return true; // Route doesn't have :companyId — skip

    // Fetch membership record
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this company');
    }

    // Attach membership to request — services can use it without re-querying
    req.membership = membership;

    // Check role requirement from @RequireRole() decorator, if present
    const requiredRole = this.reflector.getAllAndOverride<UserRole>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRole) {
      const userRank = ROLE_RANK[membership.role];
      const requiredRank = ROLE_RANK[requiredRole];

      if (userRank < requiredRank) {
        throw new ForbiddenException(
          `This action requires the ${requiredRole} role. You are a ${membership.role}.`,
        );
      }
    }

    return true;
  }
}
