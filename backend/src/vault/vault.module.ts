import { Module } from '@nestjs/common';
import {
  VaultController,
  ComplianceController,
  MeetingDocController,
  MeetingShareController,
  DocNotesController,
} from './vault.controller';
import { PublicMeetingController } from './public-meeting.controller';
import { VaultService } from './vault.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, StorageModule, AuditModule],
  controllers: [
    VaultController,
    ComplianceController,
    MeetingDocController,
    MeetingShareController,
    DocNotesController,
    PublicMeetingController,
  ],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
