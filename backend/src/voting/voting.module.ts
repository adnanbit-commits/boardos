
import { Module } from '@nestjs/common';
import { VotingController } from './voting.controller';
import { VotingService } from './voting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule],
  controllers: [VotingController],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}


