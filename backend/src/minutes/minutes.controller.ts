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

  // POST — generate minutes from meeting data (CS/PARTNER and above)
  @Post()
  @RequireRole('PARTNER')
  generate(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.generate(companyId, meetingId, req.user.userId);
  }

  // POST /sign — role gate is PARTNER+; real gate is isChairman check in service
  // This allows a chairman who is a DIRECTOR role to be promoted to PARTNER
  // and still sign — or a PARTNER CS to sign on chairman's behalf if isChairman=true
  @Post('sign')
  @RequireRole('PARTNER')
  sign(
    @Param('companyId') companyId: string,
    @Param('meetingId') meetingId: string,
    @Request() req: any,
  ) {
    return this.minutes.sign(companyId, meetingId, req.user.userId);
  }
}
