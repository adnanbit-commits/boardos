import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import { MeetingTemplateService, CreateTemplateDto } from './meeting-template.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../auth/role.guard';

@Controller('companies/:companyId/meeting-templates')
@UseGuards(JwtAuthGuard)
export class MeetingTemplateController {
  constructor(private readonly service: MeetingTemplateService) {}

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.service.list(companyId);
  }

  @Post()
  @RequireRole('DIRECTOR')
  create(
    @Param('companyId') companyId: string,
    @Body() body: CreateTemplateDto,
  ) {
    return this.service.create(companyId, body);
  }

  @Patch(':id')
  @RequireRole('DIRECTOR')
  update(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() body: Partial<CreateTemplateDto>,
  ) {
    return this.service.update(companyId, id, body);
  }

  @Delete(':id')
  @RequireRole('DIRECTOR')
  @HttpCode(204)
  remove(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id);
  }

  @Post(':id/use')
  @HttpCode(200)
  recordUsage(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.service.recordUsage(companyId, id);
  }
}
