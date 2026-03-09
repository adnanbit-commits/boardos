// src/audit/audit.module.ts

import { Global, Module } from '@nestjs/common';
import { AuditService }   from './audit.service';

// @Global so every module can inject AuditService without explicitly importing AuditModule.
// This is safe because audit logging is a cross-cutting concern used everywhere.
@Global()
@Module({
  providers: [AuditService],
  exports:   [AuditService],
})
export class AuditModule {}
