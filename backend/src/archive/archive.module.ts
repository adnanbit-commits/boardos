// backend/src/archive/archive.module.ts

import { Module }            from '@nestjs/common';
import { ArchiveService }    from './archive.service';
import { ArchiveController } from './archive.controller';
import { DocumentModule }    from '../document/document.module';
import { AuditModule }       from '../audit/audit.module';

@Module({
  imports:     [DocumentModule, AuditModule],
  providers:   [ArchiveService],
  controllers: [ArchiveController],
  exports:     [ArchiveService],
})
export class ArchiveModule {}
