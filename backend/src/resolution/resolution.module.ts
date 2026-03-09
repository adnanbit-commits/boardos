// src/resolution/resolution.module.ts
import { Module } from '@nestjs/common';
import { ResolutionController } from './resolution.controller';
import { ResolutionService } from './resolution.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    NotificationModule,
    CompanyModule, // for CompanyGuard + CompanyService
  ],
  controllers: [ResolutionController],
  providers: [ResolutionService],
  exports: [ResolutionService], // VotingModule + MinutesModule both consume this
})
export class ResolutionModule {}
