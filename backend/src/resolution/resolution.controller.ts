// src/resolution/resolution.controller.ts
//
// All routes live under /companies/:companyId — CompanyGuard enforces
// membership for every endpoint. Role requirements are per-action:
//   ADMIN/DIRECTOR  → can create + manage resolutions
//   OBSERVER        → read-only
//   DIRECTOR+       → can open voting (requires meeting to be in correct state)

import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, HttpCode, Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { RequireRole } from '../company/decorators/require-role.decorator';
import { ResolutionService } from './resolution.service';
import { CreateResolutionDto } from './dto/create-resolution.dto';
import { UpdateResolutionDto } from './dto/update-resolution.dto';
import { BulkOpenVotingDto } from './dto/bulk-open-voting.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('companies/:companyId')
export class ResolutionController {
  constructor(private readonly resolutionService: ResolutionService) {}

  // ── List & Detail ───────────────────────────────────────────────────────────

  /**
   * GET /companies/:companyId/resolutions
   * Optional query: ?meetingId=xxx&status=VOTING
   */
  @Get('resolutions')
  findAll(
    @Param('companyId') companyId: string,
    @Query('meetingId') meetingId?: string,
    @Query('status') status?: string,
  ) {
    return this.resolutionService.findAll(companyId, { meetingId, status });
  }

  /**
   * GET /companies/:companyId/resolutions/:id
   * Full detail: resolution + votes + tally + certified copies
   */
  @Get('resolutions/:id')
  findOne(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.resolutionService.findOne(companyId, id);
  }

  /**
   * GET /companies/:companyId/meetings/:meetingId/resolutions
   * Resolutions grouped under a specific meeting — used by the meeting workspace
   */
  @Get('meetings/:meetingId/resolutions')
  findByMeeting(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.resolutionService.findByMeeting(companyId, meetingId);
  }

  // ── Create & Edit ───────────────────────────────────────────────────────────

  /**
   * POST /companies/:companyId/meetings/:meetingId/resolutions
   * Creates a resolution under a specific meeting (and optionally an agenda item)
   */
  @Post('meetings/:meetingId/resolutions')
  @RequireRole('DIRECTOR')
  create(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateResolutionDto,
    @Req() req: any,
  ) {
    return this.resolutionService.create(companyId, meetingId, dto, req.user.userId);
  }

  /**
   * PATCH /companies/:companyId/resolutions/:id
   * Only allowed while resolution is in DRAFT or PROPOSED status
   */
  @Patch('resolutions/:id')
  @RequireRole('DIRECTOR')
  update(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateResolutionDto,
    @Req() req: any,
  ) {
    return this.resolutionService.update(companyId, id, dto, req.user.userId);
  }

  /**
   * DELETE /companies/:companyId/resolutions/:id
   * Only allowed in DRAFT status — once proposed it must be rejected, not deleted
   */
  @Delete('resolutions/:id')
  @RequireRole('ADMIN')
  @HttpCode(204)
  remove(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.resolutionService.remove(companyId, id, req.user.userId);
  }

  // ── Status Transitions ──────────────────────────────────────────────────────

  /**
   * PATCH /companies/:companyId/resolutions/:id/propose
   * DRAFT → PROPOSED: marks resolution ready for the meeting, not yet open for votes
   */
  @Patch('resolutions/:id/propose')
  @RequireRole('DIRECTOR')
  propose(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.resolutionService.transition(companyId, id, 'PROPOSED', req.user.userId);
  }

  /**
   * PATCH /companies/:companyId/resolutions/:id/open-voting
   * PROPOSED → VOTING: opens the resolution for director votes + notifies all directors
   * Requires the parent meeting to be in VOTING status
   */
  @Patch('resolutions/:id/open-voting')
  @RequireRole('DIRECTOR')
  openVoting(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.resolutionService.openVoting(companyId, id, req.user.userId);
  }

  /**
   * POST /companies/:companyId/meetings/:meetingId/resolutions/bulk-open-voting
   * Opens ALL proposed resolutions in a meeting for voting simultaneously
   * This is the typical chairman action at the start of the voting phase
   */
  @Post('meetings/:meetingId/resolutions/bulk-open-voting')
  @RequireRole('DIRECTOR')
  bulkOpenVoting(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: BulkOpenVotingDto,
    @Req() req: any,
  ) {
    return this.resolutionService.bulkOpenVoting(companyId, meetingId, dto, req.user.userId);
  }

  /**
   * PATCH /companies/:companyId/resolutions/:id/withdraw
   * PROPOSED → DRAFT: pull a resolution back before voting starts
   */
  @Patch('resolutions/:id/withdraw')
  @RequireRole('ADMIN')
  withdraw(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.resolutionService.transition(companyId, id, 'DRAFT', req.user.userId);
  }
}
