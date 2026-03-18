// src/app.module.ts
// Root module — registers all feature modules and global providers

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './auth/auth.module';
import { CompanyModule } from './company/company.module';
import { MeetingModule } from './meeting/meeting.module';
import { MeetingTemplateModule } from './meeting-template/meeting-template.module';
import { VaultModule } from './vault/vault.module';
import { ResolutionModule } from './resolution/resolution.module';
import { VotingModule } from './voting/voting.module';
import { MinutesModule } from './minutes/minutes.module';
import { DocumentModule } from './document/document.module';
import { ArchiveModule } from './archive/archive.module';
import { AuditModule } from './audit/audit.module';
import { NotificationModule } from './notification/notification.module';
import { CinModule } from './cin/cin.module';
import { CircularModule } from './circular/circular.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    // Load env vars globally — all modules can use ConfigService
    ConfigModule.forRoot({ isGlobal: true }),

    // Redis-backed queue for async jobs (notifications, PDF generation)
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),

    PrismaModule,
    RealtimeModule,
    AuthModule,
    CompanyModule,
    MeetingModule,
    MeetingTemplateModule,
    VaultModule,
    ResolutionModule,
    VotingModule,
    MinutesModule,
    DocumentModule,
    ArchiveModule,
    AuditModule,
    NotificationModule,
    CinModule,
    CircularModule,
  ],
})
export class AppModule {}
