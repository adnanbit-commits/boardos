// src/company/company.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from './guards/company.guard';
import { RequireRole } from './decorators/require-role.decorator';
import { CompanyService } from './company.service';
import { InviteService } from './invite.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InviteDirectorDto } from './dto/invite-director.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

// All routes below /companies/:companyId/* go through JwtAuthGuard first,
// then CompanyGuard verifies the user is a member of that specific company.

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly inviteService: InviteService,
  ) {}

  // ── Company CRUD ────────────────────────────────────────────────────────────

  /** List all companies the authenticated user belongs to */
  @Get()
  listMyCompanies(@Req() req: any) {
    return this.companyService.listForUser(req.user.userId);
  }

  /** Create a new company workspace — caller becomes ADMIN + Chairman */
  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req: any) {
    return this.companyService.create(dto, req.user.userId);
  }

  /** Get full company detail — members only */
  @Get(':companyId')
  @UseGuards(CompanyGuard)
  findOne(@Param('companyId') companyId: string) {
    return this.companyService.findOne(companyId);
  }

  /** Update company profile — ADMIN only */
  @Patch(':companyId')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyDto,
    @Req() req: any,
  ) {
    return this.companyService.update(companyId, dto, req.user.userId);
  }

  // ── Members ─────────────────────────────────────────────────────────────────

  /** List all members of a company with their roles */
  @Get(':companyId/members')
  @UseGuards(CompanyGuard)
  listMembers(@Param('companyId') companyId: string) {
    return this.companyService.listMembers(companyId);
  }

  /** Update a member's role or chairman status — ADMIN only */
  @Patch(':companyId/members/:userId')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  updateMemberRole(
    @Param('companyId') companyId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: any,
  ) {
    return this.companyService.updateMemberRole(companyId, targetUserId, dto, req.user.userId);
  }

  /** Remove a member from the company — ADMIN only */
  @Delete(':companyId/members/:userId')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  @HttpCode(204)
  removeMember(
    @Param('companyId') companyId: string,
    @Param('userId') targetUserId: string,
    @Req() req: any,
  ) {
    return this.companyService.removeMember(companyId, targetUserId, req.user.userId);
  }

  // ── Invitations ──────────────────────────────────────────────────────────────

  /** Send an invite email to a new director — ADMIN only */
  @Post(':companyId/invitations')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  invite(
    @Param('companyId') companyId: string,
    @Body() dto: InviteDirectorDto,
    @Req() req: any,
  ) {
    return this.inviteService.sendInvite(companyId, dto, req.user.userId);
  }

  /** List all pending invitations for a company */
  @Get(':companyId/invitations')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  listInvitations(@Param('companyId') companyId: string) {
    return this.inviteService.listPending(companyId);
  }

  /** Cancel / revoke a pending invitation */
  @Delete(':companyId/invitations/:invitationId')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  @HttpCode(204)
  revokeInvitation(
    @Param('companyId') companyId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.inviteService.revoke(companyId, invitationId);
  }

  // ── Public invite acceptance (no CompanyGuard — user isn't a member yet) ───

  /** Preview an invite by token — public, no auth needed (returns company + role info) */
  @Public()
  @Get('invitations/:token')
  @HttpCode(200)
  previewInvite(@Param('token') token: string) {
    return this.inviteService.preview(token);
  }

  /** Accept an invite via token — adds the user to the company */
  @Post('invitations/:token/accept')
  @HttpCode(200)
  acceptInvite(@Param('token') token: string, @Req() req: any) {
    return this.inviteService.accept(token, req.user.userId);
  }

  // ── Audit ───────────────────────────────────────────────────────────────────

  /** Full audit trail for a company */
  @Get(':companyId/audit')
  @UseGuards(CompanyGuard)
  @RequireRole('ADMIN')
  getAuditLog(
    @Param('companyId') companyId: string,
    @Req() req: any,
  ) {
    return this.companyService.getAuditLog(companyId);
  }
}
