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

  // GET — any member can read minutes
  @Get()
  findOne(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.minutes.findByMeeting(companyId, meetingId);
  }

  // POST — generate minutes HTML (PARTICIPANT = DIRECTOR or CS)
  @Post()
  @RequireRole('PARTICIPANT')
  generate(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.generate(companyId, meetingId, req.user.userId);
  }

  // POST /sign — sign minutes with SHA-256 hash
  @Post('sign')
  @RequireRole('PARTICIPANT')
  sign(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.sign(companyId, meetingId, req.user.userId);
  }

  // POST /export — render minutes to PDF via Puppeteer, upload to GCS, return download URL
  // Available to any meeting member so the signed PDF can be distributed.
  @Post('export')
  exportPdf(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.exportPdf(companyId, meetingId, req.user.userId);
  }
}
