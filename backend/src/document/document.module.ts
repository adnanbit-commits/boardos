// src/document/document.module.ts

import { Module }             from '@nestjs/common';
import { DocumentService }    from './document.service';
import { DocumentController } from './document.controller';
import { AuditModule }        from '../audit/audit.module';
import { StorageModule }      from '../storage/storage.module';

@Module({
  imports:     [AuditModule, StorageModule],
  controllers: [DocumentController],
  providers:   [DocumentService],
  exports:     [DocumentService],
})
export class DocumentModule {}
