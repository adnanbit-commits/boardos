import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddAgendaItemDto } from './dto/add-agenda-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/meetings')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  // GET /companies/:companyId/meetings
  @Get()
  findAll(@Param('companyId') companyId: string) {
    return this.meetingService.findAll(companyId);
  }

  // GET /companies/:companyId/meetings/:id
  @Get(':id')
  findOne(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.meetingService.findOne(companyId, id);
  }

  // POST /companies/:companyId/meetings
  @Post()
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateMeetingDto,
    @Req() req: any,
  ) {
    return this.meetingService.create(companyId, dto, req.user.userId);
  }

  // PATCH /companies/:companyId/meetings/:id
  @Patch(':id')
  update(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Req() req: any,
  ) {
    return this.meetingService.update(companyId, id, dto, req.user.userId);
  }

  // POST /companies/:companyId/meetings/:id/agenda
  @Post(':id/agenda')
  addAgendaItem(
    @Param('companyId') companyId: string,
    @Param('id') meetingId: string,
    @Body() dto: AddAgendaItemDto,
  ) {
    return this.meetingService.addAgendaItem(meetingId, dto);
  }

  // PATCH /companies/:companyId/meetings/:id/status/:status
  // Drives the workflow state machine
  @Patch(':id/status/:status')
  transition(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Param('status') status: string,
    @Req() req: any,
  ) {
    return this.meetingService.transition(companyId, id, status, req.user.userId);
  }
}


