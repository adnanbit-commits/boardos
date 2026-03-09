// src/minutes/minutes.controller.ts

import {
  Controller, Get, Post, Param, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard }   from '../auth/jwt-auth.guard';
import { CompanyGuard }   from '../company/guards/company.guard';
import { RequireRole }    from '../company/decorators/require-role.decorator';
import { MinutesService } from './minutes.service';

@Controller('companies/:companyId/meetings/:meetingId/minutes')
@UseGuards(JwtAuthGuard, CompanyGuard)
export class MinutesController {
  constructor(private readonly minutes: MinutesService) {}

  // GET — fetch existing minutes for a meeting
  @Get()
  findOne(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.minutes.findByMeeting(companyId, meetingId);
  }

  // POST — auto-generate minutes from meeting data (admin only)
  @Post()
  @RequireRole('ADMIN')
  generate(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.generate(companyId, meetingId, req.user.userId);
  }

  // POST /sign — chairman signs, freezes content, records SHA-256 hash
  @Post('sign')
  @RequireRole('ADMIN')
  sign(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.sign(companyId, meetingId, req.user.userId);
  }
}
