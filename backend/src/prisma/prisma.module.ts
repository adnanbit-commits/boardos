// src/prisma/prisma.module.ts

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()   // Registers PrismaService as globally available — no need to import PrismaModule elsewhere
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
