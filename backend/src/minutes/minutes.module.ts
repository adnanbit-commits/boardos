// src/minutes/minutes.module.ts

import { Module }             from '@nestjs/common';
import { MinutesService }     from './minutes.service';
import { MinutesController }  from './minutes.controller';
import { AuditModule }        from '../audit/audit.module';
import { StorageModule }      from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports:     [AuditModule, StorageModule, NotificationModule],
  controllers: [MinutesController],
  providers:   [MinutesService],
  exports:     [MinutesService],
})
export class MinutesModule {}
