// backend/src/archive/archive.module.ts

import { Module }            from '@nestjs/common';
import { ArchiveService }    from './archive.service';
import { ArchiveController } from './archive.controller';
import { DocumentModule }    from '../document/document.module';
import { AuditModule }       from '../audit/audit.module';
import { CompanyModule }     from '../company/company.module';

@Module({
  imports:     [DocumentModule, AuditModule, CompanyModule],
  providers:   [ArchiveService],
  controllers: [ArchiveController],
  exports:     [ArchiveService],
})
export class ArchiveModule {}
