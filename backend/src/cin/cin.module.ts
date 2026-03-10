// src/cin/cin.module.ts

import { Module } from '@nestjs/common';
import { CinController } from './cin.controller';
import { CinService } from './cin.service';

@Module({
  controllers: [CinController],
  providers:   [CinService],
  exports:     [CinService],
})
export class CinModule {}
