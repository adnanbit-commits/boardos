import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { JwtAuthGuard }        from '../auth/jwt-auth.guard';
import { CompanyGuard }        from '../company/guards/company.guard';
import { RequireRole, RequireWorkspaceAdmin } from '../company/decorators/require-role.decorator';
import { MeetingService }      from './meeting.service';
import { CreateMeetingDto }    from './dto/create-meeting.dto';
import { UpdateMeetingDto }    from './dto/update-meeting.dto';
import { AddAgendaItemDto }    from './dto/add-agenda-item.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('companies/:companyId/meetings')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Get()
  findAll(@Param('companyId') companyId: string) {
    return this.meetingService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.meetingService.findOne(companyId, id);
  }

  @Post()
  @RequireRole('DIRECTOR')
  create(@Param('companyId') companyId: string, @Body() dto: CreateMeetingDto, @Req() req: any) {
    return this.meetingService.create(companyId, dto, req.user.userId);
  }

  @Patch(':id')
  @RequireRole('DIRECTOR')
  update(@Param('companyId') companyId: string, @Param('id') id: string, @Body() dto: UpdateMeetingDto, @Req() req: any) {
    return this.meetingService.update(companyId, id, dto, req.user.userId);
  }

  @Delete(':id')
  @RequireWorkspaceAdmin()
  remove(@Param('companyId') companyId: string, @Param('id') id: string, @Req() req: any) {
    return this.meetingService.remove(companyId, id, req.user.userId);
  }

  @Post(':id/agenda')
  @RequireRole('DIRECTOR')
  addAgendaItem(@Param('companyId') companyId: string, @Param('id') meetingId: string, @Body() dto: AddAgendaItemDto) {
    return this.meetingService.addAgendaItem(companyId, meetingId, dto);
  }

  @Post(':id/agenda/propose-aob')
  @RequireRole('DIRECTOR')
  proposeAobItem(
    @Param('companyId') companyId: string,
    @Param('id') meetingId: string,
    @Body() dto: { title: string; description?: string },
    @Req() req: any,
  ) {
    return this.meetingService.proposeAobItem(companyId, meetingId, dto, req.user.userId);
  }

  @Patch(':id/agenda/:itemId/admit')
  @RequireRole('DIRECTOR')
  admitAobItem(
    @Param('companyId') companyId: string,
    @Param('id') meetingId: string,
    @Param('itemId') itemId: string,
    @Req() req: any,
  ) {
    return this.meetingService.admitAobItem(companyId, meetingId, itemId, req.user.userId);
  }

  @Patch(':id/status/:status')
  @RequireRole('DIRECTOR')
  transition(@Param('companyId') companyId: string, @Param('id') id: string, @Param('status') status: string, @Req() req: any) {
    return this.meetingService.transition(companyId, id, status, req.user.userId);
  }

  // ── Chairperson nomination flow ────────────────────────────────────────────
  // Three-step: nominate → confirm → elect
  // All state is persisted to DB so every director's browser shows the same
  // pending nomination on reload — no local-state-only flows.

  // GET current nomination state (nominee, who proposed, who confirmed, majority status)
  @Get(':id/chairperson/nomination')
  getNomination(@Param('companyId') companyId: string, @Param('id') meetingId: string) {
    return this.meetingService.getNomination(companyId, meetingId);
  }

  // POST — any director nominates a colleague (or themselves)
  @Post(':id/chairperson/nominate')
  @RequireRole('DIRECTOR')
  nominateChairperson(
    @Param('companyId') companyId: string, @Param('id') meetingId: string,
    @Body() body: { nomineeId: string }, @Req() req: any,
  ) {
    return this.meetingService.nominateChairperson(companyId, meetingId, body.nomineeId, req.user.userId);
  }

  // POST — any director confirms the pending nomination
  @Post(':id/chairperson/confirm')
  @HttpCode(200)
  @RequireRole('DIRECTOR')
  confirmChairperson(
    @Param('companyId') companyId: string, @Param('id') meetingId: string, @Req() req: any,
  ) {
    return this.meetingService.confirmChairperson(companyId, meetingId, req.user.userId);
  }

  // POST — finalise election once majority confirmed (any director can call)
  @Post(':id/chairperson')
  @RequireRole('DIRECTOR')
  electChairperson(
    @Param('companyId') companyId: string, @Param('id') meetingId: string,
    @Body() body: { chairpersonId: string }, @Req() req: any,
  ) {
    return this.meetingService.electChairperson(companyId, meetingId, body.chairpersonId, req.user.userId);
  }

  @Post(':id/recorder')
  @RequireRole('DIRECTOR')
  setMinutesRecorder(
    @Param('companyId') companyId: string, @Param('id') meetingId: string,
    @Body() body: { recorderId: string }, @Req() req: any,
  ) {
    return this.meetingService.setMinutesRecorder(companyId, meetingId, body.recorderId, req.user.userId);
  }

  // ── First meeting flag ──────────────────────────────────────────────────────

  @Post(':id/mark-first-meeting')
  @RequireRole('DIRECTOR')
  markAsFirstMeeting(
    @Param('companyId') companyId: string, @Param('id') meetingId: string, @Req() req: any,
  ) {
    return this.meetingService.markAsFirstMeeting(companyId, meetingId, req.user.userId);
  }

  // ── Notice acknowledgement ──────────────────────────────────────────────────

  @Post(':id/acknowledge-notice')
  @HttpCode(200)
  acknowledgeNotice(
    @Param('companyId') companyId: string, @Param('id') meetingId: string, @Req() req: any,
  ) {
    return this.meetingService.acknowledgeNotice(companyId, meetingId, req.user.userId);
  }

  // ── Declarations (DIR-2, DIR-8, MBP-1) — legacy, kept for data ────────────

  @Get(':id/declarations')
  getDeclarations(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.meetingService.getDeclarations(companyId, id);
  }

  @Post(':id/declarations')
  @RequireRole('DIRECTOR')
  recordDeclaration(
    @Param('companyId') companyId: string, @Param('id') id: string,
    @Body() body: { userId: string; formType: 'DIR_2' | 'DIR_8' | 'MBP_1'; received: boolean; notes?: string },
    @Req() req: any,
  ) {
    return this.meetingService.recordDeclaration(companyId, id, body, req.user.userId);
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  @Get(':id/attendance')
  getAttendance(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.meetingService.getAttendance(companyId, id);
  }

  @Post(':id/attendance')
  @RequireRole('DIRECTOR')
  recordAttendance(
    @Param('companyId') companyId: string, @Param('id') id: string,
    @Req() req: any,
    @Body() body: { userId: string; mode: 'IN_PERSON' | 'VIDEO' | 'PHONE' | 'ABSENT'; location?: string; noThirdParty?: boolean },
  ) {
    return this.meetingService.recordAttendance(
      companyId, id, req.user.userId, body.userId, body.mode,
      body.location, body.noThirdParty,
    );
  }

}
