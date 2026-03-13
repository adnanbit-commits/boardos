import { Module } from '@nestjs/common';
import { MeetingTemplateController } from './meeting-template.controller';
import { MeetingTemplateService } from './meeting-template.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MeetingTemplateController],
  providers: [MeetingTemplateService],
  exports: [MeetingTemplateService],
})
export class MeetingTemplateModule {}
