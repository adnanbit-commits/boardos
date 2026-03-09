// src/document/document.module.ts

import { Module }             from '@nestjs/common';
import { DocumentService }    from './document.service';
import { DocumentController } from './document.controller';
import { AuditModule }        from '../audit/audit.module';

@Module({
  imports:     [AuditModule],
  controllers: [DocumentController],
  providers:   [DocumentService],
  exports:     [DocumentService],   // ArchiveService needs this
})
export class DocumentModule {}
