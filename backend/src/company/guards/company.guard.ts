// src/company/guards/company.guard.ts
//
// Applied to every route under /companies/:companyId/*.
// Checks two things:
//   1. The authenticated user is a member of that company (tenant isolation)
//   2. (Optional) The user satisfies a role requirement via decorators:
//
//      @RequireWorkspaceAdmin()    — isWorkspaceAdmin flag (invite, settings, transfer)
//      @RequireRole('DIRECTOR')    — exact DIRECTOR role (voting, signing resolutions)
//      @RequireRole('PARTICIPANT') — DIRECTOR or COMPANY_SECRETARY (meeting management)
//      No decorator                — any member can access (AUDITOR, OBSERVER included)

import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REQUIRE_ROLE_KEY,
  REQUIRE_WORKSPACE_ADMIN_KEY,
} from '../decorators/require-role.decorator';
import { UserRole } from '@prisma/client';

// Roles that can take active actions in meetings
const PARTICIPANT_ROLES: UserRole[] = [UserRole.DIRECTOR, UserRole.COMPANY_SECRETARY];

@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId    = req.user?.userId;
    const companyId = req.params?.companyId;

    if (!companyId) return true; // Route doesn't carry :companyId — skip

    // ── 1. Membership check (tenant isolation) ─────────────────────────────
    const membership = await this.prisma.companyUser.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this company');
    }

    // Attach to request — services can use it without re-querying
    req.membership = membership;

    // ── 2. Workspace admin check ───────────────────────────────────────────
    const requiresAdmin = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_WORKSPACE_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiresAdmin && !membership.isWorkspaceAdmin) {
      throw new ForbiddenException(
        'This action requires workspace admin privileges.',
      );
    }

    // ── 3. Role check ──────────────────────────────────────────────────────
    const requiredRole = this.reflector.getAllAndOverride<string>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRole) {
      if (requiredRole === 'PARTICIPANT') {
        // DIRECTOR or COMPANY_SECRETARY — meeting management, minutes, declarations
        if (!PARTICIPANT_ROLES.includes(membership.role as UserRole)) {
          throw new ForbiddenException(
            'This action requires Director or Company Secretary role.',
          );
        }
      } else if (requiredRole === 'DIRECTOR') {
        // Exact match — voting, signing resolutions, electing chairperson
        if (membership.role !== UserRole.DIRECTOR) {
          throw new ForbiddenException(
            'This action requires Director role.',
          );
        }
      } else {
        // Explicit role — exact match
        if (membership.role !== requiredRole) {
          throw new ForbiddenException(
            `This action requires the ${requiredRole} role. You are a ${membership.role}.`,
          );
        }
      }
    }

    return true;
  }
}
