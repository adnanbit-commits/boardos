// src/company/company.module.ts
import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { InviteService } from './invite.service';
import { CompanyGuard } from './guards/company.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule],
  controllers: [CompanyController],
  providers: [CompanyService, InviteService, CompanyGuard],
  // Export both services + guard so other modules (Meeting, Voting, etc.) can use them
  exports: [CompanyService, InviteService, CompanyGuard],
})
export class CompanyModule {}
