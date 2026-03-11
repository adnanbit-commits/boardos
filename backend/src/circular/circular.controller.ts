import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard }   from '../auth/jwt-auth.guard';
import { CircularService, CreateCircularDto, SignCircularDto } from './circular.service';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/circular-resolutions')
export class CircularController {
  constructor(private readonly circular: CircularService) {}

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.circular.list(companyId);
  }

  @Get(':id')
  findOne(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.circular.findOne(companyId, id);
  }

  @Post()
  create(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @Body() body: CreateCircularDto,
  ) {
    return this.circular.create(companyId, req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: Partial<CreateCircularDto>,
  ) {
    return this.circular.update(companyId, id, req.user.userId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.circular.remove(companyId, id, req.user.userId);
  }

  @Post(':id/circulate')
  @HttpCode(HttpStatus.OK)
  circulate(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.circular.circulate(companyId, id, req.user.userId);
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  sign(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: SignCircularDto,
  ) {
    return this.circular.sign(companyId, id, req.user.userId, body);
  }

  @Post(':id/request-meeting')
  @HttpCode(HttpStatus.OK)
  requestMeeting(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.circular.requestMeeting(companyId, id, req.user.userId);
  }

  @Post(':id/mark-noted')
  @HttpCode(HttpStatus.OK)
  markNoted(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { meetingId: string },
  ) {
    return this.circular.markNoted(companyId, id, body.meetingId, req.user.userId);
  }
}
