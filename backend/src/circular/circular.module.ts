// src/circular/circular.module.ts

import { Module }              from '@nestjs/common';
import { CircularController }  from './circular.controller';
import { CircularService }     from './circular.service';
import { PrismaModule }        from '../prisma/prisma.module';
import { AuditModule }         from '../audit/audit.module';
import { NotificationModule }  from '../notification/notification.module';

@Module({
  imports:     [PrismaModule, AuditModule, NotificationModule],
  controllers: [CircularController],
  providers:   [CircularService],
})
export class CircularModule {}
