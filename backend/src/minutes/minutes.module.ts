// src/minutes/minutes.module.ts

import { Module }           from '@nestjs/common';
import { MinutesService }   from './minutes.service';
import { MinutesController } from './minutes.controller';
import { AuditModule }      from '../audit/audit.module';

@Module({
  imports:     [AuditModule],
  controllers: [MinutesController],
  providers:   [MinutesService],
  exports:     [MinutesService],
})
export class MinutesModule {}
